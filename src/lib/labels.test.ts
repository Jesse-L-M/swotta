import { describe, it, expect } from "vitest";
import { BLOCK_TYPE_LABELS } from "./labels";
import type { BlockType } from "@/lib/types";

describe("BLOCK_TYPE_LABELS", () => {
  const allBlockTypes: BlockType[] = [
    "retrieval_drill",
    "explanation",
    "worked_example",
    "timed_problems",
    "essay_planning",
    "source_analysis",
    "mistake_review",
    "reentry",
  ];

  it("has a label for every block type", () => {
    for (const blockType of allBlockTypes) {
      expect(BLOCK_TYPE_LABELS[blockType]).toBeTruthy();
    }
  });

  it("has exactly 8 entries", () => {
    expect(Object.keys(BLOCK_TYPE_LABELS)).toHaveLength(8);
  });

  it("returns human-readable strings", () => {
    expect(BLOCK_TYPE_LABELS.retrieval_drill).toBe("Retrieval Drill");
    expect(BLOCK_TYPE_LABELS.reentry).toBe("Re-entry");
  });
});
