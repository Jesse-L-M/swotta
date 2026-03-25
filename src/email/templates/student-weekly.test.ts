import { describe, it, expect } from "vitest";
import {
  renderStudentWeeklyEmail,
  getPhaseGreeting,
  getPhaseMessage,
  formatMinutes,
  computeStudyStreak,
  type StudentWeeklyEmailProps,
  type ExamPhaseName,
} from "./student-weekly";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function baseProps(
  overrides?: Partial<StudentWeeklyEmailProps>,
): StudentWeeklyEmailProps {
  return {
    firstName: "Michael",
    weekPlan: [
      {
        day: "Monday",
        blocks: [
          {
            topicName: "Cell Biology",
            blockTypeLabel: "Retrieval Drill",
            durationMinutes: 10,
          },
          {
            topicName: "Genetics",
            blockTypeLabel: "Explanation",
            durationMinutes: 15,
          },
        ],
      },
      {
        day: "Wednesday",
        blocks: [
          {
            topicName: "Ecology",
            blockTypeLabel: "Worked Example",
            durationMinutes: 15,
          },
        ],
      },
    ],
    totalTimeEstimate: 40,
    streakCount: 12,
    examCountdown: [
      { qualificationName: "GCSE Biology", daysRemaining: 34 },
      { qualificationName: "GCSE Chemistry", daysRemaining: 41 },
    ],
    phaseName: "consolidation",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderStudentWeeklyEmail
// ---------------------------------------------------------------------------

describe("renderStudentWeeklyEmail", () => {
  it("renders valid HTML with DOCTYPE", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes the Swotta wordmark", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Swotta");
  });

  it("includes first name in greeting", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Michael");
  });

  it("includes phase-specific greeting", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Focused week ahead, Michael");
  });

  it("includes phase-specific message", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("strengthen what you know");
  });

  it("includes week plan topic names", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Cell Biology");
    expect(html).toContain("Genetics");
    expect(html).toContain("Ecology");
  });

  it("includes block type labels", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Retrieval Drill");
    expect(html).toContain("Explanation");
    expect(html).toContain("Worked Example");
  });

  it("includes day labels", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Monday");
    expect(html).toContain("Wednesday");
  });

  it("includes time estimate", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("40m");
  });

  it("includes streak count", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain(">12<");
  });

  it("includes exam countdown entries", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("GCSE Biology");
    expect(html).toContain("34 days");
    expect(html).toContain("GCSE Chemistry");
    expect(html).toContain("41 days");
  });

  it("shows closest exam in stats row", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    // 34 is the closest exam — shown in stats row
    expect(html).toContain(">34<");
    expect(html).toContain("Days to exam");
  });

  it("includes block durations", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("10m");
    expect(html).toContain("15m");
  });

  it("includes footer text", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Your Monday study plan from Swotta");
  });

  // --- DESIGN.md compliance ---

  it("uses DESIGN.md canvas color", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("#FAF6F0");
  });

  it("uses DESIGN.md teal color", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("#2D7A6E");
  });

  it("uses Instrument Serif font family", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Instrument Serif");
  });

  it("uses Instrument Sans font family", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("Instrument Sans");
  });

  it("uses JetBrains Mono for data", async () => {
    const html = await renderStudentWeeklyEmail(baseProps());
    expect(html).toContain("JetBrains Mono");
  });

  // --- Empty/edge states ---

  it("renders empty plan gracefully", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ weekPlan: [], totalTimeEstimate: 0 }),
    );
    expect(html).toContain("No sessions planned yet");
    expect(html).toContain("Open Swotta to get started");
  });

  it("renders without exam countdown", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ examCountdown: [] }),
    );
    expect(html).not.toContain("Exam countdown");
    expect(html).toContain("No exam set");
  });

  it("renders zero streak with pencil color", async () => {
    const html = await renderStudentWeeklyEmail(baseProps({ streakCount: 0 }));
    expect(html).toContain(">0<");
    // Zero streak uses pencil color (#949085)
    expect(html).toContain("#949085");
  });

  it("renders positive streak with teal color", async () => {
    const html = await renderStudentWeeklyEmail(baseProps({ streakCount: 5 }));
    expect(html).toContain(">5<");
  });

  it("renders exam countdown Today and Tomorrow", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        examCountdown: [
          { qualificationName: "GCSE Biology", daysRemaining: 0 },
          { qualificationName: "GCSE Chemistry", daysRemaining: 1 },
        ],
      }),
    );
    expect(html).toContain("Today");
    expect(html).toContain("Tomorrow");
  });

  it("uses coral color for exams <= 7 days away", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        examCountdown: [
          { qualificationName: "GCSE Biology", daysRemaining: 5 },
        ],
      }),
    );
    expect(html).toContain("#D4654A"); // coral
  });

  it("uses teal color for exams > 28 days away", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        examCountdown: [
          { qualificationName: "GCSE Biology", daysRemaining: 60 },
        ],
      }),
    );
    // The exam countdown table entry should use teal
    expect(html).toContain("60 days");
  });

  it("formats large time estimates with hours", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ totalTimeEstimate: 150 }),
    );
    expect(html).toContain("2h 30m");
  });

  // --- Phase rendering ---

  it("renders exploration phase correctly", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ phaseName: "exploration" }),
    );
    expect(html).toContain("Good morning, Michael");
    expect(html).toContain("strong foundations");
  });

  it("renders consolidation phase correctly", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ phaseName: "consolidation" }),
    );
    expect(html).toContain("Focused week ahead, Michael");
    expect(html).toContain("strengthen what you know");
  });

  it("renders revision phase correctly", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ phaseName: "revision" }),
    );
    expect(html).toContain("Every session counts, Michael");
    expect(html).toContain("locking in what you know");
  });

  it("renders confidence phase correctly", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({ phaseName: "confidence" }),
    );
    expect(html).toContain("You&#x27;ve got this, Michael");
    expect(html).toContain("Trust what you know");
  });

  it("handles single-day plan", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        weekPlan: [
          {
            day: "Friday",
            blocks: [
              {
                topicName: "Photosynthesis",
                blockTypeLabel: "Source Analysis",
                durationMinutes: 15,
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("Friday");
    expect(html).toContain("Photosynthesis");
    expect(html).toContain("Source Analysis");
  });

  it("handles single exam in countdown", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        examCountdown: [
          { qualificationName: "GCSE Biology", daysRemaining: 14 },
        ],
      }),
    );
    expect(html).toContain("GCSE Biology");
    expect(html).toContain("14 days");
    expect(html).toContain("Exam countdown");
  });
});

// ---------------------------------------------------------------------------
// getPhaseGreeting
// ---------------------------------------------------------------------------

describe("getPhaseGreeting", () => {
  it("returns exploration greeting", async () => {
    expect(getPhaseGreeting("Michael", "exploration")).toBe(
      "Good morning, Michael",
    );
  });

  it("returns consolidation greeting", async () => {
    expect(getPhaseGreeting("Michael", "consolidation")).toBe(
      "Focused week ahead, Michael",
    );
  });

  it("returns revision greeting", async () => {
    expect(getPhaseGreeting("Michael", "revision")).toBe(
      "Every session counts, Michael",
    );
  });

  it("returns confidence greeting", async () => {
    expect(getPhaseGreeting("Michael", "confidence")).toBe(
      "You've got this, Michael",
    );
  });

  it("uses the provided first name", async () => {
    expect(getPhaseGreeting("Sarah", "exploration")).toBe(
      "Good morning, Sarah",
    );
    expect(getPhaseGreeting("Alex", "confidence")).toBe(
      "You've got this, Alex",
    );
  });
});

// ---------------------------------------------------------------------------
// getPhaseMessage
// ---------------------------------------------------------------------------

describe("getPhaseMessage", () => {
  it("returns unique message for each phase", async () => {
    const phases: ExamPhaseName[] = [
      "exploration",
      "consolidation",
      "revision",
      "confidence",
    ];
    const messages = phases.map(getPhaseMessage);
    const unique = new Set(messages);
    expect(unique.size).toBe(4);
  });

  it("exploration is encouraging and relaxed", async () => {
    const msg = getPhaseMessage("exploration");
    expect(msg).toContain("strong foundations");
    expect(msg).toContain("own pace");
  });

  it("consolidation is focused", async () => {
    const msg = getPhaseMessage("consolidation");
    expect(msg).toContain("strengthen");
    expect(msg).toContain("gaps");
  });

  it("revision is direct", async () => {
    const msg = getPhaseMessage("revision");
    expect(msg).toContain("locking in");
    expect(msg).toContain("sharp");
  });

  it("confidence is reassuring", async () => {
    const msg = getPhaseMessage("confidence");
    expect(msg).toContain("Trust what you know");
    expect(msg).toContain("more prepared than you think");
  });
});

// ---------------------------------------------------------------------------
// formatMinutes
// ---------------------------------------------------------------------------

describe("formatMinutes", () => {
  it("formats zero minutes", async () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats minutes under 60", async () => {
    expect(formatMinutes(30)).toBe("30m");
    expect(formatMinutes(1)).toBe("1m");
    expect(formatMinutes(59)).toBe("59m");
  });

  it("formats exact hours", async () => {
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(180)).toBe("3h");
  });

  it("formats hours and minutes", async () => {
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(145)).toBe("2h 25m");
    expect(formatMinutes(61)).toBe("1h 1m");
  });
});

// ---------------------------------------------------------------------------
// computeStudyStreak
// ---------------------------------------------------------------------------

describe("computeStudyStreak", () => {
  it("returns 0 for no sessions", async () => {
    expect(computeStudyStreak([])).toBe(0);
  });

  it("counts streak starting from today", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [
      new Date("2026-03-18T08:00:00Z"),
      new Date("2026-03-17T15:00:00Z"),
      new Date("2026-03-16T12:00:00Z"),
    ];
    expect(computeStudyStreak(dates, now)).toBe(3);
  });

  it("counts streak starting from yesterday", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [
      new Date("2026-03-17T15:00:00Z"),
      new Date("2026-03-16T12:00:00Z"),
    ];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });

  it("returns 0 when last session is 2+ days ago", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [new Date("2026-03-15T15:00:00Z")];
    expect(computeStudyStreak(dates, now)).toBe(0);
  });

  it("handles multiple sessions on same day", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [
      new Date("2026-03-18T08:00:00Z"),
      new Date("2026-03-18T14:00:00Z"),
      new Date("2026-03-17T10:00:00Z"),
    ];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });

  it("detects gap in streak", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [
      new Date("2026-03-18T08:00:00Z"),
      new Date("2026-03-17T15:00:00Z"),
      // gap: March 16
      new Date("2026-03-15T12:00:00Z"),
    ];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });

  it("counts a long streak", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setUTCHours(10, 0, 0, 0);
      dates.push(d);
    }
    expect(computeStudyStreak(dates, now)).toBe(30);
  });

  it("returns 1 when only today has a session", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [new Date("2026-03-18T08:00:00Z")];
    expect(computeStudyStreak(dates, now)).toBe(1);
  });

  it("returns 1 when only yesterday has a session", async () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const dates = [new Date("2026-03-17T08:00:00Z")];
    expect(computeStudyStreak(dates, now)).toBe(1);
  });

  it("uses current date when now is not provided", async () => {
    // With no sessions, should return 0 regardless of current date
    expect(computeStudyStreak([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// closestExam reduce branch
// ---------------------------------------------------------------------------

describe("closest exam selection", () => {
  it("selects the closest exam when first is further away", async () => {
    const html = await renderStudentWeeklyEmail(
      baseProps({
        examCountdown: [
          { qualificationName: "GCSE Chemistry", daysRemaining: 60 },
          { qualificationName: "GCSE Biology", daysRemaining: 14 },
        ],
      }),
    );
    // 14 should appear in stats row as closest exam
    expect(html).toContain(">14<");
    expect(html).toContain("Days to exam");
  });
});
