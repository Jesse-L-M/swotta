import type { BlockType } from "@/lib/types";

type EmbeddingSeed = [number, number];

interface SourceChunkFixture {
  scope: "private" | "class" | "org" | "system";
  owner?: "learner" | "peer";
  filename: string;
  content: string;
  embedding: EmbeddingSeed;
  topic: "target" | "distractor";
  confidence: number;
}

export interface SourceGroundingEvalScenario {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  query: string;
  queryEmbedding: EmbeddingSeed;
  block: {
    topicName: string;
    blockType: BlockType;
    reason: string;
    durationMinutes: number;
  };
  learnerContext: {
    masteryLevel: number;
    knownMisconceptions: string[];
    confirmedMemory: Array<{ category: string; content: string }>;
    preferences: Record<string, unknown>;
    policies: [];
  };
  chunks: SourceChunkFixture[];
  expectations: {
    expectedRetrievedSources: string[];
    forbiddenSources: string[];
    expectedTopSource: string;
    groundingKeywords: string[];
  };
}

export const SOURCE_GROUNDING_EVAL_FIXTURES: SourceGroundingEvalScenario[] = [
  {
    id: "private-mock-corrections-win",
    title: "Private mock corrections outrank a generic system specification",
    summary:
      "Checks that the live retrieval path prefers the learner's own mock corrections and drops an off-topic distractor when the block is about chromosome-number mistakes in cell division.",
    provenance:
      "Synthetic source-grounding fixture committed in src/evals/fixtures/source-grounding.ts on 2026-03-31. It exercises the real retrieveChunks path with deterministic embeddings and topic mappings.",
    query: "Use my mock corrections on chromosome number in mitosis.",
    queryEmbedding: [0.96, 0.04],
    block: {
      topicName: "Cell division",
      blockType: "source_analysis",
      reason: "Student needs to ground a correction in their own mock feedback",
      durationMinutes: 15,
    },
    learnerContext: {
      masteryLevel: 0.26,
      knownMisconceptions: [
        "Says mitosis halves the chromosome number instead of keeping daughter cells genetically identical.",
      ],
      confirmedMemory: [
        {
          category: "mock_feedback_pattern",
          content:
            "Learner improves when the tutor quotes the exact correction note from their marked paper before asking for a rewrite.",
        },
      ],
      preferences: {
        preferred_block_types: ["source_analysis", "worked_example"],
      },
      policies: [],
    },
    chunks: [
      {
        scope: "private",
        owner: "learner",
        filename: "mitosis-mock-corrections.pdf",
        content:
          "Mock correction: AQA expects you to say the chromosome number stays the same after mitosis because DNA replicates once before division, leaving genetically identical daughter cells.",
        embedding: [0.97, 0.02],
        topic: "target",
        confidence: 0.95,
      },
      {
        scope: "system",
        filename: "biology-specification.pdf",
        content:
          "Specification note: Mitosis produces two genetically identical daughter cells for growth and repair.",
        embedding: [0.82, 0.08],
        topic: "target",
        confidence: 0.82,
      },
      {
        scope: "system",
        filename: "respiration-glossary.pdf",
        content:
          "Respiration releases energy from glucose and is not about chromosome-number changes.",
        embedding: [0.11, 0.93],
        topic: "distractor",
        confidence: 0.9,
      },
    ],
    expectations: {
      expectedRetrievedSources: [
        "mitosis-mock-corrections.pdf",
        "biology-specification.pdf",
      ],
      forbiddenSources: ["respiration-glossary.pdf"],
      expectedTopSource: "mitosis-mock-corrections.pdf",
      groundingKeywords: [
        "chromosome number stays the same",
        "DNA replicates once before division",
        "genetically identical daughter cells",
      ],
    },
  },
  {
    id: "class-worksheet-no-peer-leak",
    title: "Class worksheet is visible, another learner's private notes are not",
    summary:
      "Checks that accessible class materials ground the prompt while a near-identical private note from another learner is excluded by scope resolution.",
    provenance:
      "Synthetic source-grounding fixture committed in src/evals/fixtures/source-grounding.ts on 2026-03-31. It tests retrieval relevance and access scoping together.",
    query: "Use the worksheet wording for osmosis and active transport.",
    queryEmbedding: [0.58, 0.42],
    block: {
      topicName: "Transport in cells",
      blockType: "source_analysis",
      reason: "Student keeps mixing up osmosis and active transport on class questions",
      durationMinutes: 20,
    },
    learnerContext: {
      masteryLevel: 0.41,
      knownMisconceptions: [
        "Mixes up osmosis and active transport, especially when ATP and membranes appear together in the same question.",
      ],
      confirmedMemory: [],
      preferences: {
        preferred_time_of_day: "evening",
      },
      policies: [],
    },
    chunks: [
      {
        scope: "class",
        filename: "teacher-membrane-worksheet.pdf",
        content:
          "Class worksheet: Osmosis is the movement of water through a partially permeable membrane. Active transport uses ATP to move particles against the concentration gradient.",
        embedding: [0.61, 0.39],
        topic: "target",
        confidence: 0.94,
      },
      {
        scope: "private",
        owner: "peer",
        filename: "other-learner-mark-scheme.pdf",
        content:
          "Private note: ATP is needed against the concentration gradient. This should never appear in another learner's retrieval results.",
        embedding: [0.63, 0.37],
        topic: "target",
        confidence: 0.97,
      },
      {
        scope: "system",
        filename: "cell-transport-overview.pdf",
        content:
          "System overview: Diffusion moves particles from high to low concentration without ATP.",
        embedding: [0.44, 0.56],
        topic: "target",
        confidence: 0.79,
      },
    ],
    expectations: {
      expectedRetrievedSources: [
        "teacher-membrane-worksheet.pdf",
        "cell-transport-overview.pdf",
      ],
      forbiddenSources: ["other-learner-mark-scheme.pdf"],
      expectedTopSource: "teacher-membrane-worksheet.pdf",
      groundingKeywords: [
        "partially permeable membrane",
        "ATP",
        "concentration gradient",
      ],
    },
  },
  {
    id: "org-lab-sheet-plus-private-summary",
    title: "Org lab sheet and learner summary both ground an exam-style enzymes block",
    summary:
      "Checks that the integrated retrieval path can pull two accessible sources for the same topic and carry both cues into the prompt without importing an off-topic chunk.",
    provenance:
      "Synthetic source-grounding fixture committed in src/evals/fixtures/source-grounding.ts on 2026-03-31. It is designed to keep the source-grounding suite honest on multiple accessible sources, not just single-file recall.",
    query: "Ground this enzymes question in the practical method and the learner summary.",
    queryEmbedding: [0.74, 0.26],
    block: {
      topicName: "Enzymes",
      blockType: "worked_example",
      reason: "Learner needs to connect the required practical method to exam wording",
      durationMinutes: 15,
    },
    learnerContext: {
      masteryLevel: 0.57,
      knownMisconceptions: [
        "Describes the practical without linking temperature control to a fair test.",
      ],
      confirmedMemory: [
        {
          category: "practical_preference",
          content:
            "Learner retains required practical steps better when the explanation keeps method and variable control side by side.",
        },
      ],
      preferences: {
        preferred_block_types: ["worked_example"],
      },
      policies: [],
    },
    chunks: [
      {
        scope: "org",
        filename: "department-required-practical.pdf",
        content:
          "Department practical sheet: Keep pH constant with a buffer, hold temperature steady with a water bath, and measure reaction rate fairly across repeats.",
        embedding: [0.77, 0.23],
        topic: "target",
        confidence: 0.91,
      },
      {
        scope: "private",
        owner: "learner",
        filename: "enzyme-summary-cards.pdf",
        content:
          "Learner summary: Higher temperatures increase kinetic energy until the enzyme denatures and the active site changes shape.",
        embedding: [0.71, 0.29],
        topic: "target",
        confidence: 0.88,
      },
      {
        scope: "org",
        filename: "photosynthesis-practical.pdf",
        content:
          "Photosynthesis practical: Count oxygen bubbles to estimate rate under different light intensities.",
        embedding: [0.2, 0.8],
        topic: "distractor",
        confidence: 0.92,
      },
    ],
    expectations: {
      expectedRetrievedSources: [
        "department-required-practical.pdf",
        "enzyme-summary-cards.pdf",
      ],
      forbiddenSources: ["photosynthesis-practical.pdf"],
      expectedTopSource: "department-required-practical.pdf",
      groundingKeywords: [
        "buffer",
        "water bath",
        "active site changes shape",
      ],
    },
  },
];
