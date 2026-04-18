// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { DashboardQueueBlock } from "./types";
import type { BlockId, LearnerId, TopicId } from "@/lib/types";
import { TodayQueue } from "./today-queue";

function makeBlock(
  overrides?: Partial<DashboardQueueBlock>
): DashboardQueueBlock {
  return {
    id: "block-1" as BlockId,
    learnerId: "learner-1" as LearnerId,
    topicId: "topic-1" as TopicId,
    topicName: "Cell division",
    blockType: "retrieval_drill",
    durationMinutes: 12,
    priority: 1,
    reason: "Scheduled review",
    reviewReason: "misconception",
    actionTitle: "Pull Cell division out of memory",
    whyNow:
      'You recently got stuck on "mixing up mitosis and meiosis" here, so this block is about fixing it before the same mistake repeats.',
    impact:
      "Pulling answers from memory now makes later questions faster and less fragile.",
    ...overrides,
  };
}

describe("TodayQueue", () => {
  it("foregrounds the first block as the next action", () => {
    render(createElement(TodayQueue, { blocks: [makeBlock()] }));

    expect(screen.getByText("Start here")).toBeTruthy();
    expect(screen.getByText("Pull Cell division out of memory")).toBeTruthy();
    expect(screen.getByText("Why now")).toBeTruthy();
    expect(screen.getByText("Why it matters")).toBeTruthy();
    expect(screen.getByText("Start next block")).toBeTruthy();
  });

  it("shows remaining queue items with position labels", () => {
    render(
      createElement(TodayQueue, {
        blocks: [
          makeBlock(),
          makeBlock({
            id: "block-2" as BlockId,
            topicId: "topic-2" as TopicId,
            topicName: "Inheritance",
            blockType: "timed_problems",
            actionTitle: "Test Inheritance under exam time",
            whyNow:
              "Your exam on this subject is getting close, so keeping Inheritance active now should pay off when questions come under pressure.",
            impact:
              "Practising under time pressure turns knowledge into exam-ready performance.",
            reviewReason: "exam_approaching",
          }),
        ],
      })
    );

    expect(screen.getByText("Then")).toBeTruthy();
    expect(screen.getByText("Test Inheritance under exam time")).toBeTruthy();
  });

  it("renders a more useful empty state", () => {
    render(createElement(TodayQueue, { blocks: [] }));

    expect(screen.getByText("Your queue is clear for now")).toBeTruthy();
    expect(screen.getByText("See your journey")).toBeTruthy();
  });
});
