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
  studyPlans,
  reviewQueue,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  LearnerId,
  TopicId,
  QualificationVersionId,
  SchedulerConfig,
} from "@/lib/types";
import { initTopicStates } from "./mastery";
import {
  calculateTopicPriority,
  selectBlockTypeSync,
  estimateBlockDuration,
  getNextBlocks,
  getReviewQueue,
  buildWeeklyPlan,
} from "./scheduler";

beforeEach(() => {
  resetFixtureCounter();
});

describe("calculateTopicPriority", () => {
  it("gives low priority (high number) to high mastery topics", () => {
    const result = calculateTopicPriority(0.9, 0, null);
    expect(result).toBeGreaterThanOrEqual(7);
  });

  it("gives high priority (low number) to low mastery topics", () => {
    const result = calculateTopicPriority(0.1, 0, null);
    expect(result).toBeLessThanOrEqual(3);
  });

  it("increases priority for overdue topics", () => {
    const normal = calculateTopicPriority(0.5, 0, null);
    const overdue = calculateTopicPriority(0.5, 7, null);
    expect(overdue).toBeLessThan(normal);
  });

  it("caps overdue urgency at decayUrgencyDays", () => {
    const config: SchedulerConfig = {
      maxBlocksPerSession: 5,
      defaultSessionMinutes: 30,
      examPressureWeightMultiplier: 2.0,
      decayUrgencyDays: 14,
    };
    const at14 = calculateTopicPriority(0.5, 14, null, config);
    const at28 = calculateTopicPriority(0.5, 28, null, config);
    expect(at14).toBe(at28);
  });

  it("increases priority when exam is approaching", () => {
    const noExam = calculateTopicPriority(0.5, 0, null);
    const examSoon = calculateTopicPriority(0.5, 0, 7);
    expect(examSoon).toBeLessThan(noExam);
  });

  it("does not increase priority when exam is far away", () => {
    const noExam = calculateTopicPriority(0.5, 0, null);
    const examFar = calculateTopicPriority(0.5, 0, 120);
    expect(examFar).toBe(noExam);
  });

  it("clamps result to 1-10 range", () => {
    const veryHigh = calculateTopicPriority(0.0, 30, 1);
    expect(veryHigh).toBeGreaterThanOrEqual(1);

    const veryLow = calculateTopicPriority(1.0, 0, null);
    expect(veryLow).toBeLessThanOrEqual(10);
  });

  it("combines mastery and overdue for highest priority", () => {
    const result = calculateTopicPriority(0.0, 14, 3);
    expect(result).toBe(1);
  });
});

describe("selectBlockTypeSync (heuristic)", () => {
  it("returns reentry for very overdue topics (>14 days)", () => {
    expect(selectBlockTypeSync(0.5, 0, 15)).toBe("reentry");
    expect(selectBlockTypeSync(0.5, 0, 30)).toBe("reentry");
  });

  it("returns explanation for very low mastery (<0.2)", () => {
    expect(selectBlockTypeSync(0.1, 0, 0)).toBe("explanation");
    expect(selectBlockTypeSync(0.0, 0, 0)).toBe("explanation");
  });

  it("returns worked_example for low mastery (0.2-0.4)", () => {
    expect(selectBlockTypeSync(0.2, 0, 0)).toBe("worked_example");
    expect(selectBlockTypeSync(0.3, 0, 0)).toBe("worked_example");
  });

  it("returns retrieval_drill for medium mastery (0.4-0.7)", () => {
    expect(selectBlockTypeSync(0.5, 0, 0)).toBe("retrieval_drill");
    expect(selectBlockTypeSync(0.6, 0, 0)).toBe("retrieval_drill");
  });

  it("returns timed_problems for high mastery with streak", () => {
    expect(selectBlockTypeSync(0.8, 3, 0)).toBe("timed_problems");
    expect(selectBlockTypeSync(0.7, 5, 0)).toBe("timed_problems");
  });

  it("returns retrieval_drill for high mastery without streak", () => {
    expect(selectBlockTypeSync(0.8, 2, 0)).toBe("retrieval_drill");
    expect(selectBlockTypeSync(0.9, 0, 0)).toBe("retrieval_drill");
  });

  it("prioritizes reentry over other rules", () => {
    expect(selectBlockTypeSync(0.0, 0, 20)).toBe("reentry");
    expect(selectBlockTypeSync(0.9, 5, 20)).toBe("reentry");
  });
});

describe("estimateBlockDuration", () => {
  it("returns expected duration for each block type", () => {
    expect(estimateBlockDuration("retrieval_drill")).toBe(10);
    expect(estimateBlockDuration("explanation")).toBe(15);
    expect(estimateBlockDuration("worked_example")).toBe(15);
    expect(estimateBlockDuration("timed_problems")).toBe(20);
    expect(estimateBlockDuration("essay_planning")).toBe(20);
    expect(estimateBlockDuration("source_analysis")).toBe(15);
    expect(estimateBlockDuration("mistake_review")).toBe(10);
    expect(estimateBlockDuration("reentry")).toBe(10);
  });
});

describe("getNextBlocks", () => {
  async function setupSchedulerData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    return { db, learner, qual };
  }

  it("returns prioritized study blocks", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.length).toBeLessThanOrEqual(5);

    for (const block of blocks) {
      expect(block.id).toBeDefined();
      expect(block.learnerId).toBe(learner.id);
      expect(block.topicName).toBeDefined();
      expect(block.blockType).toBeDefined();
      expect(block.durationMinutes).toBeGreaterThan(0);
      expect(block.priority).toBeGreaterThanOrEqual(1);
      expect(block.priority).toBeLessThanOrEqual(10);
      expect(block.reason).toBeDefined();
    }
  });

  it("persists blocks in the database", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db);

    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.learnerId, learner.id));

    expect(dbBlocks.length).toBe(blocks.length);
  });

  it("returns empty array when no qualifications enrolled", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const blocks = await getNextBlocks(learner.id as LearnerId, db);
    expect(blocks).toHaveLength(0);
  });

  it("filters by qualificationVersionIds", async () => {
    const { db, learner, qual } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      qualificationVersionIds: [qual.qualificationVersionId],
    });

    expect(blocks.length).toBeGreaterThan(0);
  });

  it("returns empty when filtering to non-enrolled qualification", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      qualificationVersionIds: [
        "00000000-0000-0000-0000-000000000000" as QualificationVersionId,
      ],
    });

    expect(blocks).toHaveLength(0);
  });

  it("respects maxBlocks option", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      maxBlocks: 2,
    });

    expect(blocks.length).toBeLessThanOrEqual(2);
  });

  it("respects sessionMinutes option", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      sessionMinutes: 10,
    });

    const totalMinutes = blocks.reduce(
      (sum, b) => sum + b.durationMinutes,
      0
    );
    expect(totalMinutes).toBeLessThanOrEqual(10);
  });

  it("filters by focusTopicIds", async () => {
    const { db, learner, qual } = await setupSchedulerData();
    const focusTopic = qual.topics[1];

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      focusTopicIds: [focusTopic.id as TopicId],
    });

    for (const block of blocks) {
      expect(block.topicId).toBe(focusTopic.id);
    }
  });

  it("excludes specified block types", async () => {
    const { db, learner } = await setupSchedulerData();

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      excludeBlockTypes: ["explanation", "worked_example"],
    });

    for (const block of blocks) {
      expect(block.blockType).not.toBe("explanation");
      expect(block.blockType).not.toBe("worked_example");
    }
  });

  it("prioritizes overdue topics higher", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create states: one overdue, one not
    await db.insert(learnerTopicState).values([
      {
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        masteryLevel: "0.500",
        nextReviewAt: sevenDaysAgo,
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[2].id,
        masteryLevel: "0.500",
        nextReviewAt: tomorrow,
      },
    ]);

    const blocks = await getNextBlocks(learner.id as LearnerId, db, {
      maxBlocks: 2,
    });

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0].topicId).toBe(qual.topics[1].id);
  });

  it("prioritizes topics with exam approaching", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    // Enroll with exam in 5 days
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId, {
      examDate: fiveDaysFromNow.toISOString().split("T")[0],
    });

    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    const blocks = await getNextBlocks(learner.id as LearnerId, db);

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.reason).toBe("Exam approaching");
    }
  });
});

describe("getReviewQueue", () => {
  it("returns pending review items sorted by priority", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date();
    await db.insert(reviewQueue).values([
      {
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        reason: "scheduled",
        priority: 3,
        dueAt: now,
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[2].id,
        reason: "decay",
        priority: 1,
        dueAt: now,
      },
    ]);

    const queue = await getReviewQueue(learner.id as LearnerId, db);

    expect(queue).toHaveLength(2);
    expect(queue[0].priority).toBe(1);
    expect(queue[0].reason).toBe("decay");
    expect(queue[1].priority).toBe(3);
    expect(queue[1].reason).toBe("scheduled");
  });

  it("excludes fulfilled reviews", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date();
    await db.insert(reviewQueue).values([
      {
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        reason: "scheduled",
        priority: 3,
        dueAt: now,
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[2].id,
        reason: "decay",
        priority: 1,
        dueAt: now,
        fulfilledAt: now,
      },
    ]);

    const queue = await getReviewQueue(learner.id as LearnerId, db);

    expect(queue).toHaveLength(1);
    expect(queue[0].topicId).toBe(qual.topics[1].id);
  });

  it("returns empty array when no reviews pending", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const queue = await getReviewQueue(learner.id as LearnerId, db);
    expect(queue).toHaveLength(0);
  });
});

describe("buildWeeklyPlan", () => {
  async function setupPlanData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await initTopicStates(
      learner.id as LearnerId,
      qual.qualificationVersionId,
      db
    );

    return { db, learner, qual };
  }

  it("creates a weekly plan with blocks", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db
    );

    expect(result.planId).toBeDefined();
    expect(result.blocks.length).toBeGreaterThan(0);

    // Verify plan in DB
    const [plan] = await db
      .select()
      .from(studyPlans)
      .where(eq(studyPlans.id, result.planId));

    expect(plan.planType).toBe("weekly");
    expect(plan.status).toBe("active");
    expect(plan.learnerId).toBe(learner.id);
  });

  it("distributes blocks across the week", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db,
      { dailyMinutes: 60 }
    );

    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.planId, result.planId));

    const dates = new Set(dbBlocks.map((b) => b.scheduledDate));
    expect(dates.size).toBeGreaterThanOrEqual(1);
  });

  it("respects dailyMinutes option", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db,
      { dailyMinutes: 10 }
    );

    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.planId, result.planId));

    // Each day should have at most 10 minutes of blocks
    const dayTotals = new Map<string | null, number>();
    for (const block of dbBlocks) {
      const current = dayTotals.get(block.scheduledDate) ?? 0;
      dayTotals.set(block.scheduledDate, current + block.durationMinutes);
    }

    for (const [, minutes] of dayTotals) {
      expect(minutes).toBeLessThanOrEqual(10);
    }
  });

  it("returns empty blocks when no qualifications enrolled", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db
    );

    expect(result.planId).toBeDefined();
    expect(result.blocks).toHaveLength(0);
  });

  it("includes plan ID on all created blocks", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db
    );

    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.planId, result.planId));

    for (const block of dbBlocks) {
      expect(block.planId).toBe(result.planId);
    }
  });

  it("schedules topics on multiple days", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db,
      { dailyMinutes: 60 }
    );

    // With per-day dedup, the same topic should appear on more than one day
    const topicDays = new Map<string, Set<string>>();
    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.planId, result.planId));

    for (const block of dbBlocks) {
      const days = topicDays.get(block.topicId) ?? new Set();
      days.add(block.scheduledDate!);
      topicDays.set(block.topicId, days);
    }

    const repeatedTopics = [...topicDays.values()].filter((d) => d.size > 1);
    expect(repeatedTopics.length).toBeGreaterThan(0);
  });

  it("skips large blocks and still schedules smaller ones that fit", async () => {
    const { db, learner } = await setupPlanData();
    const weekStart = new Date("2026-03-16");

    // Set one topic to high mastery + streak so it becomes timed_problems (20 min)
    // and another to medium mastery so it becomes retrieval_drill (10 min)
    const states = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id));

    if (states.length >= 2) {
      // First topic: timed_problems (mastery >= 0.7, streak >= 3) → 20 min
      await db
        .update(learnerTopicState)
        .set({
          masteryLevel: "0.80",
          streak: 4,
          easeFactor: "2.50",
          intervalDays: 10,
        })
        .where(eq(learnerTopicState.id, states[0].id));

      // Second topic: retrieval_drill (mastery 0.4-0.7) → 10 min
      await db
        .update(learnerTopicState)
        .set({
          masteryLevel: "0.50",
          streak: 1,
          easeFactor: "2.50",
          intervalDays: 5,
        })
        .where(eq(learnerTopicState.id, states[1].id));
    }

    // dailyMinutes = 15: too small for timed_problems (20), but fits retrieval_drill (10)
    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db,
      { dailyMinutes: 15 }
    );

    // Should still have blocks (the 10-min retrieval_drill should be scheduled)
    expect(result.blocks.length).toBeGreaterThan(0);

    // No block should exceed the daily limit
    const dbBlocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.planId, result.planId));

    const dayTotals = new Map<string | null, number>();
    for (const block of dbBlocks) {
      const current = dayTotals.get(block.scheduledDate) ?? 0;
      dayTotals.set(block.scheduledDate, current + block.durationMinutes);
    }

    for (const [, minutes] of dayTotals) {
      expect(minutes).toBeLessThanOrEqual(15);
    }
  });

  it("applies exam date overrides from options", async () => {
    const { db, learner, qual } = await setupPlanData();
    const weekStart = new Date("2026-03-16");
    const examDate = new Date("2026-03-25");

    const result = await buildWeeklyPlan(
      learner.id as LearnerId,
      weekStart,
      db,
      {
        examDates: [
          {
            qualificationVersionId: qual.qualificationVersionId,
            date: examDate,
          },
        ],
      }
    );

    expect(result.blocks.length).toBeGreaterThan(0);
  });
});
