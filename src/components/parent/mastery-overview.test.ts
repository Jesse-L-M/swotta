import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MasteryOverview,
  computeStrengths,
  computeAreasToWatch,
} from "./mastery-overview";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("MasteryOverview", () => {
  it("renders empty state when no changes", () => {
    const html = render(
      React.createElement(MasteryOverview, { changes: [] }),
    );
    expect(html).toContain("mastery-empty");
    expect(html).toContain("No mastery data this week");
  });

  it("renders topic names and delta labels", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Cell Biology", before: 0.4, after: 0.6, delta: 0.2 },
          { topicName: "Ecology", before: 0.7, after: 0.5, delta: -0.2 },
        ],
      }),
    );
    expect(html).toContain("Cell Biology");
    expect(html).toContain("+20%");
    expect(html).toContain("Ecology");
    expect(html).toContain("-20%");
  });

  it("renders green color for positive deltas", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.3, after: 0.5, delta: 0.2 },
        ],
      }),
    );
    expect(html).toContain("text-emerald-600");
  });

  it("renders red color for negative deltas", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.5, after: 0.3, delta: -0.2 },
        ],
      }),
    );
    expect(html).toContain("text-red-600");
  });

  it("renders muted color for zero delta", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.5, after: 0.5, delta: 0 },
        ],
      }),
    );
    expect(html).toContain("text-muted-foreground");
  });

  it("renders mastery bar with correct width", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.3, after: 0.75, delta: 0.45 },
        ],
      }),
    );
    expect(html).toContain("width:75%");
  });

  it("renders green bar for high mastery (>= 0.7)", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.5, after: 0.8, delta: 0.3 },
        ],
      }),
    );
    expect(html).toContain("bg-emerald-500");
  });

  it("renders amber bar for medium mastery (0.4-0.7)", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.3, after: 0.5, delta: 0.2 },
        ],
      }),
    );
    expect(html).toContain("bg-amber-500");
  });

  it("renders red bar for low mastery (< 0.4)", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.1, after: 0.2, delta: 0.1 },
        ],
      }),
    );
    expect(html).toContain("bg-red-500");
  });

  it("sorts changes by delta descending", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Low", before: 0.5, after: 0.3, delta: -0.2 },
          { topicName: "High", before: 0.3, after: 0.7, delta: 0.4 },
          { topicName: "Mid", before: 0.4, after: 0.5, delta: 0.1 },
        ],
      }),
    );
    const highIdx = html.indexOf("High");
    const midIdx = html.indexOf("Mid");
    const lowIdx = html.indexOf("Low");
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  it("uses serif font for delta values", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.3, after: 0.5, delta: 0.2 },
        ],
      }),
    );
    expect(html).toContain("font-serif");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(MasteryOverview, {
        changes: [
          { topicName: "Topic", before: 0.3, after: 0.5, delta: 0.2 },
        ],
        className: "custom",
      }),
    );
    expect(html).toContain("custom");
  });
});

describe("computeStrengths", () => {
  it("returns only topics with positive delta", () => {
    const result = computeStrengths([
      { topicName: "A", before: 0.3, after: 0.6, delta: 0.3 },
      { topicName: "B", before: 0.5, after: 0.3, delta: -0.2 },
      { topicName: "C", before: 0.5, after: 0.5, delta: 0 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].topicName).toBe("A");
  });

  it("sorts by delta descending", () => {
    const result = computeStrengths([
      { topicName: "Small", before: 0.4, after: 0.5, delta: 0.1 },
      { topicName: "Big", before: 0.2, after: 0.7, delta: 0.5 },
    ]);
    expect(result[0].topicName).toBe("Big");
    expect(result[1].topicName).toBe("Small");
  });

  it("returns empty array when no positive deltas", () => {
    const result = computeStrengths([
      { topicName: "A", before: 0.5, after: 0.3, delta: -0.2 },
    ]);
    expect(result).toEqual([]);
  });
});

describe("computeAreasToWatch", () => {
  it("returns topics with negative delta", () => {
    const result = computeAreasToWatch([
      { topicName: "A", before: 0.5, after: 0.3, delta: -0.2 },
      { topicName: "B", before: 0.3, after: 0.6, delta: 0.3 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].topicName).toBe("A");
  });

  it("returns topics with low mastery (after < 0.4)", () => {
    const result = computeAreasToWatch([
      { topicName: "Low", before: 0.2, after: 0.3, delta: 0.1 },
      { topicName: "OK", before: 0.5, after: 0.6, delta: 0.1 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].topicName).toBe("Low");
  });

  it("sorts by delta ascending (most decline first)", () => {
    const result = computeAreasToWatch([
      { topicName: "Small decline", before: 0.5, after: 0.4, delta: -0.1 },
      { topicName: "Big decline", before: 0.7, after: 0.3, delta: -0.4 },
    ]);
    expect(result[0].topicName).toBe("Big decline");
    expect(result[1].topicName).toBe("Small decline");
  });

  it("returns empty array when no issues", () => {
    const result = computeAreasToWatch([
      { topicName: "Good", before: 0.5, after: 0.7, delta: 0.2 },
    ]);
    expect(result).toEqual([]);
  });
});
