import type { BlockType } from "@/lib/types";

export interface PastPaperAwareEvalScenario {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  qualificationFixture: "aqa-gcse-biology-8461" | "aqa-gcse-chemistry-8462";
  topicCode: string;
  block: {
    blockType: Extract<BlockType, "timed_problems" | "worked_example" | "essay_planning">;
    topicName: string;
    reason: string;
    durationMinutes: number;
  };
  expectations: {
    commandWordKeywords: string[];
    markKeywords: string[];
    signalKeywords: string[];
    referenceKeywords: string[];
  };
}

export const PAST_PAPER_AWARE_EVAL_FIXTURES: PastPaperAwareEvalScenario[] = [
  {
    id: "biology-cell-structure-mcq",
    title: "Biology cell-structure topic picks up one-mark multiple-choice patterns",
    summary:
      "Checks that the past-paper intelligence path brings real one-mark cell-structure patterns into an exam-facing block instead of generic coaching.",
    provenance:
      "Committed fixture built from src/engine/__fixtures__/past-papers/aqa-gcse-biology-8461.json on 2026-03-31 and exercised through the live past-paper intelligence aggregation path.",
    qualificationFixture: "aqa-gcse-biology-8461",
    topicCode: "4.1.1.2",
    block: {
      blockType: "worked_example",
      topicName: "Animal and plant cells",
      reason: "Student needs exam-style practice on organelle identification",
      durationMinutes: 15,
    },
    expectations: {
      commandWordKeywords: ["Choose"],
      markKeywords: ["1 marks", "average 1"],
      signalKeywords: ["Single-point credit", "One point per mark"],
      referenceKeywords: ["aerobic respiration occurs in a plant cell"],
    },
  },
  {
    id: "biology-osmosis-structured-explain",
    title: "Biology osmosis topic brings in structured explain patterns",
    summary:
      "Checks that a timed-problems block sees real osmosis command words, marks, and mark-scheme signals from the merged past-paper fixtures.",
    provenance:
      "Committed fixture built from src/engine/__fixtures__/past-papers/aqa-gcse-biology-8461.json on 2026-03-31 and scored from the real getPastPaperSessionIntelligence output.",
    qualificationFixture: "aqa-gcse-biology-8461",
    topicCode: "4.1.3.2",
    block: {
      blockType: "timed_problems",
      topicName: "Osmosis",
      reason: "Learner needs past-paper-shaped coaching on four-mark osmosis questions",
      durationMinutes: 15,
    },
    expectations: {
      commandWordKeywords: ["Explain"],
      markKeywords: ["4 marks", "average 4"],
      signalKeywords: [
        "Point-plus-reason explanation",
        "Link cause and effect",
      ],
      referenceKeywords: ["root hair cell by osmosis"],
    },
  },
  {
    id: "chemistry-bioleaching-evaluate",
    title: "Chemistry bioleaching topic picks up evaluate-style open-response coaching",
    summary:
      "Checks that the essay-planning path uses real six-mark evaluate patterns, including judgement signals, rather than generic exam boilerplate.",
    provenance:
      "Committed fixture built from src/engine/__fixtures__/past-papers/aqa-gcse-chemistry-8462.json on 2026-03-31 and exercised through the live past-paper session intelligence path.",
    qualificationFixture: "aqa-gcse-chemistry-8462",
    topicCode: "4.10.1.4",
    block: {
      blockType: "essay_planning",
      topicName: "Alternative methods of extracting metals (HT only)",
      reason: "Learner needs judgement-based planning for a six-mark extraction question",
      durationMinutes: 20,
    },
    expectations: {
      commandWordKeywords: ["Evaluate"],
      markKeywords: ["6 marks", "average 6"],
      signalKeywords: [
        "Balanced judgement",
        "Justify the overall judgement",
      ],
      referenceKeywords: ["bioleaching", "phytomining"],
    },
  },
];
