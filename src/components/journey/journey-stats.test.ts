// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { JourneyStats, JourneyStat, type JourneyStatsProps } from "./journey-stats";
import type { JourneyStats as JourneyStatsType } from "./types";

function makeStats(overrides?: Partial<JourneyStatsType>): JourneyStatsType {
  return {
    sessionsCompleted: 12,
    totalStudyMinutes: 360,
    misconceptionsTotal: 8,
    misconceptionsConquered: 5,
    specCoveragePercent: 65.5,
    topicsCovered: 20,
    totalTopics: 30,
    ...overrides,
  };
}

describe("JourneyStat", () => {
  it("renders label and value", () => {
    render(
      createElement(JourneyStat, {
        label: "Sessions",
        value: "12",
        testId: "test-stat",
      })
    );
    const stat = screen.getByTestId("test-stat");
    expect(stat.textContent).toContain("Sessions");
    expect(stat.textContent).toContain("12");
  });

  it("renders detail when provided", () => {
    render(
      createElement(JourneyStat, {
        label: "Sessions",
        value: "12",
        detail: "360 min total",
        testId: "test-stat",
      })
    );
    expect(screen.getByTestId("test-stat").textContent).toContain(
      "360 min total"
    );
  });

  it("renders teal accent styles", () => {
    render(
      createElement(JourneyStat, {
        label: "Test",
        value: "1",
        accent: "teal",
        testId: "test-stat",
      })
    );
    const el = screen.getByTestId("test-stat");
    expect(el.className).toContain("border-[#2D7A6E]");
    expect(el.className).toContain("bg-[#E4F0ED]");
  });

  it("renders coral accent styles", () => {
    render(
      createElement(JourneyStat, {
        label: "Test",
        value: "1",
        accent: "coral",
        testId: "test-stat",
      })
    );
    const el = screen.getByTestId("test-stat");
    expect(el.className).toContain("border-[#D4654A]");
    expect(el.className).toContain("bg-[#FAEAE5]");
  });

  it("renders neutral accent by default", () => {
    render(
      createElement(JourneyStat, {
        label: "Test",
        value: "1",
        testId: "test-stat",
      })
    );
    const el = screen.getByTestId("test-stat");
    expect(el.className).toContain("border-[#E5E0D6]");
    expect(el.className).toContain("bg-white");
  });
});

describe("JourneyStats", () => {
  function h(props: JourneyStatsProps) {
    return createElement(JourneyStats, props);
  }

  it("renders all four stat cards", () => {
    render(h({ stats: makeStats() }));
    expect(screen.getByTestId("stat-sessions")).toBeTruthy();
    expect(screen.getByTestId("stat-conquered")).toBeTruthy();
    expect(screen.getByTestId("stat-active")).toBeTruthy();
    expect(screen.getByTestId("stat-coverage")).toBeTruthy();
  });

  it("displays sessions count and minutes", () => {
    render(h({ stats: makeStats() }));
    const sessions = screen.getByTestId("stat-sessions");
    expect(sessions.textContent).toContain("12");
    expect(sessions.textContent).toContain("360 min total");
  });

  it("displays conquered count and percentage", () => {
    render(h({ stats: makeStats() }));
    const conquered = screen.getByTestId("stat-conquered");
    expect(conquered.textContent).toContain("5");
    expect(conquered.textContent).toContain("63%");
    expect(conquered.textContent).toContain("8 total");
  });

  it("shows 'None encountered yet' when no misconceptions", () => {
    render(
      h({
        stats: makeStats({
          misconceptionsTotal: 0,
          misconceptionsConquered: 0,
        }),
      })
    );
    expect(screen.getByTestId("stat-conquered").textContent).toContain(
      "None encountered yet"
    );
  });

  it("displays active misconception count", () => {
    render(h({ stats: makeStats() }));
    expect(screen.getByTestId("stat-active").textContent).toContain("3");
  });

  it("displays spec coverage", () => {
    render(h({ stats: makeStats() }));
    const coverage = screen.getByTestId("stat-coverage");
    expect(coverage.textContent).toContain("65.5%");
    expect(coverage.textContent).toContain("20 of 30 topics");
  });

  it("uses teal accent for conquered when count > 0", () => {
    render(h({ stats: makeStats() }));
    expect(screen.getByTestId("stat-conquered").className).toContain(
      "border-[#2D7A6E]"
    );
  });

  it("uses coral accent for active when count > 0", () => {
    render(h({ stats: makeStats() }));
    expect(screen.getByTestId("stat-active").className).toContain(
      "border-[#D4654A]"
    );
  });

  it("uses neutral accent for active when count is 0", () => {
    render(
      h({
        stats: makeStats({
          misconceptionsTotal: 3,
          misconceptionsConquered: 3,
        }),
      })
    );
    expect(screen.getByTestId("stat-active").className).toContain(
      "border-[#E5E0D6]"
    );
  });

  it("uses teal for coverage when >= 50%", () => {
    render(h({ stats: makeStats({ specCoveragePercent: 50 }) }));
    expect(screen.getByTestId("stat-coverage").className).toContain(
      "border-[#2D7A6E]"
    );
  });

  it("uses neutral for coverage when < 50%", () => {
    render(h({ stats: makeStats({ specCoveragePercent: 30 }) }));
    expect(screen.getByTestId("stat-coverage").className).toContain(
      "border-[#E5E0D6]"
    );
  });
});
