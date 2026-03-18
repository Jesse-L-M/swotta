// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import {
  ReplayCard,
  getStatusStyle,
  getScoreStyle,
  type ReplayCardProps,
} from "./replay-card";
import type { SessionCard } from "@/engine/replay";
import type { BlockType } from "@/lib/types";

function makeSession(overrides?: Partial<SessionCard>): SessionCard {
  return {
    sessionId: "session-1",
    topicName: "Cell Biology",
    blockType: "retrieval_drill" as BlockType,
    blockTypeLabel: "Retrieval Drill",
    score: 85,
    durationMinutes: 12,
    status: "completed",
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    summary: "Good session on cell biology fundamentals",
    ...overrides,
  };
}

function h(props: ReplayCardProps) {
  return createElement(ReplayCard, props);
}

// --- Pure function tests ---

describe("getStatusStyle", () => {
  it("returns teal style for completed", () => {
    const style = getStatusStyle("completed");
    expect(style.label).toBe("Completed");
    expect(style.bg).toContain("E4F0ED");
    expect(style.text).toContain("2D7A6E");
  });

  it("returns coral style for abandoned", () => {
    const style = getStatusStyle("abandoned");
    expect(style.label).toBe("Abandoned");
    expect(style.bg).toContain("FAEAE5");
    expect(style.text).toContain("D4654A");
  });

  it("returns coral style for timeout", () => {
    const style = getStatusStyle("timeout");
    expect(style.label).toBe("Timed Out");
    expect(style.bg).toContain("FAEAE5");
  });

  it("returns stone style for active (default)", () => {
    const style = getStatusStyle("active");
    expect(style.label).toBe("Active");
    expect(style.bg).toContain("F0ECE4");
    expect(style.text).toContain("5C5950");
  });

  it("returns stone style for unknown status", () => {
    const style = getStatusStyle("unknown");
    expect(style.label).toBe("Active");
  });
});

describe("getScoreStyle", () => {
  it("returns teal for score >= 70", () => {
    expect(getScoreStyle(70)).toContain("2D7A6E");
    expect(getScoreStyle(95)).toContain("2D7A6E");
  });

  it("returns coral for score < 50", () => {
    expect(getScoreStyle(49)).toContain("D4654A");
    expect(getScoreStyle(0)).toContain("D4654A");
  });

  it("returns graphite for score 50-69", () => {
    expect(getScoreStyle(50)).toContain("5C5950");
    expect(getScoreStyle(69)).toContain("5C5950");
  });
});

// --- Component tests ---

describe("ReplayCard", () => {
  it("renders topic name", () => {
    render(h({ session: makeSession() }));
    expect(screen.getByTestId("replay-topic").textContent).toBe("Cell Biology");
  });

  it("renders block type label", () => {
    render(h({ session: makeSession() }));
    expect(screen.getByTestId("replay-block-type").textContent).toBe(
      "Retrieval Drill"
    );
  });

  it("hides block type when null", () => {
    render(
      h({
        session: makeSession({
          blockType: null,
          blockTypeLabel: null,
        }),
      })
    );
    expect(screen.queryByTestId("replay-block-type")).toBeNull();
  });

  it("renders status badge", () => {
    render(h({ session: makeSession() }));
    expect(screen.getByTestId("replay-status").textContent).toBe("Completed");
  });

  it("renders abandoned status badge", () => {
    render(h({ session: makeSession({ status: "abandoned" }) }));
    expect(screen.getByTestId("replay-status").textContent).toBe("Abandoned");
  });

  it("renders score when present", () => {
    render(h({ session: makeSession({ score: 78.5 }) }));
    expect(screen.getByTestId("replay-score").textContent).toBe("79%");
  });

  it("hides score when null", () => {
    render(h({ session: makeSession({ score: null }) }));
    expect(screen.queryByTestId("replay-score")).toBeNull();
  });

  it("renders relative time", () => {
    render(h({ session: makeSession() }));
    expect(screen.getByTestId("replay-time").textContent).toBe("2h ago");
  });

  it("renders summary text", () => {
    render(h({ session: makeSession() }));
    expect(screen.getByTestId("replay-summary").textContent).toBe(
      "Good session on cell biology fundamentals"
    );
  });

  it("hides summary when null", () => {
    render(h({ session: makeSession({ summary: null }) }));
    expect(screen.queryByTestId("replay-summary")).toBeNull();
  });

  it("renders duration", () => {
    render(h({ session: makeSession({ durationMinutes: 15 }) }));
    expect(screen.getByTestId("replay-duration").textContent).toBe("15 min");
  });

  it("hides duration when null", () => {
    render(h({ session: makeSession({ durationMinutes: null }) }));
    expect(screen.queryByTestId("replay-duration")).toBeNull();
  });

  it("hides duration when zero", () => {
    render(h({ session: makeSession({ durationMinutes: 0 }) }));
    expect(screen.queryByTestId("replay-duration")).toBeNull();
  });

  it("renders view details button when handler provided", () => {
    const onView = vi.fn();
    render(h({ session: makeSession(), onViewDetails: onView }));
    const btn = screen.getByTestId("replay-view-btn");
    expect(btn.textContent).toBe("View Details");
    fireEvent.click(btn);
    expect(onView).toHaveBeenCalledWith("session-1");
  });

  it("renders share button when handler provided", () => {
    const onShare = vi.fn();
    render(h({ session: makeSession(), onShare: onShare }));
    const btn = screen.getByTestId("replay-share-btn");
    expect(btn.textContent).toBe("Share");
    fireEvent.click(btn);
    expect(onShare).toHaveBeenCalledWith("session-1");
  });

  it("hides buttons when no handlers provided", () => {
    render(h({ session: makeSession() }));
    expect(screen.queryByTestId("replay-view-btn")).toBeNull();
    expect(screen.queryByTestId("replay-share-btn")).toBeNull();
  });

  it("has correct card styling (white bg, border, rounded)", () => {
    render(h({ session: makeSession() }));
    const card = screen.getByTestId("replay-card");
    expect(card.className).toContain("bg-white");
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("border");
  });

  it("applies teal score style for high score", () => {
    render(h({ session: makeSession({ score: 85 }) }));
    const scoreEl = screen.getByTestId("replay-score");
    expect(scoreEl.className).toContain("2D7A6E");
  });

  it("applies coral score style for low score", () => {
    render(h({ session: makeSession({ score: 30 }) }));
    const scoreEl = screen.getByTestId("replay-score");
    expect(scoreEl.className).toContain("D4654A");
  });
});
