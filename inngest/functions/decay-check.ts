import { inngest } from "../client";
import { db } from "@/lib/db";
import { learnerTopicState, reviewQueue } from "@/db/schema";
import { lt, and, isNull, eq, sql } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";

/**
 * Cron: daily 00:00 UTC
 * Scans learner_topic_state for topics whose next_review_at has passed.
 * Inserts review_queue entries with reason='decay' for overdue topics
 * that don't already have an unfulfilled queue entry.
 */
export const decayCheckFunction = inngest.createFunction(
  { id: "mastery/decay-check" },
  { cron: "0 0 * * *" },
  async ({ step }) => {
    const now = new Date();

    const overdueTopics = await step.run("scan-overdue-topics", async () => {
      const rows = await db
        .select({
          learnerId: learnerTopicState.learnerId,
          topicId: learnerTopicState.topicId,
          nextReviewAt: learnerTopicState.nextReviewAt,
          masteryLevel: learnerTopicState.masteryLevel,
        })
        .from(learnerTopicState)
        .where(
          and(
            lt(learnerTopicState.nextReviewAt, now),
            sql`NOT EXISTS (
              SELECT 1 FROM ${reviewQueue}
              WHERE ${reviewQueue.learnerId} = ${learnerTopicState.learnerId}
                AND ${reviewQueue.topicId} = ${learnerTopicState.topicId}
                AND ${reviewQueue.fulfilledAt} IS NULL
            )`,
          ),
        );

      return rows.map((r) => ({
        learnerId: r.learnerId,
        topicId: r.topicId,
        nextReviewAt: r.nextReviewAt?.toISOString() ?? null,
        masteryLevel: Number(r.masteryLevel),
      }));
    });

    if (overdueTopics.length === 0) {
      return { overdueCount: 0, queueEntriesCreated: 0 };
    }

    const created = await step.run("insert-decay-queue-entries", async () => {
      const values = overdueTopics.map((t) => ({
        learnerId: t.learnerId,
        topicId: t.topicId,
        reason: "decay" as const,
        priority: Math.max(1, Math.min(10, Math.round(10 - t.masteryLevel * 10))),
        dueAt: new Date(),
      }));

      await db.insert(reviewQueue).values(values);
      return values.length;
    });

    structuredLog("mastery.decay-check.complete", {
      overdueCount: overdueTopics.length,
      queueEntriesCreated: created,
    });

    return { overdueCount: overdueTopics.length, queueEntriesCreated: created };
  },
);
