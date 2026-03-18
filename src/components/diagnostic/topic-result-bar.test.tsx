// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TopicResultBar,
  categorizeMastery,
  getMasteryLabel,
  getMasteryColor,
  getMasteryLabelColor,
} from "./topic-result-bar";
import type { DiagnosticResult } from "./types";

describe("categorizeMastery", () => {
  it("returns 'strong' for scores >= 0.7", () => {
    expect(categorizeMastery(0.7)).toBe("strong");
    expect(categorizeMastery(0.85)).toBe("strong");
    expect(categorizeMastery(1.0)).toBe("strong");
  });

  it("returns 'developing' for scores 0.4-0.69", () => {
    expect(categorizeMastery(0.4)).toBe("developing");
    expect(categorizeMastery(0.5)).toBe("developing");
    expect(categorizeMastery(0.69)).toBe("developing");
  });

  it("returns 'needs-work' for scores 0.01-0.39", () => {
    expect(categorizeMastery(0.01)).toBe("needs-work");
    expect(categorizeMastery(0.2)).toBe("needs-work");
    expect(categorizeMastery(0.39)).toBe("needs-work");
  });

  it("returns 'not-covered' for score 0", () => {
    expect(categorizeMastery(0)).toBe("not-covered");
  });
});

describe("getMasteryLabel", () => {
  it("returns correct labels for each category", () => {
    expect(getMasteryLabel("strong")).toBe("Strong");
    expect(getMasteryLabel("developing")).toBe("Developing");
    expect(getMasteryLabel("needs-work")).toBe("Needs work");
    expect(getMasteryLabel("not-covered")).toBe("Not covered");
  });
});

describe("getMasteryColor", () => {
  it("returns teal for strong", () => {
    expect(getMasteryColor("strong")).toBe("#2D7A6E");
  });

  it("returns stone/graphite for developing", () => {
    expect(getMasteryColor("developing")).toBe("#949085");
  });

  it("returns coral for needs-work", () => {
    expect(getMasteryColor("needs-work")).toBe("#D4654A");
  });

  it("returns stone for not-covered", () => {
    expect(getMasteryColor("not-covered")).toBe("#F0ECE4");
  });
});

describe("getMasteryLabelColor", () => {
  it("returns graphite for not-covered (readable on white)", () => {
    expect(getMasteryLabelColor("not-covered")).toBe("#949085");
  });

  it("returns accent color for other categories", () => {
    expect(getMasteryLabelColor("strong")).toBe("#2D7A6E");
    expect(getMasteryLabelColor("developing")).toBe("#949085");
    expect(getMasteryLabelColor("needs-work")).toBe("#D4654A");
  });
});

describe("TopicResultBar", () => {
  const strongResult: DiagnosticResult = {
    topicId: "t1",
    topicName: "Cell Biology",
    score: 0.85,
    confidence: 0.8,
  };

  const weakResult: DiagnosticResult = {
    topicId: "t2",
    topicName: "Ecology",
    score: 0.2,
    confidence: 0.3,
  };

  const zeroResult: DiagnosticResult = {
    topicId: "t3",
    topicName: "Genetics",
    score: 0,
    confidence: 0,
  };

  it("renders topic name", () => {
    render(<TopicResultBar result={strongResult} />);
    expect(screen.getByText("Cell Biology")).toBeDefined();
  });

  it("renders mastery label for strong topic", () => {
    render(<TopicResultBar result={strongResult} />);
    expect(screen.getByTestId("mastery-label").textContent).toBe("Strong");
  });

  it("renders mastery label for weak topic", () => {
    render(<TopicResultBar result={weakResult} />);
    expect(screen.getByTestId("mastery-label").textContent).toBe("Needs work");
  });

  it("renders mastery label for zero topic", () => {
    render(<TopicResultBar result={zeroResult} />);
    expect(screen.getByTestId("mastery-label").textContent).toBe(
      "Not covered"
    );
  });

  it("shows correct percentage", () => {
    render(<TopicResultBar result={strongResult} />);
    expect(screen.getByText("85%")).toBeDefined();
  });

  it("shows 0% for zero score", () => {
    render(<TopicResultBar result={zeroResult} />);
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("sets the correct data-category attribute", () => {
    render(<TopicResultBar result={strongResult} />);
    expect(
      screen.getByTestId("topic-result-bar").getAttribute("data-category")
    ).toBe("strong");
  });

  it("sets animation delay when provided", () => {
    render(<TopicResultBar result={strongResult} animationDelay={200} />);
    const bar = screen.getByTestId("topic-result-bar");
    expect(bar.style.animation).toContain("200ms");
  });

  it("uses default animation delay of 0", () => {
    render(<TopicResultBar result={strongResult} />);
    const bar = screen.getByTestId("topic-result-bar");
    expect(bar.style.animation).toContain("0ms");
  });

  it("ensures bar width is at least 2% even for very low scores", () => {
    const tinyResult: DiagnosticResult = {
      topicId: "t4",
      topicName: "Tiny",
      score: 0.01,
      confidence: 0.01,
    };
    render(<TopicResultBar result={tinyResult} />);
    const bar = screen.getByTestId("mastery-bar");
    expect(bar.style.width).toBe("2%");
  });
});
