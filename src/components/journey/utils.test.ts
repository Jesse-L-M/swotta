import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatRelativeDate,
  buildMilestoneMessage,
  buildMomentumSummary,
  extractMilestones,
  severityLabel,
  conqueredPercent,
} from "./utils";
import type { DashboardQueueBlock } from "@/components/dashboard/types";
import type { MisconceptionThread } from "./types";
import type { BlockId, LearnerId, TopicId } from "@/lib/types";

function makeThread(overrides?: Partial<MisconceptionThread>): MisconceptionThread {
  return {
    id: "thread-0",
    description: "Confuses mitosis with meiosis",
    topicId: "t1" as TopicId,
    topicName: "Cell Division",
    severity: 2,
    firstSeenAt: new Date("2026-01-10T10:00:00Z"),
    lastSeenAt: new Date("2026-02-15T10:00:00Z"),
    occurrenceCount: 3,
    resolved: false,
    resolvedAt: null,
    ...overrides,
  };
}

describe("formatDate", () => {
  it("formats a date in en-GB style", () => {
    const result = formatDate(new Date("2026-03-18T12:00:00Z"));
    expect(result).toContain("18");
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-03-18T12:00:00Z");

  it("returns 'Today' for same day", () => {
    expect(formatRelativeDate(new Date("2026-03-18T08:00:00Z"), now)).toBe(
      "Today"
    );
  });

  it("returns 'Yesterday' for 1 day ago", () => {
    expect(formatRelativeDate(new Date("2026-03-17T08:00:00Z"), now)).toBe(
      "Yesterday"
    );
  });

  it("returns 'N days ago' for 2-6 days", () => {
    expect(formatRelativeDate(new Date("2026-03-15T08:00:00Z"), now)).toBe(
      "3 days ago"
    );
  });

  it("returns '1 week ago' for 7-13 days", () => {
    expect(formatRelativeDate(new Date("2026-03-08T08:00:00Z"), now)).toBe(
      "1 week ago"
    );
  });

  it("returns 'N weeks ago' for 14-29 days", () => {
    expect(formatRelativeDate(new Date("2026-02-25T08:00:00Z"), now)).toBe(
      "3 weeks ago"
    );
  });

  it("returns '1 month ago' for 30-59 days", () => {
    expect(formatRelativeDate(new Date("2026-02-10T08:00:00Z"), now)).toBe(
      "1 month ago"
    );
  });

  it("returns 'N months ago' for 60+ days", () => {
    expect(formatRelativeDate(new Date("2025-12-18T08:00:00Z"), now)).toBe(
      "3 months ago"
    );
  });
});

describe("buildMilestoneMessage", () => {
  it("builds correct celebration message", () => {
    const msg = buildMilestoneMessage(
      "osmosis vs diffusion confusion",
      "Transport in Cells"
    );
    expect(msg).toBe(
      'You turned "osmosis vs diffusion confusion" into a strength in Transport in Cells.'
    );
  });
});

describe("buildMomentumSummary", () => {
  function makeQueueBlock(
    overrides?: Partial<DashboardQueueBlock>
  ): DashboardQueueBlock {
    return {
      id: "block-1" as BlockId,
      learnerId: "learner-1" as LearnerId,
      topicId: "topic-1" as TopicId,
      topicName: "Cell Division",
      blockType: "retrieval_drill",
      durationMinutes: 12,
      priority: 1,
      reason: "Scheduled review",
      reviewReason: "misconception",
      actionTitle: "Pull Cell Division out of memory",
      whyNow:
        'You recently got stuck on "Confuses mitosis with meiosis" here, so this block is about fixing it before the same mistake repeats.',
      impact:
        "Pulling answers from memory now makes later questions faster and less fragile.",
      ...overrides,
    };
  }

  it("builds a start-now summary when a queue block exists", () => {
    const summary = buildMomentumSummary({
      nextBlock: makeQueueBlock(),
      queueCount: 2,
      activeMisconceptions: 1,
    });

    expect(summary.title).toBe("Keep today's momentum going");
    expect(summary.ctaHref).toBe("/session/block-1");
    expect(summary.detail).toContain("Next up");
  });

  it("falls back to dashboard guidance when no block is queued", () => {
    const summary = buildMomentumSummary({
      nextBlock: null,
      queueCount: 0,
      activeMisconceptions: 2,
    });

    expect(summary.title).toBe("Your queue is clear right now");
    expect(summary.ctaHref).toBe("/dashboard");
    expect(summary.detail).toContain("2 active misconceptions");
  });
});

describe("extractMilestones", () => {
  it("returns empty for no resolved threads", () => {
    const threads = [makeThread({ resolved: false })];
    expect(extractMilestones(threads)).toEqual([]);
  });

  it("extracts milestones from resolved threads", () => {
    const resolved = makeThread({
      id: "thread-1",
      resolved: true,
      resolvedAt: new Date("2026-03-01T10:00:00Z"),
    });
    const milestones = extractMilestones([resolved]);
    expect(milestones).toHaveLength(1);
    expect(milestones[0].id).toBe("thread-1");
    expect(milestones[0].description).toBe("Confuses mitosis with meiosis");
    expect(milestones[0].topicName).toBe("Cell Division");
    expect(milestones[0].occurrenceCount).toBe(3);
  });

  it("sorts milestones by resolvedAt descending", () => {
    const older = makeThread({
      id: "thread-old",
      resolved: true,
      resolvedAt: new Date("2026-01-01T10:00:00Z"),
    });
    const newer = makeThread({
      id: "thread-new",
      resolved: true,
      resolvedAt: new Date("2026-03-01T10:00:00Z"),
    });
    const milestones = extractMilestones([older, newer]);
    expect(milestones[0].id).toBe("thread-new");
    expect(milestones[1].id).toBe("thread-old");
  });

  it("excludes resolved threads with null resolvedAt", () => {
    const bad = makeThread({ resolved: true, resolvedAt: null });
    expect(extractMilestones([bad])).toEqual([]);
  });
});

describe("severityLabel", () => {
  it("returns 'Minor' for severity 1", () => {
    expect(severityLabel(1)).toBe("Minor");
  });

  it("returns 'Moderate' for severity 2", () => {
    expect(severityLabel(2)).toBe("Moderate");
  });

  it("returns 'Critical' for severity 3", () => {
    expect(severityLabel(3)).toBe("Critical");
  });
});

describe("conqueredPercent", () => {
  it("returns 0 when total is 0", () => {
    expect(conqueredPercent(0, 0)).toBe(0);
  });

  it("calculates percentage correctly", () => {
    expect(conqueredPercent(3, 10)).toBe(30);
  });

  it("rounds to nearest integer", () => {
    expect(conqueredPercent(1, 3)).toBe(33);
  });

  it("returns 100 when all conquered", () => {
    expect(conqueredPercent(5, 5)).toBe(100);
  });
});
