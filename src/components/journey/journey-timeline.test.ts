// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  JourneyTimeline,
  type JourneyTimelineProps,
} from "./journey-timeline";
import type { JourneyData, MisconceptionThread, JourneyStats } from "./types";
import type { TopicId } from "@/lib/types";

function makeStats(overrides?: Partial<JourneyStats>): JourneyStats {
  return {
    sessionsCompleted: 10,
    totalStudyMinutes: 300,
    misconceptionsTotal: 5,
    misconceptionsConquered: 3,
    specCoveragePercent: 50,
    topicsCovered: 15,
    totalTopics: 30,
    ...overrides,
  };
}

function makeThread(
  overrides?: Partial<MisconceptionThread>
): MisconceptionThread {
  return {
    id: "thread-0",
    description: "Confuses mitosis with meiosis",
    topicId: "t1" as TopicId,
    topicName: "Cell Division",
    severity: 2,
    firstSeenAt: new Date("2026-01-10T10:00:00Z"),
    lastSeenAt: new Date("2026-02-15T10:00:00Z"),
    occurrenceCount: 3,
    resolved: false,
    resolvedAt: null,
    ...overrides,
  };
}

function makeData(overrides?: Partial<JourneyData>): JourneyData {
  return {
    conquered: [],
    active: [],
    milestones: [],
    stats: makeStats(),
    ...overrides,
  };
}

function h(props: JourneyTimelineProps) {
  return createElement(JourneyTimeline, props);
}

describe("JourneyTimeline", () => {
  it("renders stats section", () => {
    render(h({ data: makeData() }));
    expect(screen.getByTestId("journey-stats")).toBeTruthy();
  });

  it("shows empty state when no misconceptions", () => {
    render(h({ data: makeData() }));
    expect(screen.getByTestId("journey-empty")).toBeTruthy();
    expect(screen.queryByTestId("active-section")).toBeNull();
    expect(screen.queryByTestId("conquered-section")).toBeNull();
  });

  it("hides empty state when misconceptions exist", () => {
    render(
      h({
        data: makeData({
          active: [makeThread()],
        }),
      })
    );
    expect(screen.queryByTestId("journey-empty")).toBeNull();
  });

  it("renders active section when active misconceptions exist", () => {
    render(
      h({
        data: makeData({
          active: [makeThread({ id: "a1" }), makeThread({ id: "a2" })],
        }),
      })
    );
    expect(screen.getByTestId("active-section")).toBeTruthy();
    expect(screen.getAllByTestId("misconception-card")).toHaveLength(2);
  });

  it("renders conquered section when conquered misconceptions exist", () => {
    const conquered = makeThread({
      id: "c1",
      resolved: true,
      resolvedAt: new Date("2026-03-01"),
    });
    render(h({ data: makeData({ conquered: [conquered] }) }));
    expect(screen.getByTestId("conquered-section")).toBeTruthy();
  });

  it("hides active section when no active misconceptions", () => {
    render(
      h({
        data: makeData({
          conquered: [
            makeThread({
              id: "c1",
              resolved: true,
              resolvedAt: new Date(),
            }),
          ],
        }),
      })
    );
    expect(screen.queryByTestId("active-section")).toBeNull();
  });

  it("hides conquered section when no conquered misconceptions", () => {
    render(
      h({
        data: makeData({
          active: [makeThread()],
        }),
      })
    );
    expect(screen.queryByTestId("conquered-section")).toBeNull();
  });

  it("renders milestones section when milestones exist", () => {
    render(
      h({
        data: makeData({
          conquered: [
            makeThread({
              id: "c1",
              resolved: true,
              resolvedAt: new Date(),
            }),
          ],
          milestones: [
            {
              id: "m1",
              description: "Confuses mitosis with meiosis",
              topicName: "Cell Division",
              resolvedAt: new Date(),
              occurrenceCount: 3,
            },
          ],
        }),
      })
    );
    expect(screen.getByTestId("milestones-section")).toBeTruthy();
    expect(screen.getAllByTestId("milestone-card")).toHaveLength(1);
  });

  it("hides milestones section when no milestones", () => {
    render(h({ data: makeData() }));
    expect(screen.queryByTestId("milestones-section")).toBeNull();
  });

  it("limits milestones to 5", () => {
    const milestones = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      description: `Misconception ${i}`,
      topicName: `Topic ${i}`,
      resolvedAt: new Date(2026, 0, i + 1),
      occurrenceCount: 2,
    }));
    render(
      h({
        data: makeData({
          conquered: milestones.map((m) =>
            makeThread({ id: m.id, resolved: true, resolvedAt: m.resolvedAt })
          ),
          milestones,
        }),
      })
    );
    expect(screen.getAllByTestId("milestone-card")).toHaveLength(5);
  });

  it("shows active count badge", () => {
    render(
      h({
        data: makeData({
          active: [makeThread({ id: "a1" }), makeThread({ id: "a2" })],
        }),
      })
    );
    const section = screen.getByTestId("active-section");
    expect(section.textContent).toContain("2");
  });

  it("shows conquered count badge", () => {
    const conquered = makeThread({
      id: "c1",
      resolved: true,
      resolvedAt: new Date(),
    });
    render(h({ data: makeData({ conquered: [conquered] }) }));
    const section = screen.getByTestId("conquered-section");
    expect(section.textContent).toContain("1");
  });
});
