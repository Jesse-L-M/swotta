// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  PostExamSummary,
  SummaryStatRow,
  TopicList,
  type PostExamSummaryProps,
} from "./post-exam-summary";
import type { PostExamSummary as PostExamSummaryType } from "@/engine/proximity";
import type { TopicId } from "@/lib/types";

function makeSummary(
  overrides?: Partial<PostExamSummaryType>
): PostExamSummaryType {
  return {
    qualificationName: "GCSE Biology",
    examDate: new Date("2026-06-15"),
    sessionsCompleted: 45,
    totalStudyMinutes: 1200,
    misconceptionsTotal: 12,
    misconceptionsResolved: 10,
    specCoveragePercent: 85.5,
    topicsCovered: 60,
    totalTopics: 70,
    averageMastery: 0.72,
    strongestTopics: [
      { topicId: "t1" as TopicId, topicName: "Cell Biology", mastery: 0.95 },
      { topicId: "t2" as TopicId, topicName: "Ecology", mastery: 0.88 },
    ],
    weakestTopics: [
      { topicId: "t3" as TopicId, topicName: "Genetics", mastery: 0.35 },
      { topicId: "t4" as TopicId, topicName: "Evolution", mastery: 0.42 },
    ],
    ...overrides,
  };
}

function h(props: PostExamSummaryProps) {
  return createElement(PostExamSummary, props);
}

describe("SummaryStatRow", () => {
  it("renders label and value", () => {
    render(
      createElement(SummaryStatRow, {
        label: "Sessions",
        value: "45",
        testId: "row",
      })
    );
    const el = screen.getByTestId("row");
    expect(el.textContent).toContain("Sessions");
    expect(el.textContent).toContain("45");
  });
});

describe("TopicList", () => {
  it("renders topic names and mastery percentages", () => {
    render(
      createElement(TopicList, {
        title: "Strongest",
        topics: [
          { topicName: "Cell Biology", mastery: 0.95 },
          { topicName: "Ecology", mastery: 0.88 },
        ],
        accent: "teal",
        testId: "topic-list",
      })
    );
    const el = screen.getByTestId("topic-list");
    expect(el.textContent).toContain("Cell Biology");
    expect(el.textContent).toContain("95%");
    expect(el.textContent).toContain("Ecology");
    expect(el.textContent).toContain("88%");
  });

  it("returns null when topics is empty", () => {
    const { container } = render(
      createElement(TopicList, {
        title: "Empty",
        topics: [],
        accent: "teal",
        testId: "topic-list",
      })
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders teal dot for teal accent", () => {
    render(
      createElement(TopicList, {
        title: "Test",
        topics: [{ topicName: "Bio", mastery: 0.9 }],
        accent: "teal",
        testId: "topic-list",
      })
    );
    const el = screen.getByTestId("topic-list");
    expect(el.innerHTML).toContain("bg-[#4DAFA0]");
  });

  it("renders coral dot for coral accent", () => {
    render(
      createElement(TopicList, {
        title: "Test",
        topics: [{ topicName: "Gen", mastery: 0.3 }],
        accent: "coral",
        testId: "topic-list",
      })
    );
    const el = screen.getByTestId("topic-list");
    expect(el.innerHTML).toContain("bg-[#E8836A]");
  });
});

describe("PostExamSummary", () => {
  it("renders qualification name and exam date", () => {
    render(h({ summary: makeSummary() }));
    const el = screen.getByTestId("post-exam-summary");
    expect(el.textContent).toContain("GCSE Biology");
    expect(el.textContent).toContain("2026");
  });

  it("has dark panel background", () => {
    render(h({ summary: makeSummary() }));
    const el = screen.getByTestId("post-exam-summary");
    expect(el.className).toContain("bg-[#1A1917]");
  });

  it("displays sessions completed", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-sessions").textContent).toContain(
      "45"
    );
  });

  it("displays total study time", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-time").textContent).toContain(
      "1200 min"
    );
  });

  it("displays spec coverage", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-coverage").textContent).toContain(
      "85.5%"
    );
  });

  it("displays average mastery", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-mastery").textContent).toContain(
      "72%"
    );
  });

  it("displays misconception stats", () => {
    render(h({ summary: makeSummary() }));
    expect(
      screen.getByTestId("summary-misconceptions").textContent
    ).toContain("10/12");
    expect(
      screen.getByTestId("summary-misconceptions").textContent
    ).toContain("83%");
  });

  it("shows 'None encountered' when no misconceptions", () => {
    render(
      h({
        summary: makeSummary({
          misconceptionsTotal: 0,
          misconceptionsResolved: 0,
        }),
      })
    );
    expect(
      screen.getByTestId("summary-misconceptions").textContent
    ).toContain("None encountered");
  });

  it("renders strongest topics", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-strongest").textContent).toContain(
      "Cell Biology"
    );
  });

  it("renders weakest topics", () => {
    render(h({ summary: makeSummary() }));
    expect(screen.getByTestId("summary-weakest").textContent).toContain(
      "Genetics"
    );
  });

  it("hides strongest section when empty", () => {
    render(
      h({
        summary: makeSummary({ strongestTopics: [] }),
      })
    );
    expect(screen.queryByTestId("summary-strongest")).toBeNull();
  });

  it("hides weakest section when empty", () => {
    render(
      h({
        summary: makeSummary({ weakestTopics: [] }),
      })
    );
    expect(screen.queryByTestId("summary-weakest")).toBeNull();
  });
});
