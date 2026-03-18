import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyPatterns, formatMinutes } from "./study-patterns";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("StudyPatterns", () => {
  it("renders session count, study time, and topics", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 5,
        totalStudyMinutes: 120,
        topicsReviewed: 3,
      }),
    );
    expect(html).toContain("5");
    expect(html).toContain("2h");
    expect(html).toContain("3");
    expect(html).toContain("Sessions");
    expect(html).toContain("Study time");
    expect(html).toContain("Topics");
  });

  it("renders zero values", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 0,
        totalStudyMinutes: 0,
        topicsReviewed: 0,
      }),
    );
    expect(html).toContain(">0<");
  });

  it("renders daily breakdown when provided", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
        dailyBreakdown: [
          { dayLabel: "Mon", minutes: 30 },
          { dayLabel: "Tue", minutes: 0 },
          { dayLabel: "Wed", minutes: 60 },
        ],
      }),
    );
    expect(html).toContain("daily-breakdown");
    expect(html).toContain("Mon");
    expect(html).toContain("Tue");
    expect(html).toContain("Wed");
    expect(html).toContain("Daily activity");
  });

  it("does not render daily breakdown when not provided", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      }),
    );
    expect(html).not.toContain("daily-breakdown");
  });

  it("does not render daily breakdown when array is empty", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
        dailyBreakdown: [],
      }),
    );
    expect(html).not.toContain("daily-breakdown");
  });

  it("uses serif font for stat values", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 5,
        totalStudyMinutes: 120,
        topicsReviewed: 3,
      }),
    );
    expect(html).toContain("font-serif");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(StudyPatterns, {
        sessionsCompleted: 1,
        totalStudyMinutes: 30,
        topicsReviewed: 1,
        className: "extra",
      }),
    );
    expect(html).toContain("extra");
  });
});

describe("formatMinutes", () => {
  it("formats minutes under 60 as Xm", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats exactly 60 as 1h", () => {
    expect(formatMinutes(60)).toBe("1h");
  });

  it("formats 90 as 1h 30m", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });

  it("formats 120 as 2h", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("formats 0 as 0m", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats 150 as 2h 30m", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
  });
});
