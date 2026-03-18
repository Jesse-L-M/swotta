"use client";

import type { BlockType } from "@/lib/types";

export interface AiGuidanceCalloutProps {
  blockType: BlockType;
}

const GUIDANCE: Record<BlockType, { title: string; tip: string }> = {
  retrieval_drill: {
    title: "Retrieval Drill",
    tip: "Try to recall from memory before looking at hints. This strengthens long-term retention.",
  },
  explanation: {
    title: "Explanation",
    tip: "Explain concepts in your own words. The AI will check your understanding and fill gaps.",
  },
  worked_example: {
    title: "Worked Example",
    tip: "Follow along with the solution, then try a similar problem independently.",
  },
  timed_problems: {
    title: "Timed Practice",
    tip: "Work under exam conditions. Manage your time and show your working.",
  },
  essay_planning: {
    title: "Essay Planning",
    tip: "Structure your response before writing. Focus on clear argument and evidence.",
  },
  source_analysis: {
    title: "Source Analysis",
    tip: "Read the source carefully. Identify key data, trends, and limitations.",
  },
  mistake_review: {
    title: "Mistake Review",
    tip: "Focus on understanding why you got it wrong, not just the correct answer.",
  },
  reentry: {
    title: "Welcome Back",
    tip: "This is a gentle warm-up. No pressure -- just reconnect with the material.",
  },
};

export function AiGuidanceCallout({ blockType }: AiGuidanceCalloutProps) {
  const guidance = GUIDANCE[blockType];

  return (
    <div
      className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3"
      data-testid="ai-guidance-callout"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
        {guidance.title}
      </p>
      <p className="mt-1 text-sm text-teal-600">{guidance.tip}</p>
    </div>
  );
}

export { GUIDANCE };
