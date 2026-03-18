import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadPromptTemplate,
  buildSystemPrompt,
  parseSessionStatus,
  buildOutcomeExtractionPrompt,
  type LearnerContext,
} from "./study-modes";
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
  it("builds a valid extraction prompt", () => {
    const prompt = buildOutcomeExtractionPrompt(
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

  it("includes all required fields in the schema", () => {
    const prompt = buildOutcomeExtractionPrompt("explanation", "Photosynthesis");

    expect(prompt).toContain("score");
    expect(prompt).toContain("misconceptions");
    expect(prompt).toContain("helpRequested");
    expect(prompt).toContain("helpTiming");
    expect(prompt).toContain("retentionOutcome");
    expect(prompt).toContain("summary");
  });

  it("uses the correct block type label", () => {
    expect(
      buildOutcomeExtractionPrompt("worked_example", "topic")
    ).toContain("Worked Example");
    expect(
      buildOutcomeExtractionPrompt("essay_planning", "topic")
    ).toContain("Essay Planning");
    expect(
      buildOutcomeExtractionPrompt("timed_problems", "topic")
    ).toContain("Timed Problems");
    expect(
      buildOutcomeExtractionPrompt("source_analysis", "topic")
    ).toContain("Source Analysis");
    expect(
      buildOutcomeExtractionPrompt("mistake_review", "topic")
    ).toContain("Mistake Review");
    expect(buildOutcomeExtractionPrompt("reentry", "topic")).toContain(
      "Re-entry"
    );
  });
});
