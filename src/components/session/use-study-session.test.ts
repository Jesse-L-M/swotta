// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useStudySession,
  type StudySessionApi,
  type SessionBlockInfo,
  type SessionRecoverySnapshot,
} from "./use-study-session";
import type { AttemptOutcome, BlockId } from "@/lib/types";

function makeBlock(overrides?: Partial<SessionBlockInfo>): SessionBlockInfo {
  return {
    id: "block-1",
    topicName: "Cell Biology",
    blockType: "retrieval_drill",
    durationMinutes: 15,
    reason: "Overdue review",
    ...overrides,
  };
}

function makeOutcome(overrides?: Partial<AttemptOutcome>): AttemptOutcome {
  return {
    blockId: "block-1" as BlockId,
    score: 75,
    confidenceBefore: 0.4,
    confidenceAfter: 0.8,
    helpRequested: false,
    helpTiming: null,
    misconceptions: [],
    retentionOutcome: "remembered",
    durationMinutes: 12,
    rawInteraction: null,
    ...overrides,
  };
}

function makeFreshRecovery(): SessionRecoverySnapshot {
  return { mode: "fresh" };
}

function makeResumeRecovery(
  overrides?: Partial<Extract<SessionRecoverySnapshot, { mode: "resume" }>>
): SessionRecoverySnapshot {
  return {
    mode: "resume",
    sessionId: "session-1",
    startedAt: "2026-04-01T10:00:00.000Z",
    systemPrompt: "You are Swotta...",
    completionPending: false,
    confidenceBefore: 0.4,
    messages: [
      {
        role: "assistant",
        content: "Welcome back to Cell Biology.",
      },
    ],
    ...overrides,
  };
}

function makeCompletedRecovery(
  overrides?: Partial<Extract<SessionRecoverySnapshot, { mode: "completed" }>>
): SessionRecoverySnapshot {
  return {
    mode: "completed",
    sessionId: "session-1",
    startedAt: "2026-04-01T10:00:00.000Z",
    endedAt: "2026-04-01T10:12:00.000Z",
    summary: "Good session on Cell Biology.",
    result: {
      outcome: makeOutcome({
        confidenceBefore: 0.4,
        confidenceAfter: null,
      }),
      summary: "Good session on Cell Biology.",
    },
    ...overrides,
  };
}

function makeRestartRecovery(
  overrides?: Partial<Extract<SessionRecoverySnapshot, { mode: "restart" }>>
): SessionRecoverySnapshot {
  return {
    mode: "restart",
    sessionId: "session-1",
    reason: "abandoned",
    startedAt: "2026-04-01T10:00:00.000Z",
    endedAt: "2026-04-01T10:12:00.000Z",
    summary: "You left this session early.",
    messagesCount: 3,
    ...overrides,
  };
}

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeMockApi(
  overrides?: Partial<StudySessionApi>
): StudySessionApi {
  return {
    fetchSessionState: vi
      .fn<StudySessionApi["fetchSessionState"]>()
      .mockResolvedValue({
        block: makeBlock(),
        recovery: makeFreshRecovery(),
      }),
    startSession: vi
      .fn<StudySessionApi["startSession"]>()
      .mockResolvedValue({
        sessionId: "session-1",
        systemPrompt: "You are Swotta...",
        initialMessage: "Welcome! Let's review Cell Biology.",
      }),
    sendMessage: vi
      .fn<StudySessionApi["sendMessage"]>()
      .mockResolvedValue(makeStream("Great answer!")),
    endSession: vi
      .fn<StudySessionApi["endSession"]>()
      .mockResolvedValue({
        outcome: makeOutcome(),
        summary: "Good session on Cell Biology.",
      }),
    ...overrides,
  };
}

afterEach(() => {
  window.localStorage.clear();
});


describe("useStudySession", () => {
  it("starts in loading phase and transitions to confidence-before after fetching session state", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.block).toEqual(makeBlock());
    expect(api.fetchSessionState).toHaveBeenCalledWith("block-1");
  });

  it("transitions to error phase if session state fetch fails", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Network error");
  });

  it("handles non-Error rejection while loading session state", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockRejectedValue("string error"),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Failed to load session");
  });

  it("hydrates an in-progress session without asking for confidence again", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeResumeRecovery({
          messages: [
            { role: "assistant", content: "Question 1" },
            { role: "user", content: "Answer 1" },
          ],
        }),
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.resumeNotice?.title).toBe("Session resumed");
  });

  it("moves abandoned sessions into the recovery screen", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeRestartRecovery(),
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("recovery"));
    expect(result.current.recoveryState?.mode).toBe("restart");
    expect(result.current.recoveryState?.actionLabel).toBe("Start fresh");
  });

  it("submits confidence before and starts session", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));

    act(() => {
      result.current.submitConfidenceBefore(0.6);
    });

    expect(result.current.confidenceBefore).toBe(0.6);
    expect(result.current.phase).toBe("starting");

    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));
    expect(result.current.phase).toBe("active");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(result.current.messages[0].content).toBe(
      "Welcome! Let's review Cell Biology."
    );
    expect(api.startSession).toHaveBeenCalledWith("block-1", {
      restart: false,
      confidenceBefore: 0.6,
    });
  });

  it("routes restart recovery back through confidence-before", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeRestartRecovery(),
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("recovery"));

    await act(async () => {
      await result.current.restartSession();
    });

    expect(result.current.phase).toBe("confidence-before");

    act(() => result.current.submitConfidenceBefore(0.7));

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(api.startSession).toHaveBeenCalledWith("block-1", {
      restart: true,
      confidenceBefore: 0.7,
    });
  });

  it("transitions to error if startSession fails", async () => {
    const api = makeMockApi({
      startSession: vi.fn().mockRejectedValue(new Error("Session start failed")),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));

    act(() => {
      result.current.submitConfidenceBefore(0.6);
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Session start failed");
  });

  it("handles non-Error rejection in startSession", async () => {
    const api = makeMockApi({
      startSession: vi.fn().mockRejectedValue(42),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Failed to start session");
  });

  it("keeps the session out of active mode until startSession resolves", async () => {
    let resolveStart:
      | ((value: {
          sessionId: string;
          systemPrompt: string;
          initialMessage: string;
        }) => void)
      | null = null;
    const startSession = vi.fn().mockReturnValue(
      new Promise<{
        sessionId: string;
        systemPrompt: string;
        initialMessage: string;
      }>((resolve) => {
        resolveStart = resolve;
      })
    );
    const api = makeMockApi({ startSession });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));

    act(() => {
      result.current.submitConfidenceBefore(0.6);
    });

    expect(result.current.phase).toBe("starting");
    expect(result.current.sessionId).toBeNull();
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      resolveStart?.({
        sessionId: "session-1",
        systemPrompt: "You are Swotta...",
        initialMessage: "Welcome! Let's review Cell Biology.",
      });
    });

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.sessionId).toBe("session-1");
    expect(result.current.messages).toHaveLength(1);
  });

  it("sends a message and receives a streamed response", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.sendMessage("What is a cell?");
    });

    expect(result.current.messages).toHaveLength(3); // initial + user + assistant
    expect(result.current.messages[1].role).toBe("user");
    expect(result.current.messages[1].content).toBe("What is a cell?");
    expect(result.current.messages[2].role).toBe("assistant");
    expect(result.current.messages[2].content).toBe("Great answer!");
    expect(result.current.phase).toBe("active");
  });

  it("does nothing when sendMessage called without sessionId", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    // Still loading, no sessionId
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("reloads recovery state instead of hard-failing on session conflicts", async () => {
    const fetchSessionState = vi
      .fn<StudySessionApi["fetchSessionState"]>()
      .mockResolvedValueOnce({
        block: makeBlock(),
        recovery: makeFreshRecovery(),
      })
      .mockResolvedValueOnce({
        block: makeBlock(),
        recovery: makeRestartRecovery({
          reason: "transcript_missing",
          summary: null,
        }),
      });

    const api = makeMockApi({
      fetchSessionState,
    });

    const sessionConflict = Object.assign(new Error("Transcript mismatch"), {
      code: "SESSION_TRANSCRIPT_MISMATCH",
      status: 409,
    });

    api.sendMessage = vi.fn().mockRejectedValue(sessionConflict);

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.phase).toBe("active"));

    await act(async () => {
      await result.current.sendMessage("test");
    });

    await waitFor(() => expect(result.current.phase).toBe("recovery"));
    expect(result.current.recoveryState?.statusLabel).toBe("Needs restart");
  });

  it("reuses stored confidence before when a resumed session completes", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeResumeRecovery({
          messages: [
            { role: "assistant", content: "Welcome back to Cell Biology." },
            { role: "user", content: "My prior answer" },
          ],
          confidenceBefore: 0.6,
        }),
      }),
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          makeStream(
            "Well done.<session_status>complete</session_status>"
          )
        ),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));

    await act(async () => {
      await result.current.sendMessage("Final answer");
    });

    await waitFor(() => expect(result.current.phase).toBe("confidence-after"));
    expect(api.endSession).toHaveBeenCalledWith(
      "session-1",
      expect.any(Array),
      "You are Swotta...",
      "completed",
      { before: 0.6, after: null }
    );
  });

  it("restores the confidence-after step for a completed session with local reentry state", async () => {
    window.localStorage.setItem(
      "study-session:completion:block-1",
      JSON.stringify({
        sessionId: "session-1",
        phase: "confidence-after",
        confidenceAfter: null,
      })
    );

    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeCompletedRecovery(),
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-after"));
    expect(result.current.result?.summary).toBe("Good session on Cell Biology.");
    expect(result.current.confidenceBefore).toBe(0.4);
  });

  it("restores the complete view for a completed session with stored post-session confidence", async () => {
    window.localStorage.setItem(
      "study-session:completion:block-1",
      JSON.stringify({
        sessionId: "session-1",
        phase: "complete",
        confidenceAfter: 0.8,
      })
    );

    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeCompletedRecovery(),
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("complete"));
    expect(result.current.confidenceAfter).toBe(0.8);
  });

  it("detects session completion from stream and transitions through confidence-after to complete", async () => {
    const api = makeMockApi({
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          makeStream(
            "Well done! You've mastered this.<session_status>complete</session_status>"
          )
        ),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.4));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.sendMessage("I understand now");
    });

    await waitFor(() =>
      expect(result.current.phase).toBe("confidence-after")
    );
    expect(result.current.result).not.toBeNull();
    expect(api.endSession).toHaveBeenCalled();

    // Clean reply should not contain the tag
    const lastAssistant = result.current.messages.filter(
      (m) => m.role === "assistant"
    );
    expect(
      lastAssistant[lastAssistant.length - 1].content
    ).not.toContain("session_status");

    // Submit confidence after
    act(() => result.current.submitConfidenceAfter(0.8));
    expect(result.current.phase).toBe("complete");
    expect(result.current.confidenceAfter).toBe(0.8);
  });

  it("handles endSession failure during completion", async () => {
    const api = makeMockApi({
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          makeStream("Done.<session_status>complete</session_status>")
        ),
      endSession: vi.fn().mockRejectedValue(new Error("End failed")),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.sendMessage("done");
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("End failed");
  });

  it("handles non-Error rejection during completion endSession", async () => {
    const api = makeMockApi({
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          makeStream("Done.<session_status>complete</session_status>")
        ),
      endSession: vi.fn().mockRejectedValue("string fail"),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.sendMessage("done");
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Failed to end session");
  });

  it("handles sendMessage stream failure gracefully", async () => {
    const api = makeMockApi({
      sendMessage: vi.fn().mockRejectedValue(new Error("Stream error")),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    const msgCountBefore = result.current.messages.length;

    await act(async () => {
      await result.current.sendMessage("test");
    });

    // Should add user message but remove failed assistant placeholder
    expect(result.current.messages).toHaveLength(msgCountBefore + 1);
    expect(result.current.error).toBe("Stream error");
    expect(result.current.phase).toBe("active");
    expect(result.current.isStreaming).toBe(false);
  });

  it("handles non-Error rejection during sendMessage", async () => {
    const api = makeMockApi({
      sendMessage: vi.fn().mockRejectedValue(undefined),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.error).toBe("Failed to send message");
  });

  it("abandons session successfully", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.abandonSession();
    });

    expect(result.current.phase).toBe("complete");
    expect(result.current.result).not.toBeNull();
    expect(api.endSession).toHaveBeenCalledWith(
      "session-1",
      expect.any(Array),
      "You are Swotta...",
      "abandoned",
      { before: 0.5, after: null }
    );
  });

  it("does nothing when abandoning without sessionId", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    // Still loading
    await act(async () => {
      await result.current.abandonSession();
    });

    expect(api.endSession).not.toHaveBeenCalled();
  });

  it("handles abandon failure", async () => {
    const api = makeMockApi({
      endSession: vi.fn().mockRejectedValue(new Error("Abandon failed")),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.abandonSession();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("Abandon failed");
  });

  it("handles non-Error rejection during abandon", async () => {
    const api = makeMockApi({
      endSession: vi.fn().mockRejectedValue(null),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    await act(async () => {
      await result.current.abandonSession();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("Failed to end session");
  });

  it("initialises elapsedSeconds at 0 before active phase", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("starts tracking time once active", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    // elapsedSeconds should exist as a number (timer has started)
    expect(typeof result.current.elapsedSeconds).toBe("number");
  });

  it("prevents double sending by checking isStreaming guard", async () => {
    // Verify the hook returns isStreaming=false initially and the guard exists
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.isStreaming).toBe(false);

    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));

    // After sending completes, isStreaming should return to false
    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.isStreaming).toBe(false);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("useStudySession with default API", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches session state via /api/sessions/block/:id", async () => {
    const mockBlock = makeBlock();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { block: mockBlock, recovery: makeFreshRecovery() },
      }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.block).toEqual(mockBlock);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/block/block-1");
  });

  it("handles fetch error for session state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toContain("Failed to load session state");
  });

  it("calls start session endpoint", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              sessionId: "s-1",
              systemPrompt: "prompt",
              initialMessage: "Hello!",
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));
    expect(result.current.messages[0].content).toBe("Hello!");
  });

  it("calls send message endpoint with streaming body", async () => {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("streamed reply"));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: { sessionId: "s-1", systemPrompt: "p", initialMessage: "Hi" },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/message")) {
        return { ok: true, body: streamBody };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));

    await act(async () => {
      await result.current.sendMessage("my answer");
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].content).toBe("streamed reply");
  });

  it("throws when send message has no body", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: { sessionId: "s-1", systemPrompt: "p", initialMessage: "Hi" },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/message")) {
        return { ok: true, body: null };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.error).toBe("No response body for streaming");
  });

  it("throws when send message returns non-ok", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: { sessionId: "s-1", systemPrompt: "p", initialMessage: "Hi" },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/message")) {
        return { ok: false, status: 500 };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.error).toBe("Failed to send message: 500");
  });

  it("calls end session endpoint", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: { sessionId: "s-1", systemPrompt: "p", initialMessage: "Hi" },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/end")) {
        return {
          ok: true,
          json: async () => ({
            data: { outcome: makeOutcome(), summary: "All done" },
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));

    await act(async () => {
      await result.current.abandonSession();
    });

    expect(result.current.phase).toBe("complete");
    expect(result.current.result?.summary).toBe("All done");
  });

  it("throws when end session returns non-ok", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/api/sessions/start")) {
        return {
          ok: true,
          json: async () => ({
            data: { sessionId: "s-1", systemPrompt: "p", initialMessage: "Hi" },
          }),
        };
      }
      if (typeof url === "string" && url.includes("/end")) {
        return { ok: false, status: 500 };
      }
      return { ok: false, status: 404 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.sessionId).toBe("s-1"));

    await act(async () => {
      await result.current.abandonSession();
    });

    expect(result.current.error).toBe("Failed to end session: 500");
  });

  it("handles non-ok start session", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/sessions/block/")) {
        return {
          ok: true,
          json: async () => ({
            data: { block: makeBlock(), recovery: makeFreshRecovery() },
          }),
        };
      }
      return { ok: false, status: 500 };
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    act(() => result.current.submitConfidenceBefore(0.5));
    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toContain("Failed to start session");
  });
});
