import { describe, test, expect } from "vitest";
import {
  PHASE_ORDER,
  getPhaseLabel,
  getPhaseDescription,
  getPhaseIndex,
  formatStreakText,
  getBlockTypeLabel,
  getBlockTypeIcon,
} from "./phase-indicator";

describe("PHASE_ORDER", () => {
  test("contains exactly 4 phases in correct order", () => {
    expect(PHASE_ORDER).toEqual([
      "exploration",
      "consolidation",
      "revision",
      "confidence",
    ]);
  });

  test("has no duplicates", () => {
    const unique = new Set(PHASE_ORDER);
    expect(unique.size).toBe(PHASE_ORDER.length);
  });
});

describe("getPhaseLabel", () => {
  test("returns Exploration", () => {
    expect(getPhaseLabel("exploration")).toBe("Exploration");
  });

  test("returns Consolidation", () => {
    expect(getPhaseLabel("consolidation")).toBe("Consolidation");
  });

  test("returns Revision", () => {
    expect(getPhaseLabel("revision")).toBe("Revision");
  });

  test("returns Confidence", () => {
    expect(getPhaseLabel("confidence")).toBe("Confidence");
  });

  test("returns correct label for every phase in PHASE_ORDER", () => {
    for (const phase of PHASE_ORDER) {
      const label = getPhaseLabel(phase);
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("getPhaseDescription", () => {
  test("returns description for exploration", () => {
    const desc = getPhaseDescription("exploration");
    expect(desc).toContain("foundation");
  });

  test("returns description for consolidation", () => {
    const desc = getPhaseDescription("consolidation");
    expect(desc).toContain("weak");
  });

  test("returns description for revision", () => {
    const desc = getPhaseDescription("revision");
    expect(desc).toContain("session");
  });

  test("returns description for confidence", () => {
    const desc = getPhaseDescription("confidence");
    expect(desc).toContain("Trust");
  });

  test("returns non-empty description for every phase", () => {
    for (const phase of PHASE_ORDER) {
      const desc = getPhaseDescription(phase);
      expect(desc).toBeTruthy();
      expect(desc.length).toBeGreaterThan(10);
    }
  });
});

describe("getPhaseIndex", () => {
  test("returns 0 for exploration", () => {
    expect(getPhaseIndex("exploration")).toBe(0);
  });

  test("returns 1 for consolidation", () => {
    expect(getPhaseIndex("consolidation")).toBe(1);
  });

  test("returns 2 for revision", () => {
    expect(getPhaseIndex("revision")).toBe(2);
  });

  test("returns 3 for confidence", () => {
    expect(getPhaseIndex("confidence")).toBe(3);
  });

  test("each phase maps to a unique index", () => {
    const indices = PHASE_ORDER.map(getPhaseIndex);
    const unique = new Set(indices);
    expect(unique.size).toBe(PHASE_ORDER.length);
  });

  test("indices are sequential starting from 0", () => {
    const indices = PHASE_ORDER.map(getPhaseIndex);
    expect(indices).toEqual([0, 1, 2, 3]);
  });
});

describe("formatStreakText", () => {
  test("returns empty string when streak is 0 and no exam", () => {
    expect(formatStreakText(0, null)).toBe("");
  });

  test("returns streak only when no exam", () => {
    expect(formatStreakText(5, null)).toBe("5 days in a row.");
  });

  test("returns exam countdown only when streak is 0", () => {
    expect(formatStreakText(0, 34)).toBe("34 days to exam.");
  });

  test("returns both streak and exam countdown", () => {
    expect(formatStreakText(12, 34)).toBe(
      "12 days in a row. 34 days to exam."
    );
  });

  test("uses singular 'day' for streak of 1", () => {
    expect(formatStreakText(1, null)).toBe("1 day in a row.");
  });

  test("uses singular 'day' for 1 day to exam", () => {
    expect(formatStreakText(0, 1)).toBe("1 day to exam.");
  });

  test("handles 0 days to exam", () => {
    expect(formatStreakText(0, 0)).toBe("0 days to exam.");
  });

  test("handles negative days to exam as no exam", () => {
    expect(formatStreakText(5, -1)).toBe("5 days in a row.");
  });

  test("handles both singular values", () => {
    expect(formatStreakText(1, 1)).toBe("1 day in a row. 1 day to exam.");
  });

  test("handles large values", () => {
    expect(formatStreakText(100, 365)).toBe(
      "100 days in a row. 365 days to exam."
    );
  });
});

describe("getBlockTypeLabel", () => {
  test("returns label for every block type", () => {
    expect(getBlockTypeLabel("retrieval_drill")).toBe("Retrieval Drill");
    expect(getBlockTypeLabel("explanation")).toBe("Explanation");
    expect(getBlockTypeLabel("worked_example")).toBe("Worked Example");
    expect(getBlockTypeLabel("timed_problems")).toBe("Timed Problems");
    expect(getBlockTypeLabel("essay_planning")).toBe("Essay Planning");
    expect(getBlockTypeLabel("source_analysis")).toBe("Source Analysis");
    expect(getBlockTypeLabel("mistake_review")).toBe("Mistake Review");
    expect(getBlockTypeLabel("reentry")).toBe("Re-entry");
  });
});

describe("getBlockTypeIcon", () => {
  test("returns a component for every block type", () => {
    const blockTypes = [
      "retrieval_drill",
      "explanation",
      "worked_example",
      "timed_problems",
      "essay_planning",
      "source_analysis",
      "mistake_review",
      "reentry",
    ] as const;

    for (const type of blockTypes) {
      const icon = getBlockTypeIcon(type);
      expect(icon).toBeTruthy();
    }
  });

  test("returns different icons for different block types", () => {
    const drill = getBlockTypeIcon("retrieval_drill");
    const explanation = getBlockTypeIcon("explanation");
    expect(drill).not.toBe(explanation);
  });
});
