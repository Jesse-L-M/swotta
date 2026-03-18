// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MilestoneCard, type MilestoneCardProps } from "./milestone-card";
import type { JourneyMilestone } from "./types";

function makeMilestone(
  overrides?: Partial<JourneyMilestone>
): JourneyMilestone {
  return {
    id: "m-1",
    description: "osmosis vs diffusion confusion",
    topicName: "Transport in Cells",
    resolvedAt: new Date("2026-03-10T10:00:00Z"),
    occurrenceCount: 4,
    ...overrides,
  };
}

function h(props: MilestoneCardProps) {
  return createElement(MilestoneCard, props);
}

describe("MilestoneCard", () => {
  it("renders the milestone message", () => {
    render(h({ milestone: makeMilestone() }));
    expect(screen.getByTestId("milestone-message").textContent).toBe(
      'You conquered "osmosis vs diffusion confusion" in Transport in Cells!'
    );
  });

  it("has teal surface background", () => {
    render(h({ milestone: makeMilestone() }));
    const card = screen.getByTestId("milestone-card");
    expect(card.className).toContain("bg-[#D6EBE7]");
  });

  it("renders checkmark icon", () => {
    render(h({ milestone: makeMilestone() }));
    const icon = screen.getByTestId("milestone-icon");
    expect(icon.textContent).toContain("\u2713");
    expect(icon.className).toContain("bg-[#2D7A6E]");
  });

  it("displays resolved date", () => {
    render(h({ milestone: makeMilestone() }));
    expect(screen.getByTestId("milestone-date")).toBeTruthy();
  });

  it("displays session count with correct plural", () => {
    render(h({ milestone: makeMilestone({ occurrenceCount: 4 }) }));
    expect(screen.getByTestId("milestone-sessions").textContent).toBe(
      "After 4 sessions"
    );
  });

  it("uses singular 'session' for count of 1", () => {
    render(h({ milestone: makeMilestone({ occurrenceCount: 1 }) }));
    expect(screen.getByTestId("milestone-sessions").textContent).toBe(
      "After 1 session"
    );
  });
});
