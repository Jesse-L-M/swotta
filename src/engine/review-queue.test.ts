import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getTestDb } from "@/test/setup";
import {
  createTestLearner,
  createTestOrg,
  createTestQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import { reviewQueue } from "@/db/schema";
import type { LearnerId, TopicId } from "@/lib/types";
import { syncScheduledReviewQueue } from "./review-queue";

const db = getTestDb();

beforeEach(() => {
  resetFixtureCounter();
});

async function createLearnerTopic() {
  const org = await createTestOrg();
  const learner = await createTestLearner(org.id);
  const qualification = await createTestQualification();

  return {
    learnerId: learner.id as LearnerId,
    topicId: qualification.topics[0].id as TopicId,
  };
}

describe("syncScheduledReviewQueue", () => {
  it("inserts a scheduled review when none exists", async () => {
    const { learnerId, topicId } = await createLearnerTopic();
    const dueAt = new Date("2026-04-10T08:00:00Z");

    const result = await syncScheduledReviewQueue(
      {
        learnerId,
        topicId,
        dueAt,
      },
      db
    );

    expect(result).toEqual({
      action: "inserted",
      dueAt,
      fulfilledCount: 0,
    });

    const rows = await db
      .select({
        reason: reviewQueue.reason,
        dueAt: reviewQueue.dueAt,
        fulfilledAt: reviewQueue.fulfilledAt,
      })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, learnerId),
          eq(reviewQueue.topicId, topicId)
        )
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("scheduled");
    expect(rows[0].dueAt).toEqual(dueAt);
    expect(rows[0].fulfilledAt).toBeNull();
  });

  it("returns already_scheduled when the current entry already matches", async () => {
    const { learnerId, topicId } = await createLearnerTopic();
    const dueAt = new Date("2026-04-10T08:00:00Z");

    await db.insert(reviewQueue).values({
      learnerId,
      topicId,
      reason: "scheduled",
      priority: 5,
      dueAt,
    });

    const result = await syncScheduledReviewQueue(
      {
        learnerId,
        topicId,
        dueAt,
      },
      db
    );

    expect(result).toEqual({
      action: "already_scheduled",
      dueAt,
      fulfilledCount: 0,
    });

    const unresolved = await db
      .select({ id: reviewQueue.id })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, learnerId),
          eq(reviewQueue.topicId, topicId),
          isNull(reviewQueue.fulfilledAt)
        )
      );

    expect(unresolved).toHaveLength(1);
  });

  it("fulfills stale unresolved entries and inserts the new scheduled review", async () => {
    const { learnerId, topicId } = await createLearnerTopic();
    const oldDueAt = new Date("2026-04-10T08:00:00Z");
    const nextDueAt = new Date("2026-04-15T08:00:00Z");

    await db.insert(reviewQueue).values([
      {
        learnerId,
        topicId,
        reason: "scheduled",
        priority: 5,
        dueAt: oldDueAt,
      },
      {
        learnerId,
        topicId,
        reason: "decay",
        priority: 2,
        dueAt: oldDueAt,
      },
    ]);

    const result = await syncScheduledReviewQueue(
      {
        learnerId,
        topicId,
        dueAt: nextDueAt,
      },
      db
    );

    expect(result.action).toBe("inserted");
    expect(result.fulfilledCount).toBe(2);

    const rows = await db
      .select({
        reason: reviewQueue.reason,
        dueAt: reviewQueue.dueAt,
        fulfilledAt: reviewQueue.fulfilledAt,
      })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, learnerId),
          eq(reviewQueue.topicId, topicId)
        )
      );

    const unresolved = rows.filter((row) => row.fulfilledAt === null);
    const fulfilled = rows.filter((row) => row.fulfilledAt !== null);

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toBe("scheduled");
    expect(unresolved[0].dueAt).toEqual(nextDueAt);
    expect(fulfilled).toHaveLength(2);
  });

  it("enforces one unresolved scheduled review per learner/topic at the database level", async () => {
    const { learnerId, topicId } = await createLearnerTopic();
    const dueAt = new Date("2026-04-10T08:00:00Z");

    await db.insert(reviewQueue).values({
      learnerId,
      topicId,
      reason: "scheduled",
      priority: 5,
      dueAt,
    });

    await expect(
      db.insert(reviewQueue).values({
        learnerId,
        topicId,
        reason: "scheduled",
        priority: 5,
        dueAt: new Date("2026-04-12T08:00:00Z"),
      })
    ).rejects.toThrow();
  });
});
