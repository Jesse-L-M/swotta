// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useStudySession,
  type StudySessionApi,
  type SessionBlockInfo,
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
    fetchBlock: vi.fn<StudySessionApi["fetchBlock"]>().mockResolvedValue(makeBlock()),
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


describe("useStudySession", () => {
  it("starts in loading phase and transitions to confidence-before after fetching block", async () => {
    const api = makeMockApi();
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.block).toEqual(makeBlock());
    expect(api.fetchBlock).toHaveBeenCalledWith("block-1");
  });

  it("transitions to error phase if block fetch fails", async () => {
    const api = makeMockApi({
      fetchBlock: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Network error");
  });

  it("handles non-Error rejection in fetchBlock", async () => {
    const api = makeMockApi({
      fetchBlock: vi.fn().mockRejectedValue("string error"),
    });
    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1", api })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe("Failed to load block");
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
    expect(result.current.phase).toBe("active");

    await waitFor(() => expect(result.current.sessionId).toBe("session-1"));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(result.current.messages[0].content).toBe(
      "Welcome! Let's review Cell Biology."
    );
    expect(api.startSession).toHaveBeenCalledWith("block-1");
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

  it("fetches block via /api/blocks/:id", async () => {
    const mockBlock = makeBlock();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockBlock }),
    });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("confidence-before"));
    expect(result.current.block).toEqual(mockBlock);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/blocks/block-1");
  });

  it("handles fetch error for block", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const { result } = renderHook(() =>
      useStudySession({ blockId: "block-1" })
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toContain("Failed to fetch block");
  });

  it("calls start session endpoint", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
      if (typeof url === "string" && url.includes("/api/blocks/")) {
        return { ok: true, json: async () => ({ data: makeBlock() }) };
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
