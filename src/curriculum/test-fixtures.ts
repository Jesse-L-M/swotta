import type { LegacyQualificationSeed } from "./legacy";
import type { ApprovedCurriculumPackage } from "./schema";

export function buildApprovedCurriculumPackage(): ApprovedCurriculumPackage {
  return {
    schemaVersion: "1.0",
    lifecycle: "approved",
    metadata: {
      packageId: "aqa-gcse-biology-8461",
      packageVersion: "1.0.0",
      title: "AQA GCSE Biology",
      summary: "Reviewed curriculum package fixture for contract tests.",
      generatedAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:30:00.000Z",
    },
    qualification: {
      name: "GCSE Biology",
      slug: "gcse-biology",
      level: "GCSE",
      versionCode: "8461",
      firstExamYear: 2018,
      specUrl: "https://example.com/specification",
      subject: {
        name: "Biology",
        slug: "biology",
      },
      examBoard: {
        name: "AQA",
        code: "AQA",
      },
    },
    provenance: {
      sources: [
        {
          id: "specification",
          kind: "specification",
          authority: "primary",
          title: "AQA GCSE Biology specification",
          uri: "https://example.com/specification",
        },
      ],
      derivedFrom: [
        {
          packageId: "aqa-gcse-biology-legacy-8461",
          relationship: "legacy_seed",
        },
      ],
      generatedBy: {
        tool: "curriculum-fixture",
        version: "1.0.0",
      },
    },
    review: {
      status: "approved",
      approvedAt: "2026-03-28T12:30:00.000Z",
      reviewers: [
        {
          name: "Jess Reviewer",
          role: "human",
          outcome: "approved",
          reviewedAt: "2026-03-28T12:25:00.000Z",
          notes: "Ready for production seeding.",
        },
      ],
    },
    components: [
      {
        id: "component-paper-1",
        name: "Paper 1",
        code: "8461-1h",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
      {
        id: "component-paper-2",
        name: "Paper 2",
        code: "8461-2h",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
    ],
    topics: [
      {
        id: "topic-cell-biology",
        name: "Cell Biology",
        code: "4.1",
        parentId: null,
        depth: 0,
        sortOrder: 1,
      },
      {
        id: "topic-cell-structure",
        name: "Cell Structure",
        code: "4.1.1",
        parentId: "topic-cell-biology",
        depth: 1,
        sortOrder: 1,
      },
      {
        id: "topic-cell-division",
        name: "Cell Division",
        code: "4.1.2",
        parentId: "topic-cell-biology",
        depth: 1,
        sortOrder: 2,
      },
    ],
    edges: [
      {
        fromTopicId: "topic-cell-division",
        toTopicId: "topic-cell-structure",
        type: "prerequisite",
      },
    ],
    commandWords: [
      {
        id: "command-word-explain",
        word: "Explain",
        definition: "Give reasons using scientific detail.",
        expectedDepth: 3,
        guidance: "Expect linked scientific cause and effect.",
      },
    ],
    questionTypes: [
      {
        id: "question-type-extended-response",
        name: "Extended response",
        description: "Multi-mark written explanation question.",
        typicalMarks: 6,
      },
    ],
    misconceptionRules: [
      {
        id: "misconception-cell-division",
        topicId: "topic-cell-division",
        description: "Confuses mitosis with meiosis.",
        triggerPatterns: ["mitosis makes gametes"],
        correctionGuidance:
          "Mitosis makes genetically identical cells for growth and repair.",
        severity: 2,
      },
    ],
    taskRules: [
      {
        id: "task-rule-cell-division",
        taskType: "worked_example",
        topicId: "topic-cell-division",
        title: "Sequence mitosis before free response",
        guidance:
          "Use a worked example before any timed response on mitosis stages.",
        conditions: ["confidence below 0.6", "first exposure"],
        priority: "high",
      },
    ],
    sourceMappings: [
      {
        id: "source-mapping-cell-division-spec",
        sourceId: "specification",
        topicId: "topic-cell-division",
        locator: "Section 4.1.2",
        excerptHint: "Mitosis and the cell cycle",
        confidence: "high",
      },
    ],
    annotations: {
      markSchemePatterns: [
        {
          id: "mark-scheme-levelled-response",
          label: "Levelled response",
          description: "Credit grows with linked reasoning and precision.",
          questionTypeId: "question-type-extended-response",
          componentId: "component-paper-2",
        },
      ],
      examTechniquePatterns: [
        {
          id: "exam-technique-explain",
          label: "Explain pattern",
          description: "State the mechanism, then connect it to the outcome.",
          commandWordId: "command-word-explain",
        },
      ],
    },
  };
}

export function buildLegacyQualificationSeed(): LegacyQualificationSeed {
  return {
    subject: { name: "Biology", slug: "biology" },
    examBoard: { name: "AQA", code: "AQA" },
    level: "GCSE",
    versionCode: "8461",
    firstExamYear: 2018,
    specUrl: "https://example.com/specification",
    components: [
      {
        name: "Paper 1",
        code: "8461/1H",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
      {
        name: "Paper 2",
        code: "8461/2H",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
    ],
    topics: [
      {
        name: "Cell Biology",
        code: "4.1",
        children: [
          {
            name: "Cell Structure",
            code: "4.1.1",
          },
          {
            name: "Cell Division",
            code: "4.1.2",
            edges: [{ toCode: "4.1.1", type: "prerequisite" }],
          },
        ],
      },
    ],
    commandWords: [
      {
        word: "Explain",
        definition: "Give reasons using scientific detail.",
        expectedDepth: 3,
      },
    ],
    questionTypes: [
      {
        name: "Extended response",
        typicalMarks: 6,
      },
    ],
    misconceptionRules: [
      {
        topicCode: "4.1.2",
        description: "Confuses mitosis with meiosis.",
        triggerPatterns: ["mitosis makes gametes"],
        correctionGuidance:
          "Mitosis makes genetically identical cells for growth and repair.",
        severity: 2,
      },
    ],
  };
}
