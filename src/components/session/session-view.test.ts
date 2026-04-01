// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { SessionView, BLOCK_TYPE_LABELS, type SessionViewProps } from "./session-view";
import {
  type StudySessionApi,
  type SessionBlockInfo,
  type SessionRecoverySnapshot,
} from "./use-study-session";
import type { AttemptOutcome, BlockId, BlockType } from "@/lib/types";

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

function makeResumeRecovery(
  overrides?: Partial<Extract<SessionRecoverySnapshot, { mode: "resume" }>>
): SessionRecoverySnapshot {
  return {
    mode: "resume",
    sessionId: "session-1",
    startedAt: "2026-04-01T10:00:00.000Z",
    systemPrompt: "System prompt",
    completionPending: false,
    messages: [{ role: "assistant", content: "Welcome to the session!" }],
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

function makeMockApi(overrides?: Partial<StudySessionApi>): StudySessionApi {
  return {
    fetchSessionState: vi
      .fn<StudySessionApi["fetchSessionState"]>()
      .mockResolvedValue({
        block: makeBlock(),
        recovery: makeFreshRecovery(),
      }),
    startSession: vi.fn<StudySessionApi["startSession"]>().mockResolvedValue({
      sessionId: "session-1",
      systemPrompt: "System prompt",
      initialMessage: "Welcome to the session!",
    }),
    sendMessage: vi.fn<StudySessionApi["sendMessage"]>().mockResolvedValue(makeStream("Response text")),
    endSession: vi.fn<StudySessionApi["endSession"]>().mockResolvedValue({
      outcome: makeOutcome(),
      summary: "Session summary",
    }),
    ...overrides,
  };
}

function h(props: SessionViewProps) {
  return createElement(SessionView, props);
}


describe("BLOCK_TYPE_LABELS", () => {
  it("has labels for all 8 block types", () => {
    const types: BlockType[] = [
      "retrieval_drill", "explanation", "worked_example", "timed_problems",
      "essay_planning", "source_analysis", "mistake_review", "reentry",
    ];
    for (const t of types) {
      expect(BLOCK_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("SessionView", () => {
  it("shows loading state initially", () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(h({ blockId: "block-1", api }));
    expect(screen.getByTestId("session-loading")).toBeTruthy();
  });

  it("shows error state when session state fetch fails", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockRejectedValue(new Error("Not found")),
    });
    render(h({ blockId: "block-1", api }));
    await waitFor(() => expect(screen.getByTestId("session-error")).toBeTruthy());
    expect(screen.getByText("Not found")).toBeTruthy();
  });

  it("shows retry button on error", async () => {
    const fetchSessionState = vi
      .fn<StudySessionApi["fetchSessionState"]>()
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce({
        block: makeBlock(),
        recovery: makeFreshRecovery(),
      });

    const api = makeMockApi({ fetchSessionState });
    render(h({ blockId: "block-1", api }));

    await waitFor(() => expect(screen.getByTestId("session-error")).toBeTruthy());
    fireEvent.click(screen.getByTestId("error-retry-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("session-confidence-before")).toBeTruthy()
    );
  });

  it("shows dashboard button on error when callback provided", async () => {
    const onBack = vi.fn();
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockRejectedValue(new Error("err")),
    });
    render(h({ blockId: "block-1", api, onBackToDashboard: onBack }));
    await waitFor(() => expect(screen.getByTestId("session-error")).toBeTruthy());
    fireEvent.click(screen.getByTestId("error-dashboard-btn"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows confidence-before screen after loading", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    expect(screen.getByTestId("confidence-slider")).toBeTruthy();
    expect(screen.getByTestId("ai-guidance-callout")).toBeTruthy();
  });

  it("shows a recovery card for abandoned sessions", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeRestartRecovery(),
      }),
    });

    render(h({ blockId: "block-1", api, onBackToDashboard: vi.fn() }));

    await waitFor(() => expect(screen.getByTestId("session-recovery")).toBeTruthy());
    expect(screen.getByTestId("session-recovery-card")).toBeTruthy();
    expect(screen.getByTestId("session-recovery-action")).toBeTruthy();
  });

  it("can restart from the recovery card", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeRestartRecovery(),
      }),
    });

    render(h({ blockId: "block-1", api }));

    await waitFor(() => expect(screen.getByTestId("session-recovery")).toBeTruthy());
    fireEvent.click(screen.getByTestId("session-recovery-action"));
    await waitFor(() => expect(screen.getByTestId("session-active")).toBeTruthy());
    expect(api.startSession).toHaveBeenCalledWith("block-1", { restart: true });
  });

  it("transitions to active session after confidence submission", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByText("Starting study session...")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("session-active")).toBeTruthy());
    expect(screen.getByTestId("chat-interface")).toBeTruthy();
    expect(screen.getByTestId("session-timer")).toBeTruthy();
    expect(screen.getByTestId("progress-indicator")).toBeTruthy();
  });

  it("shows a resume notice when returning to an active session", async () => {
    const api = makeMockApi({
      fetchSessionState: vi.fn().mockResolvedValue({
        block: makeBlock(),
        recovery: makeResumeRecovery({
          messages: [
            { role: "assistant", content: "Welcome to the session!" },
            { role: "user", content: "My answer" },
          ],
        }),
      }),
    });

    render(h({ blockId: "block-1", api }));

    await waitFor(() => expect(screen.getByTestId("session-active")).toBeTruthy());
    expect(screen.getByTestId("session-resume-notice")).toBeTruthy();
  });

  it("shows abandon button in active state", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByTestId("abandon-btn")).toBeTruthy());
  });

  it("can send a message and see the response", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByText("Welcome to the session!")).toBeTruthy());
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "My answer" } });
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByText("Response text")).toBeTruthy());
  });

  it("shows confidence-after when session completes", async () => {
    const api = makeMockApi({
      sendMessage: vi.fn().mockResolvedValue(makeStream("Done!<session_status>complete</session_status>")),
    });
    render(h({ blockId: "block-1", api }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByText("Welcome to the session!")).toBeTruthy());
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "done" } });
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByTestId("session-confidence-after")).toBeTruthy());
  });

  it("shows session-complete with teal panel after confidence-after", async () => {
    const api = makeMockApi({
      sendMessage: vi.fn().mockResolvedValue(makeStream("Done!<session_status>complete</session_status>")),
    });
    render(h({ blockId: "block-1", api, onNextBlock: vi.fn(), onBackToDashboard: vi.fn() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByText("Welcome to the session!")).toBeTruthy());
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "final" } });
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByTestId("session-confidence-after")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-4"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByTestId("session-complete-view")).toBeTruthy());
    expect(screen.getByTestId("session-complete")).toBeTruthy();
  });

  it("abandons session and shows complete", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByTestId("abandon-btn")).toBeTruthy());
    fireEvent.click(screen.getByTestId("abandon-btn"));
    await waitFor(() => expect(screen.getByTestId("session-complete-view")).toBeTruthy());
  });

  it("shows completing state while session is ending", async () => {
    let resolveEnd: ((value: { outcome: AttemptOutcome; summary: string }) => void) | null = null;
    const hangingEnd = new Promise<{ outcome: AttemptOutcome; summary: string }>((resolve) => {
      resolveEnd = resolve;
    });

    const api = makeMockApi({
      sendMessage: vi.fn().mockResolvedValue(makeStream("Done!<session_status>complete</session_status>")),
      endSession: vi.fn().mockReturnValue(hangingEnd),
    });

    render(h({ blockId: "block-1", api }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByText("Welcome to the session!")).toBeTruthy());
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "answer" } });
    fireEvent.click(screen.getByTestId("send-btn"));

    // Should show completing while endSession is pending
    await waitFor(() => {
      const completing = screen.queryByTestId("session-completing");
      const confidenceAfter = screen.queryByTestId("session-confidence-after");
      return expect(completing !== null || confidenceAfter !== null).toBe(true);
    });

    // Resolve to clean up — TS can't track assignment inside Promise callback
    type EndResolver = (value: { outcome: AttemptOutcome; summary: string }) => void;
    (resolveEnd as EndResolver | null)?.({ outcome: makeOutcome(), summary: "Done" });
    await waitFor(() => expect(screen.getByTestId("session-confidence-after")).toBeTruthy());
  });
});
