import type { BlockType } from "@/lib/types";

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  retrieval_drill: "Retrieval Drill",
  explanation: "Explanation",
  worked_example: "Worked Example",
  timed_problems: "Timed Problems",
  essay_planning: "Essay Planning",
  source_analysis: "Source Analysis",
  mistake_review: "Mistake Review",
  reentry: "Re-entry",
};
