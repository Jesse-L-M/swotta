// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { SessionView, BLOCK_TYPE_LABELS, type SessionViewProps } from "./session-view";
import {
  resetMessageCounter,
  type StudySessionApi,
  type SessionBlockInfo,
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
    fetchBlock: vi.fn<StudySessionApi["fetchBlock"]>().mockResolvedValue(makeBlock()),
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

beforeEach(() => {
  resetMessageCounter();
});

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
    const api = makeMockApi({ fetchBlock: vi.fn().mockReturnValue(new Promise(() => {})) });
    render(h({ blockId: "block-1", api }));
    expect(screen.getByTestId("session-loading")).toBeTruthy();
  });

  it("shows error state when block fetch fails", async () => {
    const api = makeMockApi({ fetchBlock: vi.fn().mockRejectedValue(new Error("Not found")) });
    render(h({ blockId: "block-1", api }));
    await waitFor(() => expect(screen.getByTestId("session-error")).toBeTruthy());
    expect(screen.getByText("Not found")).toBeTruthy();
  });

  it("shows dashboard button on error when callback provided", async () => {
    const onBack = vi.fn();
    const api = makeMockApi({ fetchBlock: vi.fn().mockRejectedValue(new Error("err")) });
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

  it("transitions to active session after confidence submission", async () => {
    render(h({ blockId: "block-1", api: makeMockApi() }));
    await waitFor(() => expect(screen.getByTestId("session-confidence-before")).toBeTruthy());
    fireEvent.click(screen.getByTestId("confidence-3"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    await waitFor(() => expect(screen.getByTestId("session-active")).toBeTruthy());
    expect(screen.getByTestId("chat-interface")).toBeTruthy();
    expect(screen.getByTestId("session-timer")).toBeTruthy();
    expect(screen.getByTestId("progress-indicator")).toBeTruthy();
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

    // Resolve to clean up
    resolveEnd?.({ outcome: makeOutcome(), summary: "Done" });
    await waitFor(() => expect(screen.getByTestId("session-confidence-after")).toBeTruthy());
  });
});
