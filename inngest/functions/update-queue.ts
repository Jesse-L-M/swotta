import { inngest } from "../client";
import { syncScheduledReviewQueue } from "@/engine/review-queue";
import { db } from "@/lib/db";
import { learnerTopicState, studyBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";
import type { AttemptOutcome, LearnerId, TopicId } from "@/lib/types";

/**
 * Event: "attempt.completed"
 * After a study block attempt completes:
 * 1. Look up the completed block to get learnerId/topicId
 * 2. Read the next review date from learner_topic_state
 * 3. Fulfill stale unresolved queue entries for this topic
 * 4. Ensure there is one scheduled queue entry at the current next review date
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
        .select({
          learnerId: studyBlocks.learnerId,
          topicId: studyBlocks.topicId,
        })
        .from(studyBlocks)
        .where(eq(studyBlocks.id, attempt.blockId))
        .limit(1);
      if (!row) {
        throw new Error(`Study block not found: ${attempt.blockId}`);
      }
      return row;
    });

    const topicState = await step.run("lookup-topic-state", async () => {
      const [row] = await db
        .select({ nextReviewAt: learnerTopicState.nextReviewAt })
        .from(learnerTopicState)
        .where(
          and(
            eq(learnerTopicState.learnerId, block.learnerId),
            eq(learnerTopicState.topicId, block.topicId)
          )
        )
        .limit(1);

      if (!row?.nextReviewAt) {
        throw new Error(
          `No next review date found for learner ${block.learnerId}, topic ${block.topicId}`
        );
      }

      return row;
    });

    const nextReviewAt = new Date(topicState.nextReviewAt as unknown as string);

    const queueResult = await step.run("sync-review-queue", async () => {
      return syncScheduledReviewQueue(
        {
          learnerId: block.learnerId as LearnerId,
          topicId: block.topicId as TopicId,
          dueAt: nextReviewAt,
        },
        db
      );
    });

    structuredLog("scheduling.update-queue.complete", {
      blockId: attempt.blockId,
      learnerId: block.learnerId,
      topicId: block.topicId,
      nextReviewAt: nextReviewAt.toISOString(),
      queueAction: queueResult.action,
      fulfilledCount: queueResult.fulfilledCount,
    });

    return {
      learnerId: block.learnerId,
      topicId: block.topicId,
      nextReviewAt: nextReviewAt.toISOString(),
      queueAction: queueResult.action,
    };
  },
);
