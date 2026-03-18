// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  ProgressIndicator,
  isPhaseComplete,
  isPhaseActive,
  PHASE_STEPS,
  type ProgressIndicatorProps,
} from "./progress-indicator";

function h(props: ProgressIndicatorProps) {
  return createElement(ProgressIndicator, props);
}

describe("isPhaseComplete", () => {
  it("returns true when current phase is past the step", () => {
    expect(isPhaseComplete("confidence-before", "active")).toBe(true);
  });

  it("returns false when current phase is the step", () => {
    expect(isPhaseComplete("confidence-before", "confidence-before")).toBe(false);
  });

  it("returns false when current phase is before the step", () => {
    expect(isPhaseComplete("active", "confidence-before")).toBe(false);
  });

  it("handles array keys", () => {
    expect(isPhaseComplete(["active", "streaming"], "completing")).toBe(true);
    expect(isPhaseComplete(["active", "streaming"], "streaming")).toBe(false);
    expect(isPhaseComplete(["active", "streaming"], "confidence-before")).toBe(false);
  });
});

describe("isPhaseActive", () => {
  it("returns true when current phase matches", () => {
    expect(isPhaseActive("active", "active")).toBe(true);
  });

  it("returns false when current phase does not match", () => {
    expect(isPhaseActive("active", "loading")).toBe(false);
  });

  it("handles array keys", () => {
    expect(isPhaseActive(["active", "streaming"], "streaming")).toBe(true);
    expect(isPhaseActive(["active", "streaming"], "loading")).toBe(false);
  });
});

describe("PHASE_STEPS", () => {
  it("has exactly 4 steps", () => {
    expect(PHASE_STEPS).toHaveLength(4);
  });
});

describe("ProgressIndicator", () => {
  it("renders topic name and block type label", () => {
    render(h({ phase: "active", messagesCount: 3, topicName: "Cell Biology", blockTypeLabel: "Retrieval Drill" }));
    expect(screen.getByText("Cell Biology")).toBeTruthy();
    expect(screen.getByText("Retrieval Drill")).toBeTruthy();
  });

  it("shows message count when there are messages", () => {
    render(h({ phase: "active", messagesCount: 5, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.getByTestId("message-count").textContent).toBe("5 messages");
  });

  it("shows singular message count", () => {
    render(h({ phase: "active", messagesCount: 1, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.getByTestId("message-count").textContent).toBe("1 message");
  });

  it("hides message count when zero", () => {
    render(h({ phase: "confidence-before", messagesCount: 0, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.queryByTestId("message-count")).toBeNull();
  });

  it("renders step indicators", () => {
    render(h({ phase: "active", messagesCount: 2, topicName: "T", blockTypeLabel: "B" }));
    for (const step of PHASE_STEPS) {
      expect(screen.getByTestId(`step-${step.label}`)).toBeTruthy();
    }
  });

  it("marks completed steps with teal-500 color", () => {
    render(h({ phase: "complete", messagesCount: 10, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.getByTestId("step-Rate confidence").className).toContain("bg-teal-500");
  });

  it("marks active step with teal-300 color", () => {
    render(h({ phase: "active", messagesCount: 3, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.getByTestId("step-Study").className).toContain("bg-teal-300");
  });

  it("marks future steps with muted color", () => {
    render(h({ phase: "confidence-before", messagesCount: 0, topicName: "T", blockTypeLabel: "B" }));
    expect(screen.getByTestId("step-Done").className).toContain("bg-muted");
  });
});
