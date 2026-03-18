import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import {
  commandWords,
  studyBlocks,
  blockAttempts,
  learnerQualifications,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LearnerId } from "@/lib/types";
import {
  getTechniqueMastery,
  getCommandWordsForQualification,
  formatCommandWordSection,
  type CommandWordContext,
  type TechniqueMastery,
} from "./technique";

beforeEach(() => {
  resetFixtureCounter();
});

async function seedCommandWords(qualificationVersionId: string) {
  const db = getTestDb();
  const words = [
    { word: "Describe", definition: "Give an account of something.", expectedDepth: 1 },
    { word: "Explain", definition: "Make something clear, or state the reasons.", expectedDepth: 3 },
    { word: "Evaluate", definition: "Judge from available evidence.", expectedDepth: 4 },
    { word: "Calculate", definition: "Determine the value of something.", expectedDepth: 2 },
    { word: "Compare", definition: "Identify similarities and/or differences.", expectedDepth: 3 },
  ];
  for (const w of words) {
    await db.insert(commandWords).values({
      qualificationVersionId,
      word: w.word,
      definition: w.definition,
      expectedDepth: w.expectedDepth,
    });
  }
  return words;
}

async function createAttemptWithNotes(
  learnerId: string,
  topicId: string,
  score: string | null,
  notes: string,
  createdAt?: Date
) {
  const db = getTestDb();
  const [block] = await db
    .insert(studyBlocks)
    .values({
      learnerId,
      topicId,
      blockType: "retrieval_drill",
      durationMinutes: 15,
      priority: 5,
    })
    .returning();

  const [attempt] = await db
    .insert(blockAttempts)
    .values({
      blockId: block.id,
      score,
      notes,
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();

  return { block, attempt };
}

describe("getTechniqueMastery", () => {
  it("returns empty array when learner has no active qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    expect(result).toEqual([]);
  });

  it("returns empty array when qualification has no command words", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    expect(result).toEqual([]);
  });

  it("returns all command words with zero attempts when learner has no block attempts", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);

    expect(result).toHaveLength(5);
    for (const r of result) {
      expect(r.questionsAttempted).toBe(0);
      expect(r.avgScore).toBeNull();
      expect(r.trend).toBe("insufficient_data");
    }
    expect(result.map((r) => r.commandWord)).toEqual(
      ["Calculate", "Compare", "Describe", "Evaluate", "Explain"]
    );
  });

  it("counts attempts that mention command words in notes", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    await createAttemptWithNotes(learner.id, topicId, "80.00", "The student was asked to describe cell structure.");
    await createAttemptWithNotes(learner.id, topicId, "60.00", "Describe question on mitosis.");
    await createAttemptWithNotes(learner.id, topicId, "90.00", "Explain question about enzymes.");

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);

    const describe = result.find((r) => r.commandWord === "Describe");
    expect(describe).toBeDefined();
    expect(describe!.questionsAttempted).toBe(2);
    expect(describe!.avgScore).toBe(70);

    const explain = result.find((r) => r.commandWord === "Explain");
    expect(explain).toBeDefined();
    expect(explain!.questionsAttempted).toBe(1);
    expect(explain!.avgScore).toBe(90);

    const evaluate = result.find((r) => r.commandWord === "Evaluate");
    expect(evaluate).toBeDefined();
    expect(evaluate!.questionsAttempted).toBe(0);
    expect(evaluate!.avgScore).toBeNull();
  });

  it("computes trend as improving when later scores are higher", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;
    const now = Date.now();

    await createAttemptWithNotes(learner.id, topicId, "40.00", "explain question", new Date(now - 5 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "45.00", "explain question", new Date(now - 4 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "70.00", "explain question", new Date(now - 2 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "85.00", "explain question", new Date(now - 86400000));

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const explain = result.find((r) => r.commandWord === "Explain");
    expect(explain!.trend).toBe("improving");
  });

  it("computes trend as declining when later scores are lower", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;
    const now = Date.now();

    await createAttemptWithNotes(learner.id, topicId, "90.00", "describe question", new Date(now - 5 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "85.00", "describe question", new Date(now - 4 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "50.00", "describe question", new Date(now - 2 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "40.00", "describe question", new Date(now - 86400000));

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const describe = result.find((r) => r.commandWord === "Describe");
    expect(describe!.trend).toBe("declining");
  });

  it("computes trend as stable when scores are consistent", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;
    const now = Date.now();

    await createAttemptWithNotes(learner.id, topicId, "70.00", "evaluate question", new Date(now - 4 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "72.00", "evaluate question", new Date(now - 3 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "68.00", "evaluate question", new Date(now - 2 * 86400000));
    await createAttemptWithNotes(learner.id, topicId, "71.00", "evaluate question", new Date(now - 86400000));

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const evaluate = result.find((r) => r.commandWord === "Evaluate");
    expect(evaluate!.trend).toBe("stable");
  });

  it("returns insufficient_data trend when fewer than 3 attempts", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    await createAttemptWithNotes(learner.id, topicId, "80.00", "compare question");
    await createAttemptWithNotes(learner.id, topicId, "85.00", "compare question");

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const compare = result.find((r) => r.commandWord === "Compare");
    expect(compare!.questionsAttempted).toBe(2);
    expect(compare!.trend).toBe("insufficient_data");
  });

  it("handles null scores gracefully", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    await createAttemptWithNotes(learner.id, topicId, null, "describe question — session abandoned");
    await createAttemptWithNotes(learner.id, topicId, "75.00", "describe question on osmosis");

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const describe = result.find((r) => r.commandWord === "Describe");
    expect(describe!.questionsAttempted).toBe(2);
    expect(describe!.avgScore).toBe(75);
  });

  it("is case-insensitive when matching command words in notes", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    await createAttemptWithNotes(learner.id, topicId, "70.00", "EVALUATE question on evolution");
    await createAttemptWithNotes(learner.id, topicId, "80.00", "Evaluate the evidence for natural selection");
    await createAttemptWithNotes(learner.id, topicId, "60.00", "evaluate: weigh up both sides");

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const evaluate = result.find((r) => r.commandWord === "Evaluate");
    expect(evaluate!.questionsAttempted).toBe(3);
    expect(evaluate!.avgScore).toBe(70);
  });

  it("returns results sorted alphabetically by command word", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const words = result.map((r) => r.commandWord);
    expect(words).toEqual([...words].sort());
  });

  it("deduplicates command words across multiple qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const qual1 = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual1.qualificationVersionId);
    await db.insert(commandWords).values({
      qualificationVersionId: qual1.qualificationVersionId,
      word: "Explain",
      definition: "Make something clear.",
      expectedDepth: 3,
    });

    const qual2 = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual2.qualificationVersionId);
    await db.insert(commandWords).values({
      qualificationVersionId: qual2.qualificationVersionId,
      word: "Explain",
      definition: "State the reasons for something happening.",
      expectedDepth: 3,
    });

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const explains = result.filter((r) => r.commandWord === "Explain");
    expect(explains).toHaveLength(1);
  });

  it("includes definition and expectedDepth in results", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    const explain = result.find((r) => r.commandWord === "Explain");
    expect(explain!.definition).toBe("Make something clear, or state the reasons.");
    expect(explain!.expectedDepth).toBe(3);

    const evaluate = result.find((r) => r.commandWord === "Evaluate");
    expect(evaluate!.definition).toBe("Judge from available evidence.");
    expect(evaluate!.expectedDepth).toBe(4);
  });

  it("ignores attempts from other learners", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner1 = await createTestLearner(org.id);
    const learner2 = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner1.id, qual.qualificationVersionId);
    await enrollLearnerInQualification(learner2.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    await createAttemptWithNotes(learner2.id, topicId, "90.00", "describe question");

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner1.id as LearnerId);
    const describe = result.find((r) => r.commandWord === "Describe");
    expect(describe!.questionsAttempted).toBe(0);
  });

  it("ignores attempts with no notes", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await seedCommandWords(qual.qualificationVersionId);

    const topicId = qual.topics[1].id;

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 5,
      })
      .returning();

    await db.insert(blockAttempts).values({
      blockId: block.id,
      score: "80.00",
      notes: null,
    });

    const result = await getTechniqueMastery(db as Parameters<typeof getTechniqueMastery>[0], learner.id as LearnerId);
    for (const r of result) {
      expect(r.questionsAttempted).toBe(0);
    }
  });
});

describe("getCommandWordsForQualification", () => {
  it("returns command words for a qualification version", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();
    await seedCommandWords(qual.qualificationVersionId);

    const result = await getCommandWordsForQualification(
      db as Parameters<typeof getCommandWordsForQualification>[0],
      qual.qualificationVersionId
    );

    expect(result).toHaveLength(5);
    expect(result[0].word).toBe("Calculate");
    expect(result[0].definition).toBe("Determine the value of something.");
    expect(result[0].expectedDepth).toBe(2);
  });

  it("returns empty array when no command words exist", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();

    const result = await getCommandWordsForQualification(
      db as Parameters<typeof getCommandWordsForQualification>[0],
      qual.qualificationVersionId
    );

    expect(result).toEqual([]);
  });

  it("returns results sorted alphabetically", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();
    await seedCommandWords(qual.qualificationVersionId);

    const result = await getCommandWordsForQualification(
      db as Parameters<typeof getCommandWordsForQualification>[0],
      qual.qualificationVersionId
    );

    const words = result.map((r) => r.word);
    expect(words).toEqual([...words].sort());
  });

  it("does not return command words from other qualifications", async () => {
    const db = getTestDb();
    const qual1 = await createTestQualification();
    const qual2 = await createTestQualification();
    await seedCommandWords(qual1.qualificationVersionId);

    const result = await getCommandWordsForQualification(
      db as Parameters<typeof getCommandWordsForQualification>[0],
      qual2.qualificationVersionId
    );

    expect(result).toEqual([]);
  });
});

describe("formatCommandWordSection", () => {
  it("returns empty string when no command words", () => {
    expect(formatCommandWordSection([])).toBe("");
  });

  it("formats command words into a markdown table", () => {
    const words: CommandWordContext[] = [
      { word: "Describe", definition: "Give an account.", expectedDepth: 1 },
      { word: "Explain", definition: "State the reasons.", expectedDepth: 3 },
    ];

    const result = formatCommandWordSection(words);

    expect(result).toContain("## Command Word Definitions");
    expect(result).toContain("| Describe | Give an account. | recall |");
    expect(result).toContain("| Explain | State the reasons. | analysis |");
    expect(result).toContain("## Mark Scheme Coaching");
    expect(result).toContain("## Timed Practice Awareness");
  });

  it("includes mark scheme coaching guidance", () => {
    const words: CommandWordContext[] = [
      { word: "Explain", definition: "State the reasons.", expectedDepth: 3 },
    ];

    const result = formatCommandWordSection(words);

    expect(result).toContain('A 4-mark "explain" question wants 2 points');
    expect(result).toContain('A 6-mark "evaluate" question requires evidence for AND against');
    expect(result).toContain("A 1-mark question wants one clear point");
  });

  it("includes timed practice guidance", () => {
    const words: CommandWordContext[] = [
      { word: "Calculate", definition: "Determine the value.", expectedDepth: 2 },
    ];

    const result = formatCommandWordSection(words);

    expect(result).toContain("roughly 1 minute per mark");
    expect(result).toContain("5 minutes for this 4-mark question");
    expect(result).toContain("gently prompt them to move on");
  });

  it("maps expectedDepth to correct labels", () => {
    const words: CommandWordContext[] = [
      { word: "Name", definition: "Identify.", expectedDepth: 1 },
      { word: "Calculate", definition: "Determine.", expectedDepth: 2 },
      { word: "Explain", definition: "State reasons.", expectedDepth: 3 },
      { word: "Evaluate", definition: "Judge.", expectedDepth: 4 },
    ];

    const result = formatCommandWordSection(words);

    expect(result).toContain("| Name | Identify. | recall |");
    expect(result).toContain("| Calculate | Determine. | application |");
    expect(result).toContain("| Explain | State reasons. | analysis |");
    expect(result).toContain("| Evaluate | Judge. | evaluation |");
  });

  it("handles unknown depth levels gracefully", () => {
    const words: CommandWordContext[] = [
      { word: "Synthesise", definition: "Combine ideas.", expectedDepth: 5 },
    ];

    const result = formatCommandWordSection(words);
    expect(result).toContain("| Synthesise | Combine ideas. | level 5 |");
  });

  it("includes coaching instruction text", () => {
    const words: CommandWordContext[] = [
      { word: "Evaluate", definition: "Judge.", expectedDepth: 4 },
    ];

    const result = formatCommandWordSection(words);

    expect(result).toContain(
      "explicitly coach the student on what it requires"
    );
    expect(result).toContain(
      "weigh up both sides and reach a judgement"
    );
  });
});
