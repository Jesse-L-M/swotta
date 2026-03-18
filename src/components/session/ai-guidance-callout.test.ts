// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { AiGuidanceCallout, GUIDANCE } from "./ai-guidance-callout";
import type { BlockType } from "@/lib/types";

const ALL_BLOCK_TYPES: BlockType[] = [
  "retrieval_drill",
  "explanation",
  "worked_example",
  "timed_problems",
  "essay_planning",
  "source_analysis",
  "mistake_review",
  "reentry",
];

describe("AiGuidanceCallout", () => {
  it("renders callout with correct title and tip for each block type", () => {
    for (const blockType of ALL_BLOCK_TYPES) {
      const { unmount } = render(createElement(AiGuidanceCallout, { blockType }));
      const callout = screen.getByTestId("ai-guidance-callout");
      expect(callout.textContent).toContain(GUIDANCE[blockType].title);
      expect(callout.textContent).toContain(GUIDANCE[blockType].tip);
      unmount();
    }
  });

  it("has teal styling", () => {
    render(createElement(AiGuidanceCallout, { blockType: "retrieval_drill" }));
    const callout = screen.getByTestId("ai-guidance-callout");
    expect(callout.className).toContain("bg-teal-50");
    expect(callout.className).toContain("border-teal-200");
  });
});

describe("GUIDANCE", () => {
  it("has entries for all 8 block types", () => {
    expect(Object.keys(GUIDANCE)).toHaveLength(8);
    for (const bt of ALL_BLOCK_TYPES) {
      expect(GUIDANCE[bt]).toBeDefined();
      expect(GUIDANCE[bt].title).toBeTruthy();
      expect(GUIDANCE[bt].tip).toBeTruthy();
    }
  });
});
