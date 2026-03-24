import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerCard } from "./learner-card";
import type { WeeklyReportData, LearnerId } from "@/lib/types";

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
    summary: "Good week.",
    ...overrides,
  };
}

describe("LearnerCard", () => {
  it("renders learner name", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice Smith",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).toContain("Alice Smith");
  });

  it("renders year group when provided", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 11,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).toContain("Year 11");
  });

  it("does not render year group when null", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: null,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).not.toContain("Year");
  });

  it("renders 'View details' link with correct href", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "abc-123",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).toContain('href="/parent/learners/abc-123"');
    expect(html).toContain("View details");
  });

  it("renders report stats when latestReport is provided", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: makeReport({
          sessionsCompleted: 7,
          totalStudyMinutes: 200,
          topicsReviewed: 5,
        }),
        activeFlags: [],
      }),
    );
    expect(html).toContain("7");
    expect(html).toContain("200");
    expect(html).toContain("5");
    expect(html).toContain("Sessions");
    expect(html).toContain("Minutes");
    expect(html).toContain("Topics");
  });

  it("renders 'No reports yet' when no latestReport", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).toContain("No reports yet");
  });

  it("renders exam countdown section when exams present", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [
          {
            qualificationName: "GCSE Biology",
            examDate: new Date("2026-06-15"),
            daysRemaining: 89,
          },
        ],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).toContain("Upcoming exams");
    expect(html).toContain("GCSE Biology");
    expect(html).toContain("89 days");
  });

  it("does not render exam section when no exams", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).not.toContain("Upcoming exams");
  });

  it("renders active flags section when flags present", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [
          { type: "disengagement", description: "No sessions in 5 days", severity: "high" },
        ],
      }),
    );
    expect(html).toContain("Attention needed");
    expect(html).toContain("Disengagement");
    expect(html).toContain("No sessions in 5 days");
  });

  it("does not render flags section when no active flags", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
      }),
    );
    expect(html).not.toContain("Attention needed");
  });

  it("uses serif font for stat values", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: makeReport(),
        activeFlags: [],
      }),
    );
    expect(html).toContain("font-serif");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(LearnerCard, {
        id: "l1",
        displayName: "Alice",
        yearGroup: 10,
        exams: [],
        latestReport: null,
        activeFlags: [],
        className: "my-card",
      }),
    );
    expect(html).toContain("my-card");
  });
});
