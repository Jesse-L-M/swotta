import { describe, test, expect } from "vitest";
import type { TechniqueMastery } from "@/engine/technique";
import {
  sortTechniquesByScore,
  getWeakestTechnique,
  getScoreLevel,
  formatTrendIndicator,
  getDepthLabel,
} from "./technique-card";

function makeTechnique(
  overrides: Partial<TechniqueMastery> = {}
): TechniqueMastery {
  return {
    commandWord: "Evaluate",
    definition: "Weigh up both sides and reach a judgement",
    expectedDepth: 4,
    questionsAttempted: 5,
    avgScore: 65,
    trend: "stable",
    ...overrides,
  };
}

describe("sortTechniquesByScore", () => {
  test("returns empty array for empty input", () => {
    expect(sortTechniquesByScore([])).toEqual([]);
  });

  test("sorts by score ascending (weakest first)", () => {
    const techniques = [
      makeTechnique({ commandWord: "Evaluate", avgScore: 80 }),
      makeTechnique({ commandWord: "Describe", avgScore: 30 }),
      makeTechnique({ commandWord: "Explain", avgScore: 55 }),
    ];
    const sorted = sortTechniquesByScore(techniques);
    expect(sorted[0].commandWord).toBe("Describe");
    expect(sorted[1].commandWord).toBe("Explain");
    expect(sorted[2].commandWord).toBe("Evaluate");
  });

  test("puts null scores at the end", () => {
    const techniques = [
      makeTechnique({ commandWord: "Evaluate", avgScore: null }),
      makeTechnique({ commandWord: "Describe", avgScore: 30 }),
      makeTechnique({ commandWord: "Compare", avgScore: null }),
    ];
    const sorted = sortTechniquesByScore(techniques);
    expect(sorted[0].commandWord).toBe("Describe");
    expect(sorted[1].avgScore).toBeNull();
    expect(sorted[2].avgScore).toBeNull();
  });

  test("handles all null scores", () => {
    const techniques = [
      makeTechnique({ commandWord: "A", avgScore: null }),
      makeTechnique({ commandWord: "B", avgScore: null }),
    ];
    const sorted = sortTechniquesByScore(techniques);
    expect(sorted.length).toBe(2);
  });

  test("does not mutate original array", () => {
    const techniques = [
      makeTechnique({ commandWord: "Evaluate", avgScore: 80 }),
      makeTechnique({ commandWord: "Describe", avgScore: 30 }),
    ];
    const original = [...techniques];
    sortTechniquesByScore(techniques);
    expect(techniques[0].commandWord).toBe(original[0].commandWord);
    expect(techniques[1].commandWord).toBe(original[1].commandWord);
  });

  test("handles single element", () => {
    const techniques = [makeTechnique({ commandWord: "Evaluate", avgScore: 50 })];
    const sorted = sortTechniquesByScore(techniques);
    expect(sorted.length).toBe(1);
    expect(sorted[0].commandWord).toBe("Evaluate");
  });
});

describe("getWeakestTechnique", () => {
  test("returns null for empty array", () => {
    expect(getWeakestTechnique([])).toBeNull();
  });

  test("returns null when all scores are null", () => {
    const techniques = [
      makeTechnique({ commandWord: "A", avgScore: null }),
      makeTechnique({ commandWord: "B", avgScore: null }),
    ];
    expect(getWeakestTechnique(techniques)).toBeNull();
  });

  test("returns the technique with lowest score", () => {
    const techniques = [
      makeTechnique({ commandWord: "Evaluate", avgScore: 80 }),
      makeTechnique({ commandWord: "Describe", avgScore: 25 }),
      makeTechnique({ commandWord: "Explain", avgScore: 50 }),
    ];
    const weakest = getWeakestTechnique(techniques);
    expect(weakest).not.toBeNull();
    expect(weakest!.commandWord).toBe("Describe");
  });

  test("returns the only scored technique", () => {
    const techniques = [
      makeTechnique({ commandWord: "Evaluate", avgScore: null }),
      makeTechnique({ commandWord: "Describe", avgScore: 40 }),
    ];
    const weakest = getWeakestTechnique(techniques);
    expect(weakest!.commandWord).toBe("Describe");
  });

  test("returns first of equal scores", () => {
    const techniques = [
      makeTechnique({ commandWord: "A", avgScore: 50 }),
      makeTechnique({ commandWord: "B", avgScore: 50 }),
    ];
    const weakest = getWeakestTechnique(techniques);
    expect(weakest!.commandWord).toBe("A");
  });
});

describe("getScoreLevel", () => {
  test("returns neutral for null score", () => {
    expect(getScoreLevel(null)).toBe("neutral");
  });

  test("returns strong for score >= 70", () => {
    expect(getScoreLevel(70)).toBe("strong");
    expect(getScoreLevel(85)).toBe("strong");
    expect(getScoreLevel(100)).toBe("strong");
  });

  test("returns attention for score < 40", () => {
    expect(getScoreLevel(0)).toBe("attention");
    expect(getScoreLevel(20)).toBe("attention");
    expect(getScoreLevel(39)).toBe("attention");
  });

  test("returns neutral for score 40-69", () => {
    expect(getScoreLevel(40)).toBe("neutral");
    expect(getScoreLevel(55)).toBe("neutral");
    expect(getScoreLevel(69)).toBe("neutral");
  });

  test("handles boundary values exactly", () => {
    expect(getScoreLevel(39.9)).toBe("attention");
    expect(getScoreLevel(40)).toBe("neutral");
    expect(getScoreLevel(69.9)).toBe("neutral");
    expect(getScoreLevel(70)).toBe("strong");
  });
});

describe("formatTrendIndicator", () => {
  test("returns improving with up direction", () => {
    const result = formatTrendIndicator("improving");
    expect(result.label).toBe("Improving");
    expect(result.direction).toBe("up");
  });

  test("returns declining with down direction", () => {
    const result = formatTrendIndicator("declining");
    expect(result.label).toBe("Declining");
    expect(result.direction).toBe("down");
  });

  test("returns stable with flat direction", () => {
    const result = formatTrendIndicator("stable");
    expect(result.label).toBe("Stable");
    expect(result.direction).toBe("flat");
  });

  test("returns insufficient data with none direction", () => {
    const result = formatTrendIndicator("insufficient_data");
    expect(result.label).toBe("Not enough data");
    expect(result.direction).toBe("none");
  });
});

describe("getDepthLabel", () => {
  test("returns Recall for depth 1", () => {
    expect(getDepthLabel(1)).toBe("Recall");
  });

  test("returns Application for depth 2", () => {
    expect(getDepthLabel(2)).toBe("Application");
  });

  test("returns Analysis for depth 3", () => {
    expect(getDepthLabel(3)).toBe("Analysis");
  });

  test("returns Evaluation for depth 4", () => {
    expect(getDepthLabel(4)).toBe("Evaluation");
  });

  test("returns fallback for unknown depth", () => {
    expect(getDepthLabel(5)).toBe("Level 5");
    expect(getDepthLabel(0)).toBe("Level 0");
    expect(getDepthLabel(99)).toBe("Level 99");
  });
});
