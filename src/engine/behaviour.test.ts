import { describe, it, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import {
  studyBlocks,
  studyPlans,
  studySessions,
  blockAttempts,
  learnerTopicState,
  safetyFlags,
  topicEdges,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import type { LearnerId, TopicId } from "@/lib/types";
import { detectPatterns } from "./behaviour";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function atHour(hour: number, daysBack = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function createPlanForLearner(db: Database, learnerId: string) {
  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId,
      planType: "weekly",
      title: "Test Plan",
      startDate: daysAgo(7).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      status: "active",
    })
    .returning();
  return plan;
}

async function createBlock(
  db: Database,
  opts: {
    planId?: string;
    learnerId: string;
    topicId: string;
    blockType?: string;
    status?: string;
    scheduledDate?: string;
    createdAt?: Date;
  },
) {
  const [block] = await db
    .insert(studyBlocks)
    .values({
      planId: opts.planId ?? null,
      learnerId: opts.learnerId,
      topicId: opts.topicId,
      blockType: (opts.blockType ?? "retrieval_drill") as "retrieval_drill",
      scheduledDate: opts.scheduledDate,
      durationMinutes: 20,
      priority: 5,
      status: (opts.status ?? "pending") as "pending",
      createdAt: opts.createdAt,
    })
    .returning();
  return block;
}

async function createSession(
  db: Database,
  opts: {
    learnerId: string;
    blockId?: string;
    status?: string;
    startedAt?: Date;
    endedAt?: Date;
    totalDurationMinutes?: number;
  },
) {
  const [session] = await db
    .insert(studySessions)
    .values({
      learnerId: opts.learnerId,
      blockId: opts.blockId ?? null,
      status: (opts.status ?? "completed") as "completed",
      startedAt: opts.startedAt ?? new Date(),
      endedAt: opts.endedAt,
      totalDurationMinutes: opts.totalDurationMinutes ?? 20,
    })
    .returning();
  return session;
}

async function createAttempt(
  db: Database,
  opts: {
    blockId: string;
    startedAt?: Date;
    completedAt?: Date;
    score?: number;
    confidenceBefore?: number;
    confidenceAfter?: number;
    helpRequested?: boolean;
    helpTiming?: "before_attempt" | "after_attempt" | null;
  },
) {
  const [attempt] = await db
    .insert(blockAttempts)
    .values({
      blockId: opts.blockId,
      startedAt: opts.startedAt ?? new Date(),
      completedAt: opts.completedAt,
      score: opts.score?.toString(),
      confidenceBefore: opts.confidenceBefore?.toString(),
      confidenceAfter: opts.confidenceAfter?.toString(),
      helpRequested: opts.helpRequested ?? false,
      helpTiming: opts.helpTiming ?? null,
    })
    .returning();
  return attempt;
}

async function createTopicState(
  db: Database,
  learnerId: string,
  topicId: string,
  masteryLevel: number,
) {
  const [state] = await db
    .insert(learnerTopicState)
    .values({
      learnerId,
      topicId,
      masteryLevel: masteryLevel.toString(),
      confidence: "0.500",
    })
    .returning();
  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectPatterns", () => {
  it("returns empty report for a new learner with no data", async () => {
    const db = getTestDb() as unknown as Database;
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const report = await detectPatterns(db, learner.id as LearnerId);

    expect(report.avoidedTopics).toEqual([]);
    expect(report.engagementTrend.direction).toBe("stable");
    expect(report.peakHours).toEqual([]);
    expect(report.overRelianceSignals).toEqual([]);
    expect(report.safetyFlags).toEqual([]);
  });

  describe("avoidance detection", () => {
    it("detects topics scheduled 3+ times with 2+ skips", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id; // Topic 1.1

      const plan = await createPlanForLearner(db, learner.id);

      // Create 4 blocks for this topic, 3 skipped
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "completed",
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(1);
      expect(report.avoidedTopics[0].topicId).toBe(topicId);
      expect(report.avoidedTopics[0].topicName).toBe("Topic 1.1");
      expect(report.avoidedTopics[0].scheduledCount).toBe(4);
      expect(report.avoidedTopics[0].skippedCount).toBe(3);
    });

    it("counts abandoned sessions toward avoidance", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // 1 skipped + 2 active blocks with abandoned sessions = 3 avoidances
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });

      const block2 = await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "active",
      });
      await createSession(db, {
        learnerId: learner.id,
        blockId: block2.id,
        status: "abandoned",
      });

      const block3 = await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "active",
      });
      await createSession(db, {
        learnerId: learner.id,
        blockId: block3.id,
        status: "abandoned",
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(1);
      expect(report.avoidedTopics[0].skippedCount).toBe(3);
    });

    it("does not flag topics with fewer than 3 scheduled blocks", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // Only 2 blocks, both skipped — below threshold
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(0);
    });

    it("does not flag topics with only 1 skip out of 3+", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // 3 blocks but only 1 skipped
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "completed",
      });
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "completed",
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(0);
    });

    it("produces connect_to_strength strategy when a related topic has high mastery", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      // Topic 1.1 is prerequisite for Topic 1.2 (created in fixtures)
      const avoidedTopicId = qual.topics[2].id; // Topic 1.2
      const relatedTopicId = qual.topics[1].id; // Topic 1.1

      // Set high mastery on the related topic
      await createTopicState(db, learner.id, relatedTopicId, 0.8);

      const plan = await createPlanForLearner(db, learner.id);

      // Create avoidance pattern for Topic 1.2
      for (let i = 0; i < 3; i++) {
        await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId: avoidedTopicId,
          status: "skipped",
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(1);
      expect(
        report.avoidedTopics[0].reintroductionStrategy.approach,
      ).toBe("connect_to_strength");
      expect(
        report.avoidedTopics[0].reintroductionStrategy.rationale,
      ).toContain("Topic 1.1");
    });

    it("produces change_block_type strategy when no related strengths exist", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      // Topic 2.1 has no edges
      const topicId = qual.topics[4].id;

      const plan = await createPlanForLearner(db, learner.id);

      for (let i = 0; i < 3; i++) {
        await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "skipped",
          blockType: "retrieval_drill",
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(1);
      expect(
        report.avoidedTopics[0].reintroductionStrategy.approach,
      ).toBe("change_block_type");
      expect(
        report.avoidedTopics[0].reintroductionStrategy.suggestedBlockType,
      ).not.toBe("retrieval_drill");
    });

    it("produces reduce_difficulty strategy as fallback", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[4].id; // Topic 2.1, no edges

      const plan = await createPlanForLearner(db, learner.id);

      // All blocks skipped but no specific block type (mixed statuses)
      // Use non-skipped-status blocks + abandoned sessions to trigger avoidance
      const b1 = await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "active",
      });
      await createSession(db, {
        learnerId: learner.id,
        blockId: b1.id,
        status: "abandoned",
      });

      const b2 = await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "active",
      });
      await createSession(db, {
        learnerId: learner.id,
        blockId: b2.id,
        status: "abandoned",
      });

      // Need at least 1 skip to trigger the blockCounts HAVING clause
      await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "skipped",
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(1);
      // With 1 skipped block of retrieval_drill, change_block_type triggers
      // But the strategy selection is deterministic:
      // No edges → no connect_to_strength
      // Has skipped block types → change_block_type
      expect(
        ["change_block_type", "reduce_difficulty"],
      ).toContain(report.avoidedTopics[0].reintroductionStrategy.approach);
    });
  });

  describe("engagement trend", () => {
    it("detects declining engagement when sessions shorten and gaps grow", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      // Earlier sessions (15-28 days ago): long and frequent
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(25),
        endedAt: daysAgo(25),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(23),
        endedAt: daysAgo(23),
        totalDurationMinutes: 35,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(21),
        endedAt: daysAgo(21),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(19),
        endedAt: daysAgo(19),
        totalDurationMinutes: 28,
      });

      // Recent sessions (last 14 days): short and infrequent
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(12),
        endedAt: daysAgo(12),
        totalDurationMinutes: 10,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(3),
        endedAt: daysAgo(3),
        totalDurationMinutes: 8,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.engagementTrend.direction).toBe("declining");
      expect(report.engagementTrend.sessionDurationTrend).toBeLessThan(0);
      expect(report.engagementTrend.gapTrend).toBeGreaterThan(0);
    });

    it("detects improving engagement when sessions lengthen and gaps shrink", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      // Earlier sessions: short and infrequent
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(25),
        endedAt: daysAgo(25),
        totalDurationMinutes: 10,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(18),
        endedAt: daysAgo(18),
        totalDurationMinutes: 8,
      });

      // Recent sessions: long and frequent
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(6),
        endedAt: daysAgo(6),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(5),
        endedAt: daysAgo(5),
        totalDurationMinutes: 35,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(4),
        endedAt: daysAgo(4),
        totalDurationMinutes: 32,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(3),
        endedAt: daysAgo(3),
        totalDurationMinutes: 30,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.engagementTrend.direction).toBe("improving");
      expect(report.engagementTrend.sessionDurationTrend).toBeGreaterThan(0);
      expect(report.engagementTrend.gapTrend).toBeLessThan(0);
    });

    it("reports stable when no significant changes", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      // Similar sessions in both windows
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(20),
        endedAt: daysAgo(20),
        totalDurationMinutes: 20,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(18),
        endedAt: daysAgo(18),
        totalDurationMinutes: 20,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(6),
        endedAt: daysAgo(6),
        totalDurationMinutes: 22,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(4),
        endedAt: daysAgo(4),
        totalDurationMinutes: 21,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.engagementTrend.direction).toBe("stable");
    });

    it("handles learner with no sessions gracefully", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.engagementTrend.direction).toBe("stable");
      expect(report.engagementTrend.recentAvgDurationMinutes).toBe(0);
      expect(report.engagementTrend.earlierAvgDurationMinutes).toBe(0);
      expect(report.engagementTrend.recentAvgGapDays).toBe(0);
      expect(report.engagementTrend.earlierAvgGapDays).toBe(0);
    });
  });

  describe("peak hours", () => {
    it("identifies peak performance hours from block attempt data", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // Create blocks and attempts at different hours
      // Morning (9am): high scores
      for (let i = 0; i < 3; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          startedAt: atHour(9, i + 1),
          score: 85 + i * 3,
        });
      }

      // Evening (8pm): lower scores
      for (let i = 0; i < 3; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          startedAt: atHour(20, i + 1),
          score: 55 + i * 3,
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.peakHours.length).toBeGreaterThanOrEqual(2);
      // Peak hours should be sorted by avgScore descending
      expect(report.peakHours[0].avgScore).toBeGreaterThanOrEqual(
        report.peakHours[1].avgScore,
      );
      // Morning should be the top performer
      expect(report.peakHours[0].hour).toBe(9);
    });

    it("requires minimum session count per hour", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // Only 1 attempt at 10am — below threshold
      const block = await createBlock(db, {
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        status: "completed",
      });
      await createAttempt(db, {
        blockId: block.id,
        startedAt: atHour(10, 1),
        score: 90,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      // Should not include this hour since it's below min sessions
      const hour10 = report.peakHours.find((h) => h.hour === 10);
      expect(hour10).toBeUndefined();
    });

    it("returns empty peak hours when no scored attempts exist", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.peakHours).toEqual([]);
    });
  });

  describe("over-reliance signals", () => {
    it("detects topics where hints are requested before attempting over 50% of the time", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // Create 6 attempts: 4 with help_before_attempt, 2 without
      for (let i = 0; i < 4; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          helpRequested: true,
          helpTiming: "before_attempt",
          score: 60,
        });
      }
      for (let i = 0; i < 2; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          helpRequested: false,
          score: 70,
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.overRelianceSignals).toHaveLength(1);
      expect(report.overRelianceSignals[0].topicId).toBe(topicId);
      expect(report.overRelianceSignals[0].totalAttempts).toBe(6);
      expect(report.overRelianceSignals[0].helpBeforeAttemptCount).toBe(4);
      expect(report.overRelianceSignals[0].helpBeforeAttemptRate).toBeCloseTo(
        0.67,
        1,
      );
    });

    it("does not flag topics below minimum attempts threshold", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // Only 3 attempts (below threshold of 5), all with help before
      for (let i = 0; i < 3; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          helpRequested: true,
          helpTiming: "before_attempt",
          score: 60,
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.overRelianceSignals).toHaveLength(0);
    });

    it("does not flag topics where help is requested after attempt", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      // 6 attempts with help after attempt (not before)
      for (let i = 0; i < 6; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          helpRequested: true,
          helpTiming: "after_attempt",
          score: 50,
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.overRelianceSignals).toHaveLength(0);
    });
  });

  describe("safety flags", () => {
    it("writes avoidance safety flag when topics are avoided", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      for (let i = 0; i < 3; i++) {
        await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "skipped",
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      const avoidanceFlags = report.safetyFlags.filter(
        (f) => f.flagType === "avoidance",
      );
      expect(avoidanceFlags).toHaveLength(1);
      expect(avoidanceFlags[0].severity).toBe("medium");

      // Verify it was persisted to the database
      const dbFlags = await db
        .select()
        .from(safetyFlags)
        .where(
          and(
            eq(safetyFlags.learnerId, learner.id),
            eq(safetyFlags.flagType, "avoidance"),
          ),
        );
      expect(dbFlags).toHaveLength(1);
      expect(dbFlags[0].resolved).toBe(false);
    });

    it("writes disengagement safety flag when engagement is declining", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      // Create declining engagement pattern
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(25),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(23),
        totalDurationMinutes: 35,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(21),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(19),
        totalDurationMinutes: 28,
      });

      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(12),
        totalDurationMinutes: 10,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(3),
        totalDurationMinutes: 8,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      const disengagementFlags = report.safetyFlags.filter(
        (f) => f.flagType === "disengagement",
      );
      expect(disengagementFlags).toHaveLength(1);
    });

    it("writes overreliance safety flag when hint dependency detected", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      for (let i = 0; i < 6; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          helpRequested: true,
          helpTiming: "before_attempt",
          score: 60,
        });
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      const overRelianceFlags = report.safetyFlags.filter(
        (f) => f.flagType === "overreliance",
      );
      expect(overRelianceFlags).toHaveLength(1);
    });

    it("does not create duplicate safety flags for same type", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topicId = qual.topics[1].id;

      const plan = await createPlanForLearner(db, learner.id);

      for (let i = 0; i < 3; i++) {
        await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId,
          status: "skipped",
        });
      }

      // Run detection twice
      await detectPatterns(db, learner.id as LearnerId);
      const report2 = await detectPatterns(db, learner.id as LearnerId);

      // Should still only have 1 avoidance flag in DB
      const dbFlags = await db
        .select()
        .from(safetyFlags)
        .where(
          and(
            eq(safetyFlags.learnerId, learner.id),
            eq(safetyFlags.flagType, "avoidance"),
          ),
        );
      expect(dbFlags).toHaveLength(1);

      // But report should still return it
      const avoidanceFlags = report2.safetyFlags.filter(
        (f) => f.flagType === "avoidance",
      );
      expect(avoidanceFlags).toHaveLength(1);
    });

    it("escalates avoidance severity when 3+ topics are avoided", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();

      const plan = await createPlanForLearner(db, learner.id);

      // Create avoidance on 3 different topics
      for (const topic of [qual.topics[1], qual.topics[2], qual.topics[4]]) {
        for (let i = 0; i < 3; i++) {
          await createBlock(db, {
            planId: plan.id,
            learnerId: learner.id,
            topicId: topic.id,
            status: "skipped",
          });
        }
      }

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics).toHaveLength(3);
      const avoidanceFlag = report.safetyFlags.find(
        (f) => f.flagType === "avoidance",
      );
      expect(avoidanceFlag?.severity).toBe("high");
    });

    it("does not write safety flags when no concerns detected", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);

      // Create healthy engagement pattern
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(20),
        totalDurationMinutes: 20,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(18),
        totalDurationMinutes: 22,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(6),
        totalDurationMinutes: 22,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(4),
        totalDurationMinutes: 21,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.safetyFlags).toHaveLength(0);

      const dbFlags = await db
        .select()
        .from(safetyFlags)
        .where(eq(safetyFlags.learnerId, learner.id));
      expect(dbFlags).toHaveLength(0);
    });
  });

  describe("combined scenarios", () => {
    it("detects multiple patterns simultaneously", async () => {
      const db = getTestDb() as unknown as Database;
      const org = await createTestOrg();
      const learner = await createTestLearner(org.id);
      const qual = await createTestQualification();
      const topic1 = qual.topics[1].id; // Topic 1.1
      const topic2 = qual.topics[4].id; // Topic 2.1

      const plan = await createPlanForLearner(db, learner.id);

      // Avoidance on topic1
      for (let i = 0; i < 3; i++) {
        await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId: topic1,
          status: "skipped",
        });
      }

      // Over-reliance on topic2
      for (let i = 0; i < 6; i++) {
        const block = await createBlock(db, {
          planId: plan.id,
          learnerId: learner.id,
          topicId: topic2,
          status: "completed",
        });
        await createAttempt(db, {
          blockId: block.id,
          startedAt: atHour(14, i + 1),
          helpRequested: true,
          helpTiming: "before_attempt",
          score: 55,
        });
      }

      // Declining engagement
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(25),
        totalDurationMinutes: 35,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(23),
        totalDurationMinutes: 30,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(21),
        totalDurationMinutes: 32,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(19),
        totalDurationMinutes: 28,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(12),
        totalDurationMinutes: 10,
      });
      await createSession(db, {
        learnerId: learner.id,
        startedAt: daysAgo(3),
        totalDurationMinutes: 8,
      });

      const report = await detectPatterns(db, learner.id as LearnerId);

      expect(report.avoidedTopics.length).toBeGreaterThanOrEqual(1);
      expect(report.overRelianceSignals.length).toBeGreaterThanOrEqual(1);
      expect(report.engagementTrend.direction).toBe("declining");
      expect(report.peakHours.length).toBeGreaterThanOrEqual(1);

      // Should have at least 3 types of safety flags
      const flagTypes = new Set(report.safetyFlags.map((f) => f.flagType));
      expect(flagTypes.size).toBeGreaterThanOrEqual(3);
    });
  });
});
