import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView, formatDateRange } from "./report-view";
import type { WeeklyReportData, LearnerId, TopicId } from "@/lib/types";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function makeReport(overrides?: Partial<WeeklyReportData>): WeeklyReportData {
  return {
    learnerId: "l1" as LearnerId,
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

describe("ReportView", () => {
  it("renders learner name and date range", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport(),
        learnerName: "Alice Smith",
        exams: [],
      }),
    );
    expect(html).toContain("Alice Smith");
    expect(html).toContain("9 March");
    expect(html).toContain("15 March 2026");
  });

  it("renders study patterns section", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({ sessionsCompleted: 7, totalStudyMinutes: 200, topicsReviewed: 5 }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Study patterns");
    expect(html).toContain("7");
    expect(html).toContain("5");
  });

  it("renders summary section", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({ summary: "Excellent progress in biology." }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Summary");
    expect(html).toContain("Excellent progress in biology.");
  });

  it("renders strengths section when there are positive mastery changes", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Cell Biology", before: 0.4, after: 0.7, delta: 0.3 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Strengths");
    expect(html).toContain("Cell Biology");
    expect(html).toContain("improved by 30%");
  });

  it("does not render strengths section when no positive changes", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Topic", before: 0.5, after: 0.3, delta: -0.2 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).not.toContain("strengths-section");
  });

  it("renders areas to watch section for declining mastery", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Ecology", before: 0.7, after: 0.5, delta: -0.2 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Areas to watch");
    expect(html).toContain("Ecology");
    expect(html).toContain("declined by 20%");
  });

  it("renders areas to watch for low mastery topics", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Chemistry", before: 0.2, after: 0.3, delta: 0.1 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Areas to watch");
    expect(html).toContain("Chemistry");
    expect(html).toContain("needs attention");
  });

  it("does not render areas to watch when all topics are healthy", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Topic", before: 0.5, after: 0.7, delta: 0.2 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).not.toContain("areas-to-watch-section");
  });

  it("renders mastery progress section when there are changes", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          masteryChanges: [
            { topicId: "t1" as TopicId, topicName: "Topic A", before: 0.3, after: 0.5, delta: 0.2 },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Mastery progress");
    expect(html).toContain("Topic A");
  });

  it("does not render mastery progress section when no changes", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({ masteryChanges: [] }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).not.toContain("Mastery progress");
  });

  it("renders exam countdown section when exams provided", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport(),
        learnerName: "Alice",
        exams: [
          {
            qualificationName: "GCSE Biology",
            examDate: new Date("2026-06-15"),
            daysRemaining: 89,
          },
        ],
      }),
    );
    expect(html).toContain("Exam countdown");
    expect(html).toContain("GCSE Biology");
  });

  it("does not render exam countdown section when no exams", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport(),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).not.toContain("Exam countdown");
  });

  it("renders flags section when flags present", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({
          flags: [
            { type: "disengagement", description: "No sessions in 7 days", severity: "high" },
          ],
        }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).toContain("Attention needed");
    expect(html).toContain("Disengagement");
  });

  it("does not render flags section when no flags", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport({ flags: [] }),
        learnerName: "Alice",
        exams: [],
      }),
    );
    expect(html).not.toContain("Attention needed");
  });

  it("renders daily breakdown when provided", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport(),
        learnerName: "Alice",
        exams: [],
        dailyBreakdown: [
          { dayLabel: "Mon", minutes: 30 },
          { dayLabel: "Tue", minutes: 45 },
        ],
      }),
    );
    expect(html).toContain("daily-breakdown");
    expect(html).toContain("Mon");
    expect(html).toContain("Tue");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(ReportView, {
        data: makeReport(),
        learnerName: "Alice",
        exams: [],
        className: "report-custom",
      }),
    );
    expect(html).toContain("report-custom");
  });
});

describe("formatDateRange", () => {
  it("formats a date range correctly", () => {
    const result = formatDateRange(
      new Date("2026-03-09"),
      new Date("2026-03-15"),
    );
    expect(result).toContain("9 March");
    expect(result).toContain("15 March");
    expect(result).toContain("2026");
  });
});
