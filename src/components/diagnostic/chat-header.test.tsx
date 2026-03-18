// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatHeader } from "./chat-header";
import type { DiagnosticProgress } from "./types";

describe("ChatHeader", () => {
  const baseProgress: DiagnosticProgress = {
    explored: [],
    current: null,
    total: 8,
    isComplete: false,
  };

  it("renders the qualification name", () => {
    render(
      <ChatHeader
        qualificationName="GCSE Biology"
        progress={baseProgress}
        topicCount={8}
      />
    );
    expect(
      screen.getByText("GCSE Biology Diagnostic")
    ).toBeDefined();
  });

  it("shows 'Getting started...' when no topics explored", () => {
    render(
      <ChatHeader
        qualificationName="GCSE Biology"
        progress={baseProgress}
        topicCount={8}
      />
    );
    expect(screen.getByTestId("progress-status").textContent).toBe(
      "Getting started..."
    );
  });

  it("shows current topic name when exploring", () => {
    const progress: DiagnosticProgress = {
      explored: ["Cell Biology"],
      current: "Organisation",
      total: 8,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="GCSE Biology"
        progress={progress}
        topicCount={8}
      />
    );
    expect(screen.getByTestId("progress-status").textContent).toBe(
      "Exploring: Organisation"
    );
  });

  it("shows explored count when between topics", () => {
    const progress: DiagnosticProgress = {
      explored: ["Cell Biology", "Organisation"],
      current: null,
      total: 8,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="GCSE Biology"
        progress={progress}
        topicCount={8}
      />
    );
    expect(screen.getByTestId("progress-status").textContent).toBe(
      "2 of 8 topics explored"
    );
  });

  it("shows all topics explored when complete", () => {
    const progress: DiagnosticProgress = {
      explored: Array.from({ length: 8 }, (_, i) => `Topic ${i + 1}`),
      current: null,
      total: 8,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="GCSE Biology"
        progress={progress}
        topicCount={8}
      />
    );
    expect(screen.getByTestId("progress-status").textContent).toBe(
      "All 8 topics explored"
    );
  });

  it("displays progress count as explored/total", () => {
    const progress: DiagnosticProgress = {
      explored: ["A", "B", "C"],
      current: "D",
      total: 10,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="Test"
        progress={progress}
        topicCount={10}
      />
    );
    expect(screen.getByTestId("progress-count").textContent).toBe("3/10");
  });

  it("falls back to topicCount when progress.total is 0", () => {
    const progress: DiagnosticProgress = {
      explored: ["A"],
      current: null,
      total: 0,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="Test"
        progress={progress}
        topicCount={5}
      />
    );
    expect(screen.getByTestId("progress-count").textContent).toBe("1/5");
  });

  it("shows 0% width on progress bar when nothing explored", () => {
    render(
      <ChatHeader
        qualificationName="Test"
        progress={baseProgress}
        topicCount={8}
      />
    );
    const bar = screen.getByTestId("progress-bar");
    expect(bar.style.width).toBe("0%");
  });

  it("calculates correct percentage on progress bar", () => {
    const progress: DiagnosticProgress = {
      explored: ["A", "B", "C", "D"],
      current: null,
      total: 8,
      isComplete: false,
    };
    render(
      <ChatHeader
        qualificationName="Test"
        progress={progress}
        topicCount={8}
      />
    );
    const bar = screen.getByTestId("progress-bar");
    expect(bar.style.width).toBe("50%");
  });
});
