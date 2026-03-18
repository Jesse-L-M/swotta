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
  learnerTopicState,
  studyBlocks,
  misconceptionEvents,
  confidenceEvents,
  retentionEvents,
  memoryCandidates,
  memoryConfirmed,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type {
  LearnerId,
  TopicId,
  QualificationVersionId,
  BlockId,
  AttemptOutcome,
} from "@/lib/types";
import {
  scoreToQuality,
  scoreToRetentionOutcome,
  calculateNewEaseFactor,
  calculateNewInterval,
  calculateNewMastery,
  processAttemptOutcome,
  initTopicStates,
  processDiagnosticResult,
} from "./mastery";

beforeEach(() => {
  resetFixtureCounter();
});

describe("scoreToQuality", () => {
  it("returns 5 for scores >= 90", () => {
    expect(scoreToQuality(90)).toBe(5);
    expect(scoreToQuality(95)).toBe(5);
    expect(scoreToQuality(100)).toBe(5);
  });

  it("returns 4 for scores 80-89", () => {
    expect(scoreToQuality(80)).toBe(4);
    expect(scoreToQuality(85)).toBe(4);
    expect(scoreToQuality(89)).toBe(4);
  });

  it("returns 3 for scores 60-79", () => {
    expect(scoreToQuality(60)).toBe(3);
    expect(scoreToQuality(70)).toBe(3);
    expect(scoreToQuality(79)).toBe(3);
  });

  it("returns 2 for scores 40-59", () => {
    expect(scoreToQuality(40)).toBe(2);
    expect(scoreToQuality(50)).toBe(2);
    expect(scoreToQuality(59)).toBe(2);
  });

  it("returns 1 for scores 20-39", () => {
    expect(scoreToQuality(20)).toBe(1);
    expect(scoreToQuality(30)).toBe(1);
    expect(scoreToQuality(39)).toBe(1);
  });

  it("returns 0 for scores < 20", () => {
    expect(scoreToQuality(0)).toBe(0);
    expect(scoreToQuality(10)).toBe(0);
    expect(scoreToQuality(19)).toBe(0);
  });
});

describe("scoreToRetentionOutcome", () => {
  it("returns 'remembered' for scores >= 60", () => {
    expect(scoreToRetentionOutcome(60)).toBe("remembered");
    expect(scoreToRetentionOutcome(100)).toBe("remembered");
  });

  it("returns 'partial' for scores 20-59", () => {
    expect(scoreToRetentionOutcome(20)).toBe("partial");
    expect(scoreToRetentionOutcome(40)).toBe("partial");
    expect(scoreToRetentionOutcome(59)).toBe("partial");
  });

  it("returns 'forgotten' for scores < 20", () => {
    expect(scoreToRetentionOutcome(0)).toBe("forgotten");
    expect(scoreToRetentionOutcome(19)).toBe("forgotten");
  });
});

describe("calculateNewEaseFactor", () => {
  it("increases EF for perfect quality (5)", () => {
    const result = calculateNewEaseFactor(2.5, 5);
    expect(result).toBeGreaterThan(2.5);
  });

  it("stays roughly the same for quality 4", () => {
    const result = calculateNewEaseFactor(2.5, 4);
    expect(result).toBeCloseTo(2.5, 1);
  });

  it("stays about the same for quality 3", () => {
    const result = calculateNewEaseFactor(2.5, 3);
    expect(result).toBeLessThanOrEqual(2.5);
    expect(result).toBeGreaterThanOrEqual(2.3);
  });

  it("decreases EF for quality 2", () => {
    const result = calculateNewEaseFactor(2.5, 2);
    expect(result).toBeLessThan(2.5);
  });

  it("decreases EF more for quality 1", () => {
    const q1 = calculateNewEaseFactor(2.5, 1);
    const q2 = calculateNewEaseFactor(2.5, 2);
    expect(q1).toBeLessThan(q2);
  });

  it("decreases EF most for quality 0", () => {
    const q0 = calculateNewEaseFactor(2.5, 0);
    const q1 = calculateNewEaseFactor(2.5, 1);
    expect(q0).toBeLessThan(q1);
  });

  it("never goes below 1.3", () => {
    const result = calculateNewEaseFactor(1.3, 0);
    expect(result).toBe(1.3);
  });

  it("does not go below 1.3 even with repeated low quality", () => {
    let ef = 2.5;
    for (let i = 0; i < 20; i++) {
      ef = calculateNewEaseFactor(ef, 0);
    }
    expect(ef).toBe(1.3);
  });
});

describe("calculateNewInterval", () => {
  it("returns 1 for first review", () => {
    expect(calculateNewInterval(0, 0, 2.5, 5)).toBe(1);
  });

  it("returns 6 for second review", () => {
    expect(calculateNewInterval(1, 1, 2.5, 5)).toBe(6);
  });

  it("returns interval * EF for subsequent reviews", () => {
    expect(calculateNewInterval(2, 6, 2.5, 5)).toBe(15);
    expect(calculateNewInterval(3, 15, 2.5, 5)).toBe(38);
  });

  it("resets to 1 when quality < 3", () => {
    expect(calculateNewInterval(5, 30, 2.5, 2)).toBe(1);
    expect(calculateNewInterval(5, 30, 2.5, 1)).toBe(1);
    expect(calculateNewInterval(5, 30, 2.5, 0)).toBe(1);
  });

  it("rounds to nearest integer", () => {
    const result = calculateNewInterval(2, 6, 2.3, 3);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("calculateNewMastery", () => {
  it("blends current mastery with score using 70/30 weights", () => {
    const result = calculateNewMastery(0.5, 80);
    expect(result).toBeCloseTo(0.59, 2);
  });

  it("increases mastery with high scores", () => {
    const result = calculateNewMastery(0.5, 100);
    expect(result).toBeGreaterThan(0.5);
  });

  it("decreases mastery with low scores", () => {
    const result = calculateNewMastery(0.5, 0);
    expect(result).toBeLessThan(0.5);
  });

  it("clamps to 0-1 range", () => {
    expect(calculateNewMastery(0, 0)).toBe(0);
    expect(calculateNewMastery(1, 100)).toBe(1);
  });

  it("never exceeds 1.0", () => {
    expect(calculateNewMastery(0.95, 100)).toBeLessThanOrEqual(1.0);
  });

  it("never goes below 0.0", () => {
    expect(calculateNewMastery(0, 0)).toBeGreaterThanOrEqual(0.0);
  });

  it("rounds to 3 decimal places", () => {
    const result = calculateNewMastery(0.333, 66);
    const decimals = result.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(3);
  });
});

describe("processAttemptOutcome", () => {
  async function setupTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const topic = qual.topics[1]; // Topic 1.1 (leaf topic)

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: topic.id,
      masteryLevel: "0.500",
      easeFactor: "2.50",
      intervalDays: 6,
      reviewCount: 2,
      streak: 2,
    });

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 3,
      })
      .returning();

    return { db, learner, qual, topic, block };
  }

  it("updates mastery state for a successful attempt", async () => {
    const { db, topic, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 85,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.masteryUpdate.topicId).toBe(topic.id);
    expect(result.masteryUpdate.before).toBe(0.5);
    expect(result.masteryUpdate.after).toBeGreaterThan(0.5);
    expect(result.newEaseFactor).toBeGreaterThanOrEqual(2.5);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.misconceptionEvents).toHaveLength(0);
    expect(result.confidenceEvent).toBeNull();
    expect(result.retentionEvent).toBeNull();
    expect(result.memoryCandidatesUpdated).toBe(0);

    // Verify DB was updated
    const [updated] = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.topicId, topic.id));

    expect(Number(updated.masteryLevel)).toBeGreaterThan(0.5);
    expect(updated.reviewCount).toBe(3);
    expect(updated.streak).toBe(3);
  });

  it("resets streak on failed attempt", async () => {
    const { db, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 30,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.masteryUpdate.after).toBeLessThan(0.5);

    const [updated] = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.topicId, result.masteryUpdate.topicId));

    expect(updated.streak).toBe(0);
    expect(updated.intervalDays).toBe(1);
  });

  it("creates misconception events", async () => {
    const { db, topic, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 50,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [
        {
          topicId: topic.id as TopicId,
          ruleId: null,
          description: "Confused mitosis with meiosis",
          severity: 2,
        },
      ],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.misconceptionEvents).toHaveLength(1);
    expect(result.memoryCandidatesUpdated).toBe(1);

    const events = await db
      .select()
      .from(misconceptionEvents)
      .where(eq(misconceptionEvents.topicId, topic.id));

    expect(events).toHaveLength(1);
    expect(events[0].description).toBe("Confused mitosis with meiosis");
  });

  it("creates confidence event when both before and after provided", async () => {
    const { db, topic, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 70,
      confidenceBefore: 0.8,
      confidenceAfter: 0.6,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.confidenceEvent).not.toBeNull();

    const events = await db
      .select()
      .from(confidenceEvents)
      .where(eq(confidenceEvents.topicId, topic.id));

    expect(events).toHaveLength(1);
    expect(Number(events[0].selfRated)).toBeCloseTo(0.8, 2);
    expect(Number(events[0].actual)).toBeCloseTo(0.7, 2);
    expect(Number(events[0].delta)).toBeCloseTo(0.1, 2);
  });

  it("updates learner_topic_state.confidence with confidenceAfter", async () => {
    const { db, topic, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 70,
      confidenceBefore: 0.8,
      confidenceAfter: 0.65,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    await processAttemptOutcome(attempt, db);

    const [state] = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.topicId, topic.id));

    expect(Number(state.confidence)).toBeCloseTo(0.65, 2);
  });

  it("creates retention event when lastReviewedAt exists", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    const topic = qual.topics[1];

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: topic.id,
      masteryLevel: "0.500",
      easeFactor: "2.50",
      intervalDays: 6,
      reviewCount: 2,
      streak: 1,
      lastReviewedAt: threeDaysAgo,
    });

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 3,
      })
      .returning();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 75,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.retentionEvent).not.toBeNull();

    const events = await db
      .select()
      .from(retentionEvents)
      .where(eq(retentionEvents.topicId, topic.id));

    expect(events).toHaveLength(1);
    expect(events[0].intervalDays).toBeGreaterThanOrEqual(2);
    expect(events[0].outcome).toBe("remembered");
  });

  it("returns early with no changes for null score", async () => {
    const { db, topic, block } = await setupTestData();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: null,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 5,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);

    expect(result.masteryUpdate.before).toBe(0.5);
    expect(result.masteryUpdate.after).toBe(0.5);
    expect(result.newEaseFactor).toBe(2.5);
    expect(result.misconceptionEvents).toHaveLength(0);
    expect(result.confidenceEvent).toBeNull();
    expect(result.retentionEvent).toBeNull();
    expect(result.memoryCandidatesUpdated).toBe(0);

    // Verify DB was NOT updated
    const [state] = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.topicId, topic.id));

    expect(Number(state.masteryLevel)).toBe(0.5);
    expect(state.reviewCount).toBe(2);
    expect(state.streak).toBe(2);
  });

  it("returns fallback nextReviewAt of tomorrow when null score and no existing review date", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    const topic = qual.topics[1];

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: topic.id,
    });

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 5,
      })
      .returning();

    const result = await processAttemptOutcome(
      {
        blockId: block.id as BlockId,
        score: null,
        confidenceBefore: null,
        confidenceAfter: null,
        helpRequested: false,
        helpTiming: null,
        misconceptions: [],
        retentionOutcome: null,
        durationMinutes: 0,
        rawInteraction: null,
      },
      db
    );

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(result.nextReviewAt.getTime()).toBeCloseTo(tomorrow.getTime(), -4);
  });

  it("throws when block not found", async () => {
    const db = getTestDb();
    const attempt: AttemptOutcome = {
      blockId: "00000000-0000-0000-0000-000000000000" as BlockId,
      score: 80,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    await expect(processAttemptOutcome(attempt, db)).rejects.toThrow(
      "Study block not found"
    );
  });

  it("throws when topic state not found", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    // Create block but NOT topic state
    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 5,
      })
      .returning();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 80,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    await expect(processAttemptOutcome(attempt, db)).rejects.toThrow(
      "No topic state found"
    );
  });

  it("increments existing memory candidate evidence count", async () => {
    const { db, topic, block } = await setupTestData();
    const learnerId = (
      await db
        .select()
        .from(studyBlocks)
        .where(eq(studyBlocks.id, block.id))
        .limit(1)
    )[0].learnerId;

    // Seed an existing memory candidate
    await db.insert(memoryCandidates).values({
      learnerId,
      category: "misconception_pattern",
      content: "Confused mitosis with meiosis",
      evidenceCount: 2,
    });

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 50,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [
        {
          topicId: topic.id as TopicId,
          ruleId: null,
          description: "Confused mitosis with meiosis",
          severity: 2,
        },
      ],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(attempt, db);
    expect(result.memoryCandidatesUpdated).toBe(1);

    const [candidate] = await db
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.learnerId, learnerId),
          eq(memoryCandidates.content, "Confused mitosis with meiosis")
        )
      );

    expect(candidate.evidenceCount).toBe(3);
  });

  it("auto-promotes memory candidate at threshold", async () => {
    const { db, topic, block } = await setupTestData();
    const learnerId = (
      await db
        .select()
        .from(studyBlocks)
        .where(eq(studyBlocks.id, block.id))
        .limit(1)
    )[0].learnerId;

    // Seed at threshold - 1
    await db.insert(memoryCandidates).values({
      learnerId,
      category: "misconception_pattern",
      content: "Confused mitosis with meiosis",
      evidenceCount: 4,
    });

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 50,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [
        {
          topicId: topic.id as TopicId,
          ruleId: null,
          description: "Confused mitosis with meiosis",
          severity: 2,
        },
      ],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    await processAttemptOutcome(attempt, db);

    const [candidate] = await db
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.learnerId, learnerId),
          eq(memoryCandidates.content, "Confused mitosis with meiosis")
        )
      );

    expect(candidate.evidenceCount).toBe(5);
    expect(candidate.promotedAt).not.toBeNull();

    const confirmed = await db
      .select()
      .from(memoryConfirmed)
      .where(
        and(
          eq(memoryConfirmed.learnerId, learnerId),
          eq(memoryConfirmed.content, "Confused mitosis with meiosis")
        )
      );

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].confirmedBy).toBe("auto_promotion");
  });

  it("does not re-promote already promoted candidate", async () => {
    const { db, topic, block } = await setupTestData();
    const learnerId = (
      await db
        .select()
        .from(studyBlocks)
        .where(eq(studyBlocks.id, block.id))
        .limit(1)
    )[0].learnerId;

    await db.insert(memoryCandidates).values({
      learnerId,
      category: "misconception_pattern",
      content: "Confused mitosis with meiosis",
      evidenceCount: 6,
      promotedAt: new Date(),
    });

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 50,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [
        {
          topicId: topic.id as TopicId,
          ruleId: null,
          description: "Confused mitosis with meiosis",
          severity: 2,
        },
      ],
      retentionOutcome: null,
      durationMinutes: 10,
      rawInteraction: null,
    };

    await processAttemptOutcome(attempt, db);

    const confirmed = await db
      .select()
      .from(memoryConfirmed)
      .where(eq(memoryConfirmed.learnerId, learnerId));

    expect(confirmed).toHaveLength(0);
  });

  it("uses provided retentionOutcome instead of computing it", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    const topic = qual.topics[1];

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: topic.id,
      masteryLevel: "0.500",
      easeFactor: "2.50",
      intervalDays: 6,
      reviewCount: 2,
      streak: 1,
      lastReviewedAt: twoDaysAgo,
    });

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 3,
      })
      .returning();

    const attempt: AttemptOutcome = {
      blockId: block.id as BlockId,
      score: 70,
      confidenceBefore: null,
      confidenceAfter: null,
      helpRequested: false,
      helpTiming: null,
      misconceptions: [],
      retentionOutcome: "partial",
      durationMinutes: 10,
      rawInteraction: null,
    };

    await processAttemptOutcome(attempt, db);

    const events = await db
      .select()
      .from(retentionEvents)
      .where(eq(retentionEvents.topicId, topic.id));

    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("partial");
  });
});

describe("initTopicStates", () => {
  it("creates topic states for all topics in a qualification", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const result = await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    expect(result.topicsCreated).toBe(qual.topics.length);

    const states = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id));

    expect(states).toHaveLength(qual.topics.length);
    for (const state of states) {
      expect(Number(state.masteryLevel)).toBe(0);
      expect(Number(state.easeFactor)).toBe(2.5);
      expect(state.intervalDays).toBe(0);
      expect(state.streak).toBe(0);
    }
  });

  it("is idempotent - running twice does not create duplicates", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const first = await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );
    const second = await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    expect(first.topicsCreated).toBe(qual.topics.length);
    expect(second.topicsCreated).toBe(0);

    const states = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id));

    expect(states).toHaveLength(qual.topics.length);
  });

  it("returns 0 when qualification has no topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const result = await initTopicStates(
      learner.id as LearnerId,
      "00000000-0000-0000-0000-000000000000" as QualificationVersionId,
      db
    );

    expect(result.topicsCreated).toBe(0);
  });
});

describe("processDiagnosticResult", () => {
  it("updates mastery and confidence for multiple topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    const results = [
      { topicId: qual.topics[1].id as TopicId, score: 0.8, confidence: 0.7 },
      { topicId: qual.topics[2].id as TopicId, score: 0.3, confidence: 0.5 },
    ];

    const outcome = await processDiagnosticResult(
      learner.id as LearnerId,
      results,
      db
    );

    expect(outcome.topicsUpdated).toBe(2);

    const [state1] = await db
      .select()
      .from(learnerTopicState)
      .where(
        and(
          eq(learnerTopicState.learnerId, learner.id),
          eq(learnerTopicState.topicId, qual.topics[1].id)
        )
      );

    expect(Number(state1.masteryLevel)).toBeCloseTo(0.8, 2);
    expect(Number(state1.confidence)).toBeCloseTo(0.7, 2);
  });

  it("clamps values to 0-1 range", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    const results = [
      { topicId: qual.topics[1].id as TopicId, score: 1.5, confidence: -0.2 },
    ];

    await processDiagnosticResult(learner.id as LearnerId, results, db);

    const [state] = await db
      .select()
      .from(learnerTopicState)
      .where(
        and(
          eq(learnerTopicState.learnerId, learner.id),
          eq(learnerTopicState.topicId, qual.topics[1].id)
        )
      );

    expect(Number(state.masteryLevel)).toBe(1);
    expect(Number(state.confidence)).toBe(0);
  });

  it("returns 0 when no matching topic states exist", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const results = [
      {
        topicId: "00000000-0000-0000-0000-000000000000" as TopicId,
        score: 0.5,
        confidence: 0.5,
      },
    ];

    const outcome = await processDiagnosticResult(
      learner.id as LearnerId,
      results,
      db
    );

    expect(outcome.topicsUpdated).toBe(0);
  });
});
