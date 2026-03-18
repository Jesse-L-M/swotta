// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MisconceptionCard, type MisconceptionCardProps } from "./misconception-card";
import type { MisconceptionThread } from "./types";
import type { TopicId } from "@/lib/types";

function makeThread(overrides?: Partial<MisconceptionThread>): MisconceptionThread {
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

function h(props: MisconceptionCardProps) {
  return createElement(MisconceptionCard, props);
}

describe("MisconceptionCard", () => {
  it("renders description and topic", () => {
    render(h({ thread: makeThread() }));
    expect(
      screen.getByTestId("misconception-description").textContent
    ).toBe("Confuses mitosis with meiosis");
    expect(screen.getByTestId("misconception-topic").textContent).toBe(
      "Cell Division"
    );
  });

  it("shows 'Active' badge for unresolved threads", () => {
    render(h({ thread: makeThread({ resolved: false }) }));
    const badge = screen.getByTestId("misconception-status");
    expect(badge.textContent).toBe("Active");
    expect(badge.className).toContain("bg-[#FAEAE5]");
    expect(badge.className).toContain("text-[#D4654A]");
  });

  it("shows 'Conquered' badge for resolved threads", () => {
    render(
      h({
        thread: makeThread({
          resolved: true,
          resolvedAt: new Date("2026-03-01T10:00:00Z"),
        }),
      })
    );
    const badge = screen.getByTestId("misconception-status");
    expect(badge.textContent).toBe("Conquered");
    expect(badge.className).toContain("bg-[#E4F0ED]");
    expect(badge.className).toContain("text-[#2D7A6E]");
  });

  it("uses teal border for conquered cards", () => {
    render(
      h({ thread: makeThread({ resolved: true, resolvedAt: new Date() }) })
    );
    const card = screen.getByTestId("misconception-card");
    expect(card.className).toContain("border-[#2D7A6E]");
  });

  it("uses coral border for active cards", () => {
    render(h({ thread: makeThread({ resolved: false }) }));
    const card = screen.getByTestId("misconception-card");
    expect(card.className).toContain("border-[#D4654A]");
  });

  it("displays first seen date", () => {
    render(h({ thread: makeThread() }));
    expect(
      screen.getByTestId("misconception-first-seen").textContent
    ).toContain("10 Jan 2026");
  });

  it("displays occurrence count with correct plural", () => {
    render(h({ thread: makeThread({ occurrenceCount: 3 }) }));
    expect(
      screen.getByTestId("misconception-occurrences").textContent
    ).toBe("3 sessions");
  });

  it("uses singular 'session' for count of 1", () => {
    render(h({ thread: makeThread({ occurrenceCount: 1 }) }));
    expect(
      screen.getByTestId("misconception-occurrences").textContent
    ).toBe("1 session");
  });

  it("displays severity label", () => {
    render(h({ thread: makeThread({ severity: 3 }) }));
    expect(screen.getByTestId("misconception-severity").textContent).toBe(
      "Critical"
    );
  });

  it("shows resolved date for conquered misconceptions", () => {
    render(
      h({
        thread: makeThread({
          resolved: true,
          resolvedAt: new Date("2026-03-18T10:00:00Z"),
        }),
      })
    );
    expect(screen.getByTestId("misconception-resolved-at")).toBeTruthy();
  });

  it("hides resolved date for active misconceptions", () => {
    render(h({ thread: makeThread({ resolved: false }) }));
    expect(screen.queryByTestId("misconception-resolved-at")).toBeNull();
  });
});
