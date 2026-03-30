import type { LearnerContext } from "@/ai/study-modes";
import type {
  BlockId,
  ChunkId,
  LearnerId,
  RetrievalResult,
  StudyBlock,
  TopicId,
} from "@/lib/types";

export type DifficultyBand = "foundational" | "intermediate" | "stretch";

export interface StructuredContextEvalScenario {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  block: StudyBlock;
  learnerContext: LearnerContext;
  sourceChunks: RetrievalResult[];
  expectations: {
    gapKeywords: string[];
    misconceptionKeywords: string[];
    sourceKeywords: string[];
    expectedDifficultyBand: DifficultyBand;
  };
}

function makeBlock(
  id: string,
  topicId: string,
  topicName: string,
  reason: string
): StudyBlock {
  return {
    id: id as BlockId,
    learnerId: "eval-learner-1" as LearnerId,
    topicId: topicId as TopicId,
    topicName,
    blockType: "retrieval_drill",
    durationMinutes: 15,
    priority: 2,
    reason,
  };
}

function makeChunk(
  id: string,
  topicId: string,
  sourceFileName: string,
  content: string
): RetrievalResult {
  return {
    chunkId: id as ChunkId,
    topicId: topicId as TopicId,
    content,
    score: 0.95,
    sourceFileName,
    sourceFileId: `${id}-file`,
  };
}

export const STRUCTURED_CONTEXT_EVAL_FIXTURES: StructuredContextEvalScenario[] =
  [
    {
      id: "mitosis-chromosome-gap",
      title: "Cell division learner with a persistent chromosome-number error",
      summary:
        "Low-mastery learner who keeps mixing up what mitosis preserves and has revision notes tied to a recent mock paper.",
      provenance:
        "Synthetic GCSE Biology fixture committed in src/evals/fixtures/context-vs-blank.ts on 2026-03-30. Derived directly from the EVALS.md structured-context hypothesis.",
      block: makeBlock(
        "block-context-1",
        "topic-context-1",
        "Cell division",
        "Low mastery after a weak mock-paper answer"
      ),
      learnerContext: {
        masteryLevel: 0.18,
        knownMisconceptions: [
          "Believes mitosis halves the chromosome number instead of keeping daughter cells genetically identical.",
        ],
        confirmedMemory: [
          {
            category: "revision_pattern",
            content:
              "Retains stage-based biology questions better when prompted to label each stage in order.",
          },
        ],
        preferences: {
          preferred_block_types: ["worked_example", "retrieval_drill"],
          preferred_session_minutes: 20,
        },
        policies: [],
      },
      sourceChunks: [
        makeChunk(
          "chunk-context-1",
          "topic-context-1",
          "mock-paper-mitosis.pdf",
          "AQA frequently asks why chromosome number stays the same after mitosis. Strong answers mention genetically identical daughter cells and one DNA replication before division."
        ),
      ],
      expectations: {
        gapKeywords: [
          "chromosome number",
          "genetically identical",
          "daughter cells",
        ],
        misconceptionKeywords: [
          "chromosome number",
          "genetically identical",
        ],
        sourceKeywords: [
          "mock-paper-mitosis.pdf",
          "DNA replication",
        ],
        expectedDifficultyBand: "foundational",
      },
    },
    {
      id: "transport-atp-gap",
      title: "Transport-in-cells learner who confuses osmosis and active transport",
      summary:
        "Mid-mastery learner with a stable ATP misconception and a household worksheet containing the exact membrane language they have seen before.",
      provenance:
        "Synthetic GCSE Biology fixture committed in src/evals/fixtures/context-vs-blank.ts on 2026-03-30. Designed to test whether structured context can recover a prior transport misconception.",
      block: makeBlock(
        "block-context-2",
        "topic-context-2",
        "Transport in cells",
        "Confidence dropped after a retrieval miss"
      ),
      learnerContext: {
        masteryLevel: 0.42,
        knownMisconceptions: [
          "Confuses osmosis with active transport and forgets that ATP is only needed for movement against the concentration gradient.",
        ],
        confirmedMemory: [
          {
            category: "confidence_pattern",
            content:
              "Becomes overconfident on membrane transport questions after getting one easy diffusion question correct.",
          },
        ],
        preferences: {
          preferred_time_of_day: "evening",
        },
        policies: [],
      },
      sourceChunks: [
        makeChunk(
          "chunk-context-2",
          "topic-context-2",
          "household-revision-sheet.pdf",
          "Osmosis is the movement of water through a partially permeable membrane. Active transport uses ATP to move particles against the concentration gradient."
        ),
      ],
      expectations: {
        gapKeywords: [
          "ATP",
          "partially permeable membrane",
          "concentration gradient",
        ],
        misconceptionKeywords: [
          "osmosis",
          "active transport",
          "ATP",
        ],
        sourceKeywords: [
          "household-revision-sheet.pdf",
          "partially permeable membrane",
        ],
        expectedDifficultyBand: "intermediate",
      },
    },
    {
      id: "homeostasis-exam-bridge",
      title: "Higher-mastery learner moving from recall into exam-style application",
      summary:
        "Strong learner with one lingering regulation misconception and a six-mark source excerpt that should push the tutor into an exam-style opening.",
      provenance:
        "Synthetic GCSE Biology fixture committed in src/evals/fixtures/context-vs-blank.ts on 2026-03-30. Built to test whether richer context can shift the opening into a harder exam-style task.",
      block: makeBlock(
        "block-context-3",
        "topic-context-3",
        "Homeostasis",
        "Exam is approaching and the learner is ready for harder application"
      ),
      learnerContext: {
        masteryLevel: 0.79,
        knownMisconceptions: [
          "Explains insulin lowering blood glucose correctly but leaves out the negative-feedback loop and glucagon recovery when the question gets longer.",
        ],
        confirmedMemory: [
          {
            category: "exam_technique",
            content:
              "Handles six-mark answers better when the tutor forces them to connect cause, response, and feedback loop explicitly.",
          },
        ],
        preferences: {
          preferred_block_types: ["timed_problems", "retrieval_drill"],
        },
        policies: [],
      },
      sourceChunks: [
        makeChunk(
          "chunk-context-3",
          "topic-context-3",
          "six-mark-homeostasis-question.pdf",
          "Explain how insulin and glucagon keep blood glucose concentration stable by negative feedback. The strongest responses link detection, hormone release, and restoring the set point."
        ),
      ],
      expectations: {
        gapKeywords: [
          "insulin",
          "glucagon",
          "negative feedback",
        ],
        misconceptionKeywords: [
          "negative feedback",
          "glucagon",
        ],
        sourceKeywords: [
          "six-mark-homeostasis-question.pdf",
          "set point",
        ],
        expectedDifficultyBand: "stretch",
      },
    },
  ];
