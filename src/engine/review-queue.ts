import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { reviewQueue } from "@/db/schema";
import type { LearnerId, ReviewReason, TopicId } from "@/lib/types";

interface UnresolvedReviewQueueEntry {
  id: string;
  reason: ReviewReason;
  dueAt: Date;
  priority: number;
}

export async function syncScheduledReviewQueue(params: {
  learnerId: LearnerId;
  topicId: TopicId;
  dueAt: Date;
  priority?: number;
  now?: Date;
  reason?: Extract<ReviewReason, "scheduled">;
}, db: Database): Promise<{
  action: "inserted" | "already_scheduled";
  dueAt: Date;
  fulfilledCount: number;
}> {
  const priority = params.priority ?? 5;
  const now = params.now ?? new Date();
  const reason = params.reason ?? "scheduled";

  return db.transaction(async (tx) => {
    const unresolved = await tx
      .select({
        id: reviewQueue.id,
        reason: reviewQueue.reason,
        dueAt: reviewQueue.dueAt,
        priority: reviewQueue.priority,
      })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, params.learnerId),
          eq(reviewQueue.topicId, params.topicId),
          isNull(reviewQueue.fulfilledAt)
        )
      );

    const alreadyScheduled =
      unresolved.length === 1 &&
      unresolved[0].reason === reason &&
      unresolved[0].dueAt.getTime() === params.dueAt.getTime() &&
      unresolved[0].priority === priority;

    if (alreadyScheduled) {
      return {
        action: "already_scheduled",
        dueAt: params.dueAt,
        fulfilledCount: 0,
      };
    }

    const unresolvedIds = unresolved.map(
      (entry) => entry.id
    ) as UnresolvedReviewQueueEntry["id"][];

    if (unresolvedIds.length > 0) {
      await tx
        .update(reviewQueue)
        .set({ fulfilledAt: now })
        .where(
          and(
            eq(reviewQueue.learnerId, params.learnerId),
            eq(reviewQueue.topicId, params.topicId),
            isNull(reviewQueue.fulfilledAt)
          )
        );
    }

    await tx.insert(reviewQueue).values({
      learnerId: params.learnerId,
      topicId: params.topicId,
      reason,
      priority,
      dueAt: params.dueAt,
    });

    return {
      action: "inserted",
      dueAt: params.dueAt,
      fulfilledCount: unresolvedIds.length,
    };
  });
}
