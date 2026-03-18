// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MasteryReveal } from "./mastery-reveal";
import type { DiagnosticResult } from "./types";

describe("MasteryReveal", () => {
  const results: DiagnosticResult[] = [
    { topicId: "t1", topicName: "Cell Biology", score: 0.85, confidence: 0.8 },
    { topicId: "t2", topicName: "Organisation", score: 0.55, confidence: 0.5 },
    { topicId: "t3", topicName: "Infection", score: 0.25, confidence: 0.3 },
    { topicId: "t4", topicName: "Bioenergetics", score: 0, confidence: 0 },
    {
      topicId: "t5",
      topicName: "Homeostasis",
      score: 0.75,
      confidence: 0.7,
    },
  ];

  const defaultProps = {
    results,
    qualificationName: "GCSE Biology",
    onContinue: vi.fn(),
  };

  it("renders the reveal title", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(screen.getByTestId("reveal-title").textContent).toBe(
      "Your knowledge map"
    );
  });

  it("renders qualification name in subtitle", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(
      screen.getByText(/Here's where you stand in GCSE Biology/)
    ).toBeDefined();
  });

  it("calculates and displays average mastery", () => {
    render(<MasteryReveal {...defaultProps} />);
    // (0.85 + 0.55 + 0.25 + 0 + 0.75) / 5 = 0.48 => 48%
    const statsContainer = screen.getByTestId("summary-stats");
    expect(statsContainer.textContent).toContain("48%");
  });

  it("calculates and displays strong topic count", () => {
    render(<MasteryReveal {...defaultProps} />);
    const statsContainer = screen.getByTestId("summary-stats");
    // 2 strong topics (Cell Biology 0.85, Homeostasis 0.75)
    expect(statsContainer.textContent).toContain("2/5");
  });

  it("groups results into categories", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(screen.getByTestId("group-strong")).toBeDefined();
    expect(screen.getByTestId("group-developing")).toBeDefined();
    expect(screen.getByTestId("group-needs-work")).toBeDefined();
    expect(screen.getByTestId("group-not-covered")).toBeDefined();
  });

  it("renders correct number of topic bars in each group", () => {
    render(<MasteryReveal {...defaultProps} />);
    const strongGroup = screen.getByTestId("group-strong");
    const developingGroup = screen.getByTestId("group-developing");
    const needsWorkGroup = screen.getByTestId("group-needs-work");
    const notCoveredGroup = screen.getByTestId("group-not-covered");

    expect(
      strongGroup.querySelectorAll('[data-testid="topic-result-bar"]').length
    ).toBe(2);
    expect(
      developingGroup.querySelectorAll('[data-testid="topic-result-bar"]')
        .length
    ).toBe(1);
    expect(
      needsWorkGroup.querySelectorAll('[data-testid="topic-result-bar"]')
        .length
    ).toBe(1);
    expect(
      notCoveredGroup.querySelectorAll('[data-testid="topic-result-bar"]')
        .length
    ).toBe(1);
  });

  it("omits empty categories", () => {
    const onlyStrong: DiagnosticResult[] = [
      { topicId: "t1", topicName: "A", score: 0.9, confidence: 0.9 },
    ];
    render(
      <MasteryReveal
        results={onlyStrong}
        qualificationName="Test"
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByTestId("group-strong")).toBeDefined();
    expect(screen.queryByTestId("group-developing")).toBeNull();
    expect(screen.queryByTestId("group-needs-work")).toBeNull();
    expect(screen.queryByTestId("group-not-covered")).toBeNull();
  });

  it("renders the plan transition section", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(screen.getByTestId("plan-transition")).toBeDefined();
    expect(
      screen.getByText(/your personalised plan/)
    ).toBeDefined();
  });

  it("renders the continue button", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(screen.getByTestId("continue-btn")).toBeDefined();
    expect(screen.getByTestId("continue-btn").textContent).toBe(
      "Go to my dashboard"
    );
  });

  it("calls onContinue when continue button is clicked", () => {
    const onContinue = vi.fn();
    render(
      <MasteryReveal {...defaultProps} onContinue={onContinue} />
    );
    fireEvent.click(screen.getByTestId("continue-btn"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders category descriptions", () => {
    render(<MasteryReveal {...defaultProps} />);
    expect(
      screen.getByText(/You already know this well/)
    ).toBeDefined();
    expect(screen.getByText(/Good start/)).toBeDefined();
    expect(
      screen.getByText(/These will get extra attention/)
    ).toBeDefined();
    expect(
      screen.getByText(/We'll start from the basics/)
    ).toBeDefined();
  });

  it("handles empty results", () => {
    render(
      <MasteryReveal
        results={[]}
        qualificationName="Test"
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByTestId("reveal-title")).toBeDefined();
    const groups = screen.getByTestId("topic-groups");
    expect(groups.children.length).toBe(0);
  });

  it("handles all topics at same score", () => {
    const sameScore: DiagnosticResult[] = [
      { topicId: "t1", topicName: "A", score: 0.5, confidence: 0.5 },
      { topicId: "t2", topicName: "B", score: 0.5, confidence: 0.5 },
    ];
    render(
      <MasteryReveal
        results={sameScore}
        qualificationName="Test"
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByTestId("group-developing")).toBeDefined();
    expect(
      screen
        .getByTestId("group-developing")
        .querySelectorAll('[data-testid="topic-result-bar"]').length
    ).toBe(2);
  });

  it("sorts results by score descending", () => {
    render(<MasteryReveal {...defaultProps} />);
    // Strong group should have Cell Biology (0.85) then Homeostasis (0.75)
    const strongGroup = screen.getByTestId("group-strong");
    const bars = strongGroup.querySelectorAll(
      '[data-testid="topic-result-bar"]'
    );
    expect(bars[0].textContent).toContain("Cell Biology");
    expect(bars[1].textContent).toContain("Homeostasis");
  });

  it("renders the teal surface header panel", () => {
    render(<MasteryReveal {...defaultProps} />);
    const reveal = screen.getByTestId("mastery-reveal");
    const header = reveal.querySelector(".bg-\\[\\#D6EBE7\\]");
    expect(header).not.toBeNull();
  });
});
