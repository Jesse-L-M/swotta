import { inngest } from "../client";
import { processAttemptOutcome } from "@/engine/mastery";
import { db } from "@/lib/db";
import { reviewQueue, studyBlocks } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";
import type { AttemptOutcome, TopicId } from "@/lib/types";

/**
 * Event: "attempt.completed"
 * After a study block attempt completes:
 * 1. Look up the block to get learnerId
 * 2. Update mastery state (ease factor, interval, mastery level)
 * 3. Fulfill any existing review queue entries for this topic
 * 4. Insert a new review queue entry at the next review date
 *
 * Note: Inngest step.run() serializes return values to JSON, so Date objects
 * become ISO strings in subsequent steps. We reconstruct Dates where needed.
 */
export const updateQueueFunction = inngest.createFunction(
  {
    id: "scheduling/update-queue",
    retries: 3,
  },
  { event: "attempt.completed" },
  async ({ event, step }) => {
    const attempt = event.data as AttemptOutcome;

    const block = await step.run("lookup-block", async () => {
      const [row] = await db
        .select({ learnerId: studyBlocks.learnerId })
        .from(studyBlocks)
        .where(eq(studyBlocks.id, attempt.blockId))
        .limit(1);
      if (!row) {
        throw new Error(`Study block not found: ${attempt.blockId}`);
      }
      return row;
    });

    const masteryResult = await step.run("process-attempt-outcome", async () => {
      const result = await processAttemptOutcome(attempt, db);
      return result;
    });

    // Inngest serializes step results to JSON — Dates become ISO strings
    const topicId = masteryResult.masteryUpdate.topicId as string as TopicId;
    const nextReviewAt = new Date(masteryResult.nextReviewAt as unknown as string);

    await step.run("fulfill-review-queue", async () => {
      await db
        .update(reviewQueue)
        .set({ fulfilledAt: new Date() })
        .where(
          and(
            eq(reviewQueue.learnerId, block.learnerId),
            eq(reviewQueue.topicId, topicId),
            isNull(reviewQueue.fulfilledAt),
          ),
        );
    });

    await step.run("insert-review-queue-entry", async () => {
      await db.insert(reviewQueue).values({
        learnerId: block.learnerId,
        topicId,
        reason: "scheduled" as const,
        priority: 5,
        dueAt: nextReviewAt,
      });
    });

    structuredLog("scheduling.update-queue.complete", {
      blockId: attempt.blockId,
      topicId,
      masteryBefore: masteryResult.masteryUpdate.before,
      masteryAfter: masteryResult.masteryUpdate.after,
      nextReviewAt: nextReviewAt.toISOString(),
    });

    return {
      masteryUpdate: masteryResult.masteryUpdate,
      nextReviewAt: nextReviewAt.toISOString(),
    };
  },
);
