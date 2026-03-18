import { describe, it, expect } from "vitest";
import { renderWeeklyReportEmail } from "./weekly-report";
import type { WeeklyReportData, LearnerId, TopicId } from "@/lib/types";
import type { WeeklyReportEmailProps } from "./weekly-report";

function makeReport(overrides?: Partial<WeeklyReportData>): WeeklyReportData {
  return {
    learnerId: "test-id" as LearnerId,
    periodStart: new Date("2026-03-09"),
    periodEnd: new Date("2026-03-15"),
    sessionsCompleted: 5,
    totalStudyMinutes: 120,
    topicsReviewed: 3,
    masteryChanges: [],
    flags: [],
    summary: "A productive week of study.",
    ...overrides,
  };
}

function makeProps(overrides?: Partial<WeeklyReportEmailProps>): WeeklyReportEmailProps {
  return {
    data: makeReport(),
    learnerName: "Alice Smith",
    ...overrides,
  };
}

describe("renderWeeklyReportEmail", () => {
  it("renders DOCTYPE and basic HTML structure", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders learner name in header", () => {
    const html = renderWeeklyReportEmail(makeProps({ learnerName: "Charlie Jones" }));
    expect(html).toContain("Charlie Jones");
  });

  it("renders weekly study report title", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).toContain("Weekly Study Report");
  });

  it("renders date range in header", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).toContain("9 March 2026");
    expect(html).toContain("15 March 2026");
  });

  it("renders key metrics with serif font", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        sessionsCompleted: 7,
        totalStudyMinutes: 200,
        topicsReviewed: 5,
      }),
    }));
    expect(html).toContain("7");
    expect(html).toContain("200");
    expect(html).toContain("5");
    expect(html).toContain("Sessions");
    expect(html).toContain("Minutes Studied");
    expect(html).toContain("Topics Reviewed");
    expect(html).toContain("Georgia");
  });

  it("renders summary section", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({ summary: "Great progress this week!" }),
    }));
    expect(html).toContain("Summary");
    expect(html).toContain("Great progress this week!");
  });

  it("renders strengths section for positive mastery changes", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Cell Biology", before: 0.4, after: 0.7, delta: 0.3 },
        ],
      }),
    }));
    expect(html).toContain("Strengths");
    expect(html).toContain("Cell Biology");
    expect(html).toContain("+30% mastery");
    // Green left border for strengths
    expect(html).toContain("#059669");
  });

  it("does not render strengths section when no positive changes", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "X", before: 0.5, after: 0.3, delta: -0.2 },
        ],
      }),
    }));
    expect(html).not.toContain("Strengths");
  });

  it("renders areas to watch section for negative mastery changes", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Ecology", before: 0.7, after: 0.5, delta: -0.2 },
        ],
      }),
    }));
    expect(html).toContain("Areas to Watch");
    expect(html).toContain("Ecology");
    expect(html).toContain("-20% mastery");
    // Yellow left border for declining
    expect(html).toContain("#d97706");
  });

  it("renders areas to watch for low mastery even with positive delta", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Weak Topic", before: 0.2, after: 0.3, delta: 0.1 },
        ],
      }),
    }));
    expect(html).toContain("Areas to Watch");
    expect(html).toContain("Weak Topic");
    expect(html).toContain("needs attention");
  });

  it("does not render areas to watch when all topics are healthy", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Good", before: 0.5, after: 0.7, delta: 0.2 },
        ],
      }),
    }));
    expect(html).not.toContain("Areas to Watch");
  });

  it("renders multiple strengths with spacing between items", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Bio", before: 0.3, after: 0.6, delta: 0.3 },
          { topicId: "t2" as TopicId, topicName: "Chem", before: 0.4, after: 0.7, delta: 0.3 },
        ],
      }),
    }));
    expect(html).toContain("Bio");
    expect(html).toContain("Chem");
    expect(html).toContain("Strengths");
  });

  it("renders multiple areas to watch with spacing between items", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Decline1", before: 0.7, after: 0.5, delta: -0.2 },
          { topicId: "t2" as TopicId, topicName: "Decline2", before: 0.6, after: 0.4, delta: -0.2 },
        ],
      }),
    }));
    expect(html).toContain("Decline1");
    expect(html).toContain("Decline2");
    expect(html).toContain("Areas to Watch");
  });

  it("renders mastery progress table", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Cell Biology", before: 0.4, after: 0.6, delta: 0.2 },
          { topicId: "t2" as TopicId, topicName: "Ecology", before: 0.7, after: 0.5, delta: -0.2 },
        ],
      }),
    }));
    expect(html).toContain("Mastery Progress");
    expect(html).toContain("Cell Biology");
    expect(html).toContain("+20%");
    expect(html).toContain("Ecology");
    expect(html).toContain("-20%");
  });

  it("does not render mastery progress when no changes", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({ masteryChanges: [] }),
    }));
    expect(html).not.toContain("Mastery Progress");
  });

  it("renders mastery delta with green for positive, red for negative", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Up", before: 0.4, after: 0.6, delta: 0.2 },
          { topicId: "t2" as TopicId, topicName: "Down", before: 0.6, after: 0.4, delta: -0.2 },
        ],
      }),
    }));
    // Green for positive
    expect(html).toContain("#059669");
    // Red for negative
    expect(html).toContain("#dc2626");
  });

  it("renders flags section with three-state left-border alerts", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        flags: [
          { type: "disengagement", description: "No sessions", severity: "high" },
          { type: "avoidance", description: "Skipping topics", severity: "medium" },
          { type: "minor", description: "Low concern", severity: "low" },
        ],
      }),
    }));
    expect(html).toContain("Attention Needed");
    expect(html).toContain("disengagement");
    expect(html).toContain("No sessions");
    expect(html).toContain("avoidance");
    // Three-state border colors
    expect(html).toContain(`border-left:3px solid #dc2626`); // high → red
    expect(html).toContain(`border-left:3px solid #d97706`); // medium → yellow
    expect(html).toContain(`border-left:3px solid #6b7280`); // low → muted
  });

  it("does not render flags section when no flags", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({ flags: [] }),
    }));
    expect(html).not.toContain("Attention Needed");
  });

  it("renders flag severity backgrounds", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        flags: [
          { type: "high", description: "Critical", severity: "high" },
          { type: "med", description: "Warning", severity: "medium" },
          { type: "low", description: "Info", severity: "low" },
        ],
      }),
    }));
    expect(html).toContain("#fef2f2"); // red bg
    expect(html).toContain("#fffbeb"); // yellow bg
    expect(html).toContain("#f9fafb"); // default bg
  });

  it("renders footer", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).toContain("generated by Swotta");
  });

  it("renders without optional exam countdown", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).not.toContain("Exam Countdown");
  });

  it("renders exam countdown section when provided", () => {
    const html = renderWeeklyReportEmail(makeProps({
      examCountdown: [
        { qualificationName: "GCSE Biology", daysRemaining: 89, examDateFormatted: "15 June 2026" },
        { qualificationName: "GCSE Chemistry", daysRemaining: 12, examDateFormatted: "31 March 2026" },
      ],
    }));
    expect(html).toContain("Exam Countdown");
    expect(html).toContain("GCSE Biology");
    expect(html).toContain("89 days");
    expect(html).toContain("GCSE Chemistry");
    expect(html).toContain("12 days");
  });

  it("renders red text for exams within 14 days", () => {
    const html = renderWeeklyReportEmail(makeProps({
      examCountdown: [
        { qualificationName: "Exam", daysRemaining: 10, examDateFormatted: "28 March" },
      ],
    }));
    expect(html).toContain("#dc2626"); // red
  });

  it("renders amber text for exams within 30 days", () => {
    const html = renderWeeklyReportEmail(makeProps({
      examCountdown: [
        { qualificationName: "Exam", daysRemaining: 25, examDateFormatted: "12 April" },
      ],
    }));
    expect(html).toContain("#d97706"); // amber
  });

  it("renders 'Today' for 0 days remaining", () => {
    const html = renderWeeklyReportEmail(makeProps({
      examCountdown: [
        { qualificationName: "Exam", daysRemaining: 0, examDateFormatted: "Today" },
      ],
    }));
    expect(html).toContain("Today");
  });

  it("renders 'Tomorrow' for 1 day remaining", () => {
    const html = renderWeeklyReportEmail(makeProps({
      examCountdown: [
        { qualificationName: "Exam", daysRemaining: 1, examDateFormatted: "Tomorrow" },
      ],
    }));
    expect(html).toContain("Tomorrow");
  });

  it("does not render exam countdown for empty array", () => {
    const html = renderWeeklyReportEmail(makeProps({ examCountdown: [] }));
    expect(html).not.toContain("Exam Countdown");
  });

  it("renders study patterns section when provided", () => {
    const html = renderWeeklyReportEmail(makeProps({
      studyPatterns: {
        dailyBreakdown: [
          { dayLabel: "Mon", minutes: 30 },
          { dayLabel: "Tue", minutes: 0 },
          { dayLabel: "Wed", minutes: 45 },
        ],
        averageSessionMinutes: 25,
        studyDays: 4,
      },
    }));
    expect(html).toContain("Study Patterns");
    expect(html).toContain("4/7");
    expect(html).toContain("25m");
    expect(html).toContain("Mon");
    expect(html).toContain("Tue");
    expect(html).toContain("Wed");
  });

  it("does not render study patterns when not provided", () => {
    const html = renderWeeklyReportEmail(makeProps());
    expect(html).not.toContain("Study Patterns");
  });

  it("renders study patterns with daily breakdown bars", () => {
    const html = renderWeeklyReportEmail(makeProps({
      studyPatterns: {
        dailyBreakdown: [
          { dayLabel: "Mon", minutes: 30 },
          { dayLabel: "Tue", minutes: 0 },
        ],
        averageSessionMinutes: 30,
        studyDays: 1,
      },
    }));
    // Active day should have primary color
    expect(html).toContain("#2563eb");
  });

  it("renders with all sections simultaneously", () => {
    const html = renderWeeklyReportEmail({
      data: makeReport({
        sessionsCompleted: 10,
        totalStudyMinutes: 300,
        topicsReviewed: 8,
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Strong", before: 0.5, after: 0.8, delta: 0.3 },
          { topicId: "t2" as TopicId, topicName: "Weak", before: 0.6, after: 0.4, delta: -0.2 },
        ],
        flags: [
          { type: "avoidance", description: "Skipping", severity: "medium" },
        ],
        summary: "Mixed week.",
      }),
      learnerName: "Alice",
      examCountdown: [
        { qualificationName: "Bio", daysRemaining: 50, examDateFormatted: "1 May" },
      ],
      studyPatterns: {
        dailyBreakdown: [{ dayLabel: "Mon", minutes: 60 }],
        averageSessionMinutes: 30,
        studyDays: 5,
      },
    });
    expect(html).toContain("Weekly Study Report");
    expect(html).toContain("Study Patterns");
    expect(html).toContain("Summary");
    expect(html).toContain("Strengths");
    expect(html).toContain("Areas to Watch");
    expect(html).toContain("Mastery Progress");
    expect(html).toContain("Exam Countdown");
    expect(html).toContain("Attention Needed");
  });

  it("backward compatible: renders correctly with only data and learnerName", () => {
    const html = renderWeeklyReportEmail({
      data: makeReport({
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        summary: "OK week.",
      }),
      learnerName: "Bob",
    });
    expect(html).toContain("Bob");
    expect(html).toContain("OK week.");
    expect(html).toContain("3");
    expect(html).toContain("60");
    expect(html).not.toContain("Study Patterns");
    expect(html).not.toContain("Exam Countdown");
  });

  it("renders zero mastery delta with muted color", () => {
    const html = renderWeeklyReportEmail(makeProps({
      data: makeReport({
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Stable", before: 0.5, after: 0.5, delta: 0 },
        ],
      }),
    }));
    expect(html).toContain("#6b7280"); // muted color for 0 delta
  });
});
