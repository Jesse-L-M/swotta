import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExamCountdown, computeExamCountdown } from "./exam-countdown";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("ExamCountdown", () => {
  it("renders empty state when no exams", () => {
    const html = render(
      React.createElement(ExamCountdown, { exams: [] }),
    );
    expect(html).toContain("No upcoming exams");
    expect(html).toContain("exam-countdown-empty");
  });

  it("renders exam name and days remaining", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "GCSE Biology",
            examDate: new Date("2026-06-15"),
            daysRemaining: 89,
          },
        ],
      }),
    );
    expect(html).toContain("GCSE Biology");
    expect(html).toContain("89 days");
  });

  it("renders 'Today' for 0 days", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 0,
          },
        ],
      }),
    );
    expect(html).toContain("Today");
  });

  it("renders 'Tomorrow' for 1 day", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 1,
          },
        ],
      }),
    );
    expect(html).toContain("Tomorrow");
  });

  it("applies red text for exams within 14 days", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 10,
          },
        ],
      }),
    );
    expect(html).toContain("text-red-600");
  });

  it("applies amber text for exams within 30 days", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 25,
          },
        ],
      }),
    );
    expect(html).toContain("text-amber-600");
  });

  it("applies default text for exams beyond 30 days", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 60,
          },
        ],
      }),
    );
    expect(html).toContain("text-foreground");
    expect(html).not.toContain("text-red-600");
    expect(html).not.toContain("text-amber-600");
  });

  it("renders multiple exams", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Biology",
            examDate: new Date(),
            daysRemaining: 30,
          },
          {
            qualificationName: "Chemistry",
            examDate: new Date(),
            daysRemaining: 45,
          },
        ],
      }),
    );
    expect(html).toContain("Biology");
    expect(html).toContain("Chemistry");
  });

  it("uses serif font for stat values", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 50,
          },
        ],
      }),
    );
    expect(html).toContain("font-serif");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(ExamCountdown, {
        exams: [
          {
            qualificationName: "Exam",
            examDate: new Date(),
            daysRemaining: 50,
          },
        ],
        className: "custom",
      }),
    );
    expect(html).toContain("custom");
  });
});

describe("computeExamCountdown", () => {
  it("filters out qualifications without exam dates", () => {
    const result = computeExamCountdown([
      { name: "Biology", examDate: new Date("2026-06-15") },
      { name: "Chemistry", examDate: null },
    ], new Date("2026-03-01"));
    expect(result).toHaveLength(1);
    expect(result[0].qualificationName).toBe("Biology");
  });

  it("computes days remaining correctly", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const result = computeExamCountdown(
      [{ name: "Bio", examDate: new Date("2026-03-11T00:00:00Z") }],
      now,
    );
    expect(result[0].daysRemaining).toBe(10);
  });

  it("clamps negative days to 0", () => {
    const now = new Date("2026-06-20T00:00:00Z");
    const result = computeExamCountdown(
      [{ name: "Bio", examDate: new Date("2026-06-15T00:00:00Z") }],
      now,
    );
    expect(result[0].daysRemaining).toBe(0);
  });

  it("sorts by days remaining ascending", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const result = computeExamCountdown(
      [
        { name: "Far", examDate: new Date("2026-09-01T00:00:00Z") },
        { name: "Near", examDate: new Date("2026-03-15T00:00:00Z") },
      ],
      now,
    );
    expect(result[0].qualificationName).toBe("Near");
    expect(result[1].qualificationName).toBe("Far");
  });

  it("returns empty array when no qualifications have exam dates", () => {
    const result = computeExamCountdown([
      { name: "A", examDate: null },
      { name: "B", examDate: null },
    ]);
    expect(result).toEqual([]);
  });
});
