// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import {
  SessionComplete,
  formatDuration,
  StatCard,
  type SessionCompleteProps,
} from "./session-complete";
import type { AttemptOutcome, BlockId, TopicId } from "@/lib/types";

function makeOutcome(overrides?: Partial<AttemptOutcome>): AttemptOutcome {
  return {
    blockId: "block-1" as BlockId,
    score: 85,
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

function h(props: SessionCompleteProps) {
  return createElement(SessionComplete, props);
}

describe("formatDuration", () => {
  it("returns < 1 min for less than 60 seconds", () => {
    expect(formatDuration(30)).toBe("< 1 min");
  });

  it("returns minutes for 60+ seconds", () => {
    expect(formatDuration(120)).toBe("2 min");
  });

  it("returns 1 min for 60 seconds", () => {
    expect(formatDuration(60)).toBe("1 min");
  });
});

describe("StatCard", () => {
  it("renders label and value", () => {
    render(createElement(StatCard, { label: "Score", value: "85%", testId: "test-stat" }));
    const card = screen.getByTestId("test-stat");
    expect(card.textContent).toContain("Score");
    expect(card.textContent).toContain("85%");
  });
});

describe("SessionComplete", () => {
  it("renders summary text", () => {
    render(h({ summary: "Well done on Cell Biology", outcome: makeOutcome(), elapsedSeconds: 720, confidenceBefore: 0.4, confidenceAfter: 0.8 }));
    expect(screen.getByText("Well done on Cell Biology")).toBeTruthy();
  });

  it("shows star icon for high scores", () => {
    render(h({ summary: "Great!", outcome: makeOutcome({ score: 90 }), elapsedSeconds: 600, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("celebration-icon").textContent).toContain("\u{1F31F}");
  });

  it("shows checkmark for lower scores", () => {
    render(h({ summary: "OK", outcome: makeOutcome({ score: 50 }), elapsedSeconds: 600, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("celebration-icon").textContent).toContain("\u2713");
  });

  it("shows checkmark when score is null", () => {
    render(h({ summary: "OK", outcome: makeOutcome({ score: null }), elapsedSeconds: 600, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("celebration-icon").textContent).toContain("\u2713");
  });

  it("displays time stat", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("stat-time").textContent).toContain("5 min");
  });

  it("displays score stat", () => {
    render(h({ summary: "Done", outcome: makeOutcome({ score: 72 }), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("stat-score").textContent).toContain("72%");
  });

  it("shows -- for null score", () => {
    render(h({ summary: "Done", outcome: makeOutcome({ score: null }), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.getByTestId("stat-score").textContent).toContain("--");
  });

  it("shows confidence before and after when provided", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: 0.4, confidenceAfter: 0.8 }));
    expect(screen.getByTestId("stat-confidence-before").textContent).toContain("40%");
    expect(screen.getByTestId("stat-confidence-after").textContent).toContain("80%");
  });

  it("hides confidence stats when null", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.queryByTestId("stat-confidence-before")).toBeNull();
    expect(screen.queryByTestId("stat-confidence-after")).toBeNull();
  });

  it("shows confidence improved message when after > before", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: 0.3, confidenceAfter: 0.7 }));
    expect(screen.getByTestId("confidence-improved")).toBeTruthy();
  });

  it("hides confidence improved message when after <= before", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: 0.7, confidenceAfter: 0.5 }));
    expect(screen.queryByTestId("confidence-improved")).toBeNull();
  });

  it("hides confidence improved message when values are null", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.queryByTestId("confidence-improved")).toBeNull();
  });

  it("shows misconceptions section when present", () => {
    render(h({
      summary: "Done",
      outcome: makeOutcome({
        misconceptions: [{ topicId: "t1" as TopicId, ruleId: null, description: "Confuses mitosis with meiosis", severity: 2 }],
      }),
      elapsedSeconds: 300,
      confidenceBefore: null,
      confidenceAfter: null,
    }));
    expect(screen.getByTestId("misconceptions-section").textContent).toContain("Confuses mitosis with meiosis");
  });

  it("hides misconceptions section when empty", () => {
    render(h({ summary: "Done", outcome: makeOutcome({ misconceptions: [] }), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.queryByTestId("misconceptions-section")).toBeNull();
  });

  it("calls onNextBlock when button clicked", () => {
    const onNext = vi.fn();
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null, onNextBlock: onNext }));
    fireEvent.click(screen.getByTestId("next-block-btn"));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("calls onBackToDashboard when button clicked", () => {
    const onBack = vi.fn();
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null, onBackToDashboard: onBack }));
    fireEvent.click(screen.getByTestId("dashboard-btn"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("hides next block button when onNextBlock not provided", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.queryByTestId("next-block-btn")).toBeNull();
  });

  it("hides dashboard button when onBackToDashboard not provided", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    expect(screen.queryByTestId("dashboard-btn")).toBeNull();
  });

  it("has teal surface styling", () => {
    render(h({ summary: "Done", outcome: makeOutcome(), elapsedSeconds: 300, confidenceBefore: null, confidenceAfter: null }));
    const panel = screen.getByTestId("session-complete");
    expect(panel.className).toContain("bg-teal-50");
    expect(panel.className).toContain("border-teal-200");
  });
});
