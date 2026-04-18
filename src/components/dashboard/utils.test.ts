import { describe, test, expect } from "vitest";
import {
  getMasteryState,
  formatStudyMinutes,
  daysUntil,
  formatExamCountdown,
  getBlockTypeLabel,
  getBlockTypeDescription,
  getGreeting,
  calculateAverageMastery,
  groupMasteryByState,
  masteryPercent,
  nextExam,
  getQueueActionTitle,
  getQueueImpact,
  getQueuePositionLabel,
  buildQueueWhyNow,
  MASTERY_STATE_LABEL,
  MASTERY_STYLES,
  type MasteryState,
} from "./utils";
import type { MasteryTopic } from "./types";

describe("getMasteryState", () => {
  test("returns strong for mastery >= 0.7", () => {
    expect(getMasteryState(0.7)).toBe("strong");
    expect(getMasteryState(0.85)).toBe("strong");
    expect(getMasteryState(1.0)).toBe("strong");
  });

  test("returns developing for mastery 0.3-0.69", () => {
    expect(getMasteryState(0.3)).toBe("developing");
    expect(getMasteryState(0.5)).toBe("developing");
    expect(getMasteryState(0.69)).toBe("developing");
  });

  test("returns needs-work for mastery < 0.3", () => {
    expect(getMasteryState(0)).toBe("needs-work");
    expect(getMasteryState(0.1)).toBe("needs-work");
    expect(getMasteryState(0.29)).toBe("needs-work");
  });
});

describe("MASTERY_STATE_LABEL", () => {
  test("has labels for all states", () => {
    expect(MASTERY_STATE_LABEL.strong).toBe("Strong");
    expect(MASTERY_STATE_LABEL.developing).toBe("Developing");
    expect(MASTERY_STATE_LABEL["needs-work"]).toBe("Needs work");
  });
});

describe("MASTERY_STYLES", () => {
  test("has styles for all three states", () => {
    const states: MasteryState[] = ["strong", "developing", "needs-work"];
    for (const s of states) {
      expect(MASTERY_STYLES[s].text).toBeTruthy();
      expect(MASTERY_STYLES[s].bg).toBeTruthy();
      expect(MASTERY_STYLES[s].ring).toBeTruthy();
      expect(MASTERY_STYLES[s].fill).toBeTruthy();
    }
  });
});

describe("formatStudyMinutes", () => {
  test("formats minutes under 60", () => {
    expect(formatStudyMinutes(0)).toBe("0m");
    expect(formatStudyMinutes(15)).toBe("15m");
    expect(formatStudyMinutes(59)).toBe("59m");
  });

  test("formats exact hours", () => {
    expect(formatStudyMinutes(60)).toBe("1h");
    expect(formatStudyMinutes(120)).toBe("2h");
  });

  test("formats hours and minutes", () => {
    expect(formatStudyMinutes(90)).toBe("1h 30m");
    expect(formatStudyMinutes(135)).toBe("2h 15m");
  });
});

describe("daysUntil", () => {
  test("returns null for null date", () => {
    expect(daysUntil(null)).toBeNull();
  });

  test("returns 0 for today", () => {
    const now = new Date(2026, 5, 15);
    expect(daysUntil("2026-06-15", now)).toBe(0);
  });

  test("returns positive for future dates", () => {
    const now = new Date(2026, 5, 1);
    expect(daysUntil("2026-06-15", now)).toBe(14);
  });

  test("returns negative for past dates", () => {
    const now = new Date(2026, 5, 20);
    expect(daysUntil("2026-06-15", now)).toBe(-5);
  });

  test("returns 1 for tomorrow", () => {
    const now = new Date(2026, 5, 14);
    expect(daysUntil("2026-06-15", now)).toBe(1);
  });
});

describe("formatExamCountdown", () => {
  const now = new Date(2026, 5, 1);

  test("returns null for null date", () => {
    expect(formatExamCountdown(null, now)).toBeNull();
  });

  test("returns 'Exam passed' for past dates", () => {
    expect(formatExamCountdown("2026-05-30", now)).toBe("Exam passed");
  });

  test("returns 'Today' for today", () => {
    expect(formatExamCountdown("2026-06-01", now)).toBe("Today");
  });

  test("returns 'Tomorrow' for next day", () => {
    expect(formatExamCountdown("2026-06-02", now)).toBe("Tomorrow");
  });

  test("returns days for 2-6 days", () => {
    expect(formatExamCountdown("2026-06-04", now)).toBe("3 days");
  });

  test("returns days for 7-13 days", () => {
    expect(formatExamCountdown("2026-06-08", now)).toBe("7 days");
  });

  test("returns days with weeks for 14+ days", () => {
    expect(formatExamCountdown("2026-06-15", now)).toBe("14 days (2 weeks)");
  });
});

describe("getBlockTypeLabel", () => {
  test("returns human-readable labels for all block types", () => {
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

describe("getBlockTypeDescription", () => {
  test("returns descriptions for all block types", () => {
    expect(getBlockTypeDescription("retrieval_drill")).toBeTruthy();
    expect(getBlockTypeDescription("explanation")).toBeTruthy();
    expect(getBlockTypeDescription("worked_example")).toBeTruthy();
    expect(getBlockTypeDescription("timed_problems")).toBeTruthy();
    expect(getBlockTypeDescription("essay_planning")).toBeTruthy();
    expect(getBlockTypeDescription("source_analysis")).toBeTruthy();
    expect(getBlockTypeDescription("mistake_review")).toBeTruthy();
    expect(getBlockTypeDescription("reentry")).toBeTruthy();
  });
});

describe("getGreeting", () => {
  test("returns morning greeting before noon", () => {
    expect(getGreeting("Alice", 8)).toBe("Good morning, Alice");
    expect(getGreeting("Bob", 0)).toBe("Good morning, Bob");
    expect(getGreeting("Eve", 11)).toBe("Good morning, Eve");
  });

  test("returns afternoon greeting noon-5pm", () => {
    expect(getGreeting("Alice", 12)).toBe("Good afternoon, Alice");
    expect(getGreeting("Bob", 14)).toBe("Good afternoon, Bob");
    expect(getGreeting("Eve", 16)).toBe("Good afternoon, Eve");
  });

  test("returns evening greeting after 5pm", () => {
    expect(getGreeting("Alice", 17)).toBe("Good evening, Alice");
    expect(getGreeting("Bob", 20)).toBe("Good evening, Bob");
    expect(getGreeting("Eve", 23)).toBe("Good evening, Eve");
  });
});

describe("calculateAverageMastery", () => {
  test("returns 0 for empty array", () => {
    expect(calculateAverageMastery([])).toBe(0);
  });

  test("calculates average correctly", () => {
    expect(calculateAverageMastery([0.5, 0.5])).toBe(0.5);
    expect(calculateAverageMastery([0.2, 0.8])).toBe(0.5);
    expect(calculateAverageMastery([1.0])).toBe(1.0);
  });

  test("rounds to 3 decimal places", () => {
    expect(calculateAverageMastery([0.1, 0.2, 0.3])).toBe(0.2);
    expect(calculateAverageMastery([0.333, 0.333, 0.334])).toBe(0.333);
  });
});

describe("groupMasteryByState", () => {
  test("returns zeros for empty array", () => {
    expect(groupMasteryByState([])).toEqual({
      strong: 0,
      developing: 0,
      "needs-work": 0,
    });
  });

  test("correctly groups topics by mastery state", () => {
    const topics: MasteryTopic[] = [
      { topicId: "1", topicName: "A", masteryLevel: 0.9, qualificationVersionId: "q1" },
      { topicId: "2", topicName: "B", masteryLevel: 0.5, qualificationVersionId: "q1" },
      { topicId: "3", topicName: "C", masteryLevel: 0.1, qualificationVersionId: "q1" },
      { topicId: "4", topicName: "D", masteryLevel: 0.8, qualificationVersionId: "q1" },
    ];
    expect(groupMasteryByState(topics)).toEqual({
      strong: 2,
      developing: 1,
      "needs-work": 1,
    });
  });
});

describe("masteryPercent", () => {
  test("converts decimal to percentage", () => {
    expect(masteryPercent(0)).toBe(0);
    expect(masteryPercent(0.5)).toBe(50);
    expect(masteryPercent(1.0)).toBe(100);
    expect(masteryPercent(0.333)).toBe(33);
  });
});

describe("nextExam", () => {
  const now = new Date(2026, 5, 1);

  test("returns null for empty qualifications", () => {
    expect(nextExam([], now)).toBeNull();
  });

  test("returns null when all dates are null", () => {
    expect(nextExam([{ examDate: null }], now)).toBeNull();
  });

  test("returns null when all exams are past", () => {
    expect(nextExam([{ examDate: "2026-05-01" }], now)).toBeNull();
  });

  test("returns closest future exam", () => {
    const quals = [
      { examDate: "2026-06-15" },
      { examDate: "2026-07-01" },
      { examDate: "2026-06-10" },
    ];
    const result = nextExam(quals, now);
    expect(result).toEqual({ examDate: "2026-06-10", daysLeft: 9 });
  });

  test("ignores past exams", () => {
    const quals = [
      { examDate: "2026-05-01" },
      { examDate: "2026-06-15" },
    ];
    const result = nextExam(quals, now);
    expect(result).toEqual({ examDate: "2026-06-15", daysLeft: 14 });
  });

  test("includes exam happening today", () => {
    const quals = [{ examDate: "2026-06-01" }];
    const result = nextExam(quals, now);
    expect(result).toEqual({ examDate: "2026-06-01", daysLeft: 0 });
  });
});

describe("getQueueActionTitle", () => {
  test("returns a learner-friendly action title", () => {
    expect(getQueueActionTitle("retrieval_drill", "Cell division")).toBe(
      "Pull Cell division out of memory"
    );
    expect(getQueueActionTitle("mistake_review", "Inheritance")).toBe(
      "Correct the slip in Inheritance"
    );
  });
});

describe("getQueueImpact", () => {
  test("explains why each block type matters", () => {
    expect(getQueueImpact("retrieval_drill")).toContain("memory");
    expect(getQueueImpact("timed_problems")).toContain("exam-ready");
  });
});

describe("getQueuePositionLabel", () => {
  test("returns labels based on queue order", () => {
    expect(getQueuePositionLabel(0)).toBe("Start here");
    expect(getQueuePositionLabel(1)).toBe("Then");
    expect(getQueuePositionLabel(2)).toBe("Keep going");
    expect(getQueuePositionLabel(3)).toBe("If you still have time");
  });
});

describe("buildQueueWhyNow", () => {
  const now = new Date("2026-03-18T12:00:00Z");

  test("prioritises active misconceptions when present", () => {
    expect(
      buildQueueWhyNow({
        topicName: "Cell division",
        reviewReason: "misconception",
        masteryLevel: 0.4,
        confidence: 0.4,
        reviewCount: 2,
        nextReviewAt: null,
        examDate: null,
        activeMisconceptionCount: 1,
        activeMisconceptionDescription: "mixing up mitosis and meiosis",
        now,
      })
    ).toContain("mixing up mitosis and meiosis");
  });

  test("calls out exam urgency when exams are close", () => {
    expect(
      buildQueueWhyNow({
        topicName: "Inheritance",
        reviewReason: "exam_approaching",
        masteryLevel: 0.7,
        confidence: 0.7,
        reviewCount: 5,
        nextReviewAt: null,
        examDate: "2026-03-28",
        now,
      })
    ).toContain("exam");
  });

  test("calls out fading knowledge when a topic is due now", () => {
    expect(
      buildQueueWhyNow({
        topicName: "Osmosis",
        reviewReason: "decay",
        masteryLevel: 0.7,
        confidence: 0.7,
        reviewCount: 4,
        nextReviewAt: new Date("2026-03-17T12:00:00Z"),
        examDate: null,
        now,
      })
    ).toContain("due for review now");
  });

  test("falls back to foundation-building language for weak topics", () => {
    expect(
      buildQueueWhyNow({
        topicName: "Photosynthesis",
        reviewReason: null,
        masteryLevel: 0.1,
        confidence: 0.1,
        reviewCount: 0,
        nextReviewAt: null,
        examDate: null,
        now,
      })
    ).toContain("first layer of understanding");
  });
});
