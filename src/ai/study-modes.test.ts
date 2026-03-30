import { describe, it, expect } from "vitest";
import {
  loadPromptTemplate,
  buildSystemPrompt,
  parseSessionStatus,
  buildOutcomeExtractionPrompt,
  type LearnerContext,
} from "./study-modes";
import type { PastPaperSessionIntelligence } from "@/engine/past-paper";
import type {
  BlockType,
  StudyBlock,
  RetrievalResult,
  BlockId,
  LearnerId,
  TopicId,
  ChunkId,
} from "@/lib/types";

function makeBlock(overrides?: Partial<StudyBlock>): StudyBlock {
  return {
    id: "block-1" as BlockId,
    learnerId: "learner-1" as LearnerId,
    topicId: "topic-1" as TopicId,
    topicName: "Cell Biology",
    blockType: "retrieval_drill",
    durationMinutes: 15,
    priority: 3,
    reason: "Scheduled review",
    ...overrides,
  };
}

function makeLearnerContext(
  overrides?: Partial<LearnerContext>
): LearnerContext {
  return {
    masteryLevel: 0.65,
    knownMisconceptions: [],
    confirmedMemory: [],
    preferences: {},
    policies: [],
    ...overrides,
  };
}

function makeChunks(count = 1): RetrievalResult[] {
  return Array.from({ length: count }, (_, i) => ({
    chunkId: `chunk-${i}` as ChunkId,
    content: `This is source content for chunk ${i}. It covers cell biology concepts.`,
    score: 0.9 - i * 0.1,
    topicId: "topic-1" as TopicId,
    sourceFileName: `biology-notes-${i}.pdf`,
    sourceFileId: `file-${i}`,
  }));
}

function makePastPaperSessionIntelligence(): PastPaperSessionIntelligence {
  return {
    qualificationVersionId: "qual-1",
    topicId: "topic-1",
    topicName: "Cell Biology",
    paperCount: 2,
    questionCount: 3,
    totalMarks: 10,
    marks: {
      min: 2,
      max: 4,
      average: 3.3,
      distinct: [2, 4],
    },
    commandWords: [
      {
        word: "Explain",
        definition: "Make something clear, giving reasons.",
        expectedDepth: 3,
        count: 2,
        totalMarks: 8,
      },
    ],
    questionTypes: [
      {
        name: "Structured",
        description: "Short structured response",
        typicalMarks: 4,
        markSchemePattern: "Point-plus-reason explanation",
        count: 2,
        totalMarks: 8,
      },
    ],
    markSchemeSignals: [
      {
        signalType: "mark_scheme_pattern",
        code: "point_plus_reason",
        label: "Point-plus-reason explanation",
        note: "Marks reward linked scientific reasoning.",
        count: 2,
      },
    ],
    examTechniqueSignals: [
      {
        signalType: "exam_technique",
        code: "link_cause_and_effect",
        label: "Link cause and effect",
        note: "Build each mark as cause -> process -> outcome.",
        count: 2,
      },
    ],
    referenceQuestions: [
      {
        paperSlug: "paper-1",
        paperTitle: "AQA GCSE Biology Paper 1",
        series: "June",
        examYear: 2025,
        paperCode: "8461/1H",
        componentCode: "paper-1",
        componentName: "Paper 1",
        questionId: "question-1",
        questionNumber: "02.3",
        questionOrder: 3,
        locator: "02.3",
        promptExcerpt: "Explain why diffusion happens faster when the concentration gradient is steeper.",
        marksAvailable: 4,
        commandWord: {
          id: "cw-1",
          word: "Explain",
          definition: "Make something clear, giving reasons.",
          expectedDepth: 3,
        },
        questionType: {
          id: "qt-1",
          name: "Structured",
          description: "Short structured response",
          typicalMarks: 4,
          markSchemePattern: "Point-plus-reason explanation",
        },
        markSchemeSignals: [
          {
            signalType: "mark_scheme_pattern",
            code: "point_plus_reason",
            label: "Point-plus-reason explanation",
            note: "Marks reward linked scientific reasoning.",
          },
        ],
        examTechniqueSignals: [
          {
            signalType: "exam_technique",
            code: "link_cause_and_effect",
            label: "Link cause and effect",
            note: "Build each mark as cause -> process -> outcome.",
          },
        ],
      },
    ],
  };
}

describe("loadPromptTemplate", () => {
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

  it.each(allBlockTypes)(
    "loads the prompt template for %s",
    async (blockType) => {
      const template = await loadPromptTemplate(blockType);
      expect(template).toBeTruthy();
      expect(typeof template).toBe("string");
      expect(template.length).toBeGreaterThan(50);
    }
  );

  it("loads retrieval drill template with expected content", async () => {
    const template = await loadPromptTemplate("retrieval_drill");
    expect(template).toContain("Retrieval Drill");
    expect(template).toContain("session_status");
  });

  it("loads explanation template with expected content", async () => {
    const template = await loadPromptTemplate("explanation");
    expect(template).toContain("Explanation");
    expect(template).toContain("Socratic");
  });

  it("loads worked example template with expected content", async () => {
    const template = await loadPromptTemplate("worked_example");
    expect(template).toContain("Worked Example");
  });

  it("loads timed problems template with expected content", async () => {
    const template = await loadPromptTemplate("timed_problems");
    expect(template).toContain("Timed Problems");
    expect(template).toContain("marks");
  });

  it("loads essay planning template with expected content", async () => {
    const template = await loadPromptTemplate("essay_planning");
    expect(template).toContain("Essay Planning");
    expect(template).toContain("command word");
  });

  it("loads source analysis template with expected content", async () => {
    const template = await loadPromptTemplate("source_analysis");
    expect(template).toContain("Source Analysis");
  });

  it("loads mistake review template with expected content", async () => {
    const template = await loadPromptTemplate("mistake_review");
    expect(template).toContain("Mistake Review");
    expect(template).toContain("misconception");
  });

  it("loads reentry template with expected content", async () => {
    const template = await loadPromptTemplate("reentry");
    expect(template).toContain("Re-entry");
    expect(template).toContain("warm");
  });
});

describe("buildSystemPrompt", () => {
  it("builds a complete system prompt with all sections", async () => {
    const block = makeBlock();
    const context = makeLearnerContext();
    const chunks = makeChunks(2);

    const prompt = await buildSystemPrompt(block, context, chunks);

    expect(prompt).toContain("Swotta");
    expect(prompt).toContain("Retrieval Drill");
    expect(prompt).toContain("Cell Biology");
    expect(prompt).toContain("15 minutes");
    expect(prompt).toContain("65%");
    expect(prompt).toContain("Scheduled review");
    expect(prompt).toContain("Source Materials");
    expect(prompt).toContain("biology-notes-0.pdf");
    expect(prompt).toContain("biology-notes-1.pdf");
    expect(prompt).toContain("Important Guidelines");
  });

  it("includes misconceptions when present", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({
      knownMisconceptions: [
        "Confuses mitosis with meiosis",
        "Thinks all cells have a nucleus",
      ],
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("Confuses mitosis with meiosis");
    expect(prompt).toContain("Thinks all cells have a nucleus");
  });

  it("includes confirmed memory when present", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({
      confirmedMemory: [
        { category: "learning_style", content: "Prefers visual explanations" },
        {
          category: "accessibility",
          content: "Needs larger text due to dyslexia",
        },
      ],
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("learning_style");
    expect(prompt).toContain("Prefers visual explanations");
    expect(prompt).toContain("accessibility");
    expect(prompt).toContain("Needs larger text due to dyslexia");
  });

  it("includes preferences when present", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({
      preferences: {
        preferred_session_minutes: 20,
        visual_learner: true,
      },
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("preferred_session_minutes");
    expect(prompt).toContain("20");
    expect(prompt).toContain("visual_learner");
  });

  it("includes policies when present", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({
      policies: [
        {
          scopeType: "org",
          scopeId: "org-1",
          key: "essay_generation_allowed",
          value: false,
        },
        {
          scopeType: "global",
          scopeId: null,
          key: "session_time_limit",
          value: 45,
        },
      ],
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("essay_generation_allowed");
    expect(prompt).toContain("session_time_limit");
    expect(prompt).toContain("org");
    expect(prompt).toContain("global");
  });

  it("handles empty misconceptions gracefully", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({ knownMisconceptions: [] });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("None recorded");
  });

  it("handles empty source chunks gracefully", async () => {
    const block = makeBlock();
    const context = makeLearnerContext();

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("No source materials available");
  });

  it("handles empty policies gracefully", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({ policies: [] });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("No specific policies apply");
  });

  it("handles empty preferences gracefully", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({ preferences: {} });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("No specific preferences set");
  });

  it("handles empty confirmed memory gracefully", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({ confirmedMemory: [] });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("None recorded");
  });

  it("builds prompts for all block types", async () => {
    const allTypes: BlockType[] = [
      "retrieval_drill",
      "explanation",
      "worked_example",
      "timed_problems",
      "essay_planning",
      "source_analysis",
      "mistake_review",
      "reentry",
    ];

    for (const blockType of allTypes) {
      const block = makeBlock({ blockType });
      const context = makeLearnerContext();
      const prompt = await buildSystemPrompt(block, context, []);
      expect(prompt).toContain("Swotta");
      expect(prompt).toContain("session_status");
    }
  });

  it("includes mastery level as percentage", async () => {
    const block = makeBlock();
    const context = makeLearnerContext({ masteryLevel: 0.42 });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("42%");
  });

  it("formats source chunks with file names and content", async () => {
    const chunks = makeChunks(3);
    const block = makeBlock();
    const context = makeLearnerContext();

    const prompt = await buildSystemPrompt(block, context, chunks);

    expect(prompt).toContain('Source 1 (from "biology-notes-0.pdf")');
    expect(prompt).toContain('Source 2 (from "biology-notes-1.pdf")');
    expect(prompt).toContain('Source 3 (from "biology-notes-2.pdf")');
    expect(prompt).toContain("source content for chunk 0");
  });

  it("includes real exam intelligence for exam-style modes", async () => {
    const block = makeBlock({ blockType: "timed_problems" });
    const context = makeLearnerContext({
      examSession: {
        source: "past_paper",
        ...makePastPaperSessionIntelligence(),
      },
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("## Exam Intelligence");
    expect(prompt).toContain("3 questions across 2 papers");
    expect(prompt).toContain("Observed mark allocations");
    expect(prompt).toContain("Explain");
    expect(prompt).toContain("Point-plus-reason explanation");
    expect(prompt).toContain("Link cause and effect");
    expect(prompt).toContain("Explain why diffusion happens faster");
  });

  it("includes clean fallback guidance when exam intelligence is unavailable", async () => {
    const block = makeBlock({ blockType: "essay_planning" });
    const context = makeLearnerContext({
      examSession: {
        source: "fallback",
        qualificationVersionId: null,
        topicId: "topic-1",
        topicName: "Cell Biology",
        reason:
          "No structured past-paper intelligence is available for this topic yet.",
      },
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain("## Exam Intelligence");
    expect(prompt).toContain(
      "No structured past-paper intelligence is available for this topic yet."
    );
  });

  it("omits unstable aggregate signal notes instead of printing misleading text", async () => {
    const block = makeBlock({ blockType: "timed_problems" });
    const examSession = makePastPaperSessionIntelligence();
    examSession.markSchemeSignals = [
      {
        signalType: "mark_scheme_pattern",
        code: "point_plus_reason",
        label: "Point-plus-reason explanation",
        note: null,
        count: 2,
      },
    ];
    const context = makeLearnerContext({
      examSession: {
        source: "past_paper",
        ...examSession,
      },
    });

    const prompt = await buildSystemPrompt(block, context, []);

    expect(prompt).toContain(
      "**Point-plus-reason explanation** (2 questions)"
    );
    expect(prompt).not.toContain("(2 questions): null");
  });
});

describe("parseSessionStatus", () => {
  it("detects complete status", () => {
    const reply =
      "Great job! You got 4 out of 5 correct. <session_status>complete</session_status>";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(true);
    expect(result.cleanReply).toBe("Great job! You got 4 out of 5 correct.");
  });

  it("returns false for incomplete session", () => {
    const reply = "Here is your next question: What is mitosis?";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(false);
    expect(result.cleanReply).toBe(
      "Here is your next question: What is mitosis?"
    );
  });

  it("handles status tag at the start", () => {
    const reply =
      "<session_status>complete</session_status> You have finished all questions.";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(true);
    expect(result.cleanReply).toBe("You have finished all questions.");
  });

  it("handles status tag in the middle", () => {
    const reply =
      "Well done! <session_status>complete</session_status> Keep studying!";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(true);
    expect(result.cleanReply).toBe("Well done! Keep studying!");
  });

  it("handles empty reply", () => {
    const result = parseSessionStatus("");

    expect(result.isComplete).toBe(false);
    expect(result.cleanReply).toBe("");
  });

  it("does not match partial tags", () => {
    const reply = "The session_status is pending.";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(false);
    expect(result.cleanReply).toBe("The session_status is pending.");
  });

  it("handles multiple status tags by removing all", () => {
    const reply =
      "Done <session_status>complete</session_status> and <session_status>complete</session_status>";
    const result = parseSessionStatus(reply);

    expect(result.isComplete).toBe(true);
    expect(result.cleanReply).toBe("Done and");
  });
});

describe("buildOutcomeExtractionPrompt", () => {
  it("builds a valid extraction prompt", async () => {
    const prompt = await buildOutcomeExtractionPrompt(
      "retrieval_drill",
      "Cell Biology"
    );

    expect(prompt).toContain("assessment analysis");
    expect(prompt).toContain("Retrieval Drill");
    expect(prompt).toContain("Cell Biology");
    expect(prompt).toContain("score");
    expect(prompt).toContain("misconceptions");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("JSON");
  });

  it("includes all required fields in the schema", async () => {
    const prompt = await buildOutcomeExtractionPrompt("explanation", "Photosynthesis");

    expect(prompt).toContain("score");
    expect(prompt).toContain("misconceptions");
    expect(prompt).toContain("helpRequested");
    expect(prompt).toContain("helpTiming");
    expect(prompt).toContain("retentionOutcome");
    expect(prompt).toContain("summary");
  });

  it("uses the correct block type label", async () => {
    expect(
      await buildOutcomeExtractionPrompt("worked_example", "topic")
    ).toContain("Worked Example");
    expect(
      await buildOutcomeExtractionPrompt("essay_planning", "topic")
    ).toContain("Essay Planning");
    expect(
      await buildOutcomeExtractionPrompt("timed_problems", "topic")
    ).toContain("Timed Problems");
    expect(
      await buildOutcomeExtractionPrompt("source_analysis", "topic")
    ).toContain("Source Analysis");
    expect(
      await buildOutcomeExtractionPrompt("mistake_review", "topic")
    ).toContain("Mistake Review");
    expect(await buildOutcomeExtractionPrompt("reentry", "topic")).toContain(
      "Re-entry"
    );
  });
});
