import { describe, it, expect, vi, beforeEach } from "vitest";
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
  taskRules,
  topics,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type {
  LearnerId,
  TopicId,
  QualificationVersionId,
  BlockId,
  BlockType,
} from "@/lib/types";
import { initTopicStates, processAttemptOutcome } from "./mastery";
import {
  getNextBlocks,
  selectBlockType,
  selectBlockTypeSync,
} from "./scheduler";
import type { Database } from "@/lib/db";

beforeEach(() => {
  resetFixtureCounter();
});

describe("Task 4.2 integration: idempotency guard", () => {
  it("returns existing pending blocks on repeated calls", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db as unknown as Database
    );

    // Set some topics as needing review
    const topicRows = await db
      .select({ id: learnerTopicState.id, topicId: learnerTopicState.topicId })
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id))
      .limit(3);

    for (const row of topicRows) {
      await db
        .update(learnerTopicState)
        .set({
          masteryLevel: "0.300",
          nextReviewAt: new Date(Date.now() - 86400000),
        })
        .where(eq(learnerTopicState.id, row.id));
    }

    // First call creates blocks
    const blocks1 = await getNextBlocks(
      learner.id as LearnerId,
      db as unknown as Database,
      { sessionMinutes: 60 }
    );
    expect(blocks1.length).toBeGreaterThan(0);

    // Second call returns the same pending blocks (idempotency)
    const blocks2 = await getNextBlocks(
      learner.id as LearnerId,
      db as unknown as Database,
      { sessionMinutes: 60 }
    );
    expect(blocks2.length).toBe(blocks1.length);
    expect(blocks2.map((b) => b.id).sort()).toEqual(
      blocks1.map((b) => b.id).sort()
    );
  });

  it("creates new blocks when no pending exist", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db as unknown as Database
    );

    const topicRows = await db
      .select({ id: learnerTopicState.id })
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id))
      .limit(2);

    for (const row of topicRows) {
      await db
        .update(learnerTopicState)
        .set({
          masteryLevel: "0.300",
          nextReviewAt: new Date(Date.now() - 86400000),
        })
        .where(eq(learnerTopicState.id, row.id));
    }

    const blocks = await getNextBlocks(
      learner.id as LearnerId,
      db as unknown as Database,
      { sessionMinutes: 60 }
    );
    expect(blocks.length).toBeGreaterThan(0);

    // Verify all blocks are in DB with pending status
    for (const block of blocks) {
      const [dbBlock] = await db
        .select({ status: studyBlocks.status })
        .from(studyBlocks)
        .where(eq(studyBlocks.id, block.id))
        .limit(1);
      expect(dbBlock.status).toBe("pending");
    }
  });
});

describe("Task 4.2 integration: selectBlockType with task_rules", () => {
  it("uses task_rules when available", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id as TopicId; // Topic 1.1

    // Insert a task_rule for this topic
    await db.insert(taskRules).values({
      topicId: topicId as string,
      blockType: "essay_planning",
      difficultyMin: 1,
      difficultyMax: 3,
      timeEstimateMinutes: 20,
    });

    // Low mastery → difficulty ~1 → should match our rule
    const result = await selectBlockType(
      topicId,
      0.1, // low mastery → difficulty 1
      0,
      0,
      db as unknown as Database
    );
    expect(result).toBe("essay_planning");
  });

  it("falls back to heuristic when no task_rules match", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id as TopicId;

    // Insert a task_rule that only matches high difficulty
    await db.insert(taskRules).values({
      topicId: topicId as string,
      blockType: "timed_problems",
      difficultyMin: 4,
      difficultyMax: 5,
      timeEstimateMinutes: 20,
    });

    // Low mastery → difficulty 1 → rule won't match
    const result = await selectBlockType(
      topicId,
      0.1,
      0,
      0,
      db as unknown as Database
    );
    // Heuristic: mastery < 0.2 → explanation
    expect(result).toBe("explanation");
  });

  it("falls back to heuristic when no task_rules exist", async () => {
    const db = getTestDb();
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id as TopicId;

    const result = await selectBlockType(
      topicId,
      0.5,
      0,
      0,
      db as unknown as Database
    );
    // Heuristic: mastery 0.4-0.7 → retrieval_drill
    expect(result).toBe("retrieval_drill");
  });
});

describe("Task 4.2 integration: endSession → mastery wire", () => {
  it("updates mastery after completed session with score", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db as unknown as Database
    );

    const topicId = qual.topics[1].id;

    // Create a study block
    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 5,
      })
      .returning();

    // Process the outcome directly
    const outcome = {
      blockId: block.id as BlockId,
      score: 85,
      confidenceBefore: 0.6 as number | null,
      confidenceAfter: 0.8 as number | null,
      helpRequested: false,
      helpTiming: null as "before_attempt" | "after_attempt" | null,
      misconceptions: [],
      retentionOutcome: "remembered" as const,
      durationMinutes: 10,
      rawInteraction: null,
    };

    const result = await processAttemptOutcome(
      outcome,
      db as unknown as Database
    );

    // Verify mastery was updated
    expect(result.masteryUpdate.after).toBeGreaterThan(
      result.masteryUpdate.before
    );
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.newEaseFactor).toBeGreaterThan(0);
  });
});

describe("Task 4.2: test seed uses loadQualification", () => {
  it("seedGCSEBiology loads qualification via curriculum engine", async () => {
    const { seedGCSEBiology } = await import("@/test/seed");
    const result = await seedGCSEBiology();

    expect(result.qualificationVersionId).toBeTruthy();
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topicMap.size).toBeGreaterThan(0);

    // Verify topics were actually created in DB
    const db = getTestDb();
    const topicCount = await db
      .select({ id: topics.id })
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );
    expect(topicCount.length).toBeGreaterThan(20);
  });
});
