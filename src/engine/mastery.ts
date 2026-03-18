import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  learnerTopicState,
  misconceptionEvents,
  confidenceEvents,
  retentionEvents,
  memoryCandidates,
  memoryConfirmed,
  studyBlocks,
  topics,
} from "@/db/schema";
import type {
  LearnerId,
  TopicId,
  QualificationVersionId,
  AttemptOutcome,
  RetentionOutcome,
} from "@/lib/types";

const MIN_EASE_FACTOR = 1.3;
const FIRST_INTERVAL = 1;
const SECOND_INTERVAL = 6;
const MEMORY_PROMOTION_THRESHOLD = 5;

export function scoreToQuality(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

export function scoreToRetentionOutcome(score: number): RetentionOutcome {
  if (score >= 60) return "remembered";
  if (score >= 20) return "partial";
  return "forgotten";
}

export function calculateNewEaseFactor(
  currentEF: number,
  quality: number
): number {
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const newEF = currentEF + delta;
  return Math.max(MIN_EASE_FACTOR, Math.round(newEF * 100) / 100);
}

export function calculateNewInterval(
  reviewCount: number,
  currentInterval: number,
  easeFactor: number,
  quality: number
): number {
  if (quality < 3) return FIRST_INTERVAL;
  if (reviewCount === 0) return FIRST_INTERVAL;
  if (reviewCount === 1) return SECOND_INTERVAL;
  return Math.round(currentInterval * easeFactor);
}

export function calculateNewMastery(
  currentMastery: number,
  score: number
): number {
  const raw = currentMastery * 0.7 + (score / 100) * 0.3;
  return Math.min(1.0, Math.max(0.0, Math.round(raw * 1000) / 1000));
}

export async function processAttemptOutcome(
  attempt: AttemptOutcome,
  db: Database
): Promise<{
  masteryUpdate: { topicId: TopicId; before: number; after: number };
  nextReviewAt: Date;
  newEaseFactor: number;
  misconceptionEvents: Array<{ id: string }>;
  confidenceEvent: { id: string } | null;
  retentionEvent: { id: string } | null;
  memoryCandidatesUpdated: number;
}> {
  const [block] = await db
    .select()
    .from(studyBlocks)
    .where(eq(studyBlocks.id, attempt.blockId))
    .limit(1);

  if (!block) {
    throw new Error(`Study block not found: ${attempt.blockId}`);
  }

  const learnerId = block.learnerId as LearnerId;
  const topicId = block.topicId as TopicId;

  const [currentState] = await db
    .select()
    .from(learnerTopicState)
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        eq(learnerTopicState.topicId, topicId)
      )
    )
    .limit(1);

  if (!currentState) {
    throw new Error(
      `No topic state found for learner ${learnerId}, topic ${topicId}`
    );
  }

  const now = new Date();
  const currentMastery = Number(currentState.masteryLevel);
  const currentEF = Number(currentState.easeFactor);

  if (attempt.score === null) {
    const fallbackReview =
      currentState.nextReviewAt ??
      new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return {
      masteryUpdate: {
        topicId,
        before: currentMastery,
        after: currentMastery,
      },
      nextReviewAt: fallbackReview,
      newEaseFactor: currentEF,
      misconceptionEvents: [],
      confidenceEvent: null,
      retentionEvent: null,
      memoryCandidatesUpdated: 0,
    };
  }

  const score = attempt.score;
  const quality = scoreToQuality(score);
  const newEF = calculateNewEaseFactor(currentEF, quality);
  const newInterval = calculateNewInterval(
    currentState.reviewCount,
    currentState.intervalDays,
    newEF,
    quality
  );
  const newMastery = calculateNewMastery(currentMastery, score);
  const newStreak = quality >= 3 ? currentState.streak + 1 : 0;
  const nextReviewAt = new Date(
    now.getTime() + newInterval * 24 * 60 * 60 * 1000
  );
  const retentionOutcome =
    attempt.retentionOutcome ?? scoreToRetentionOutcome(score);
  const confidenceValue =
    attempt.confidenceAfter !== null
      ? attempt.confidenceAfter
      : Number(currentState.confidence);

  return await db.transaction(async (tx) => {
    await tx
      .update(learnerTopicState)
      .set({
        masteryLevel: newMastery.toFixed(3),
        confidence: confidenceValue.toFixed(3),
        easeFactor: newEF.toFixed(2),
        intervalDays: newInterval,
        nextReviewAt,
        lastReviewedAt: now,
        reviewCount: currentState.reviewCount + 1,
        streak: newStreak,
        updatedAt: now,
      })
      .where(eq(learnerTopicState.id, currentState.id));

    const misconceptionIds: Array<{ id: string }> = [];
    for (const m of attempt.misconceptions) {
      const [event] = await tx
        .insert(misconceptionEvents)
        .values({
          learnerId,
          topicId: m.topicId,
          misconceptionRuleId: m.ruleId,
          description: m.description,
          severity: m.severity,
        })
        .returning({ id: misconceptionEvents.id });
      misconceptionIds.push(event);
    }

    let confidenceEvent: { id: string } | null = null;
    if (
      attempt.confidenceBefore !== null &&
      attempt.confidenceAfter !== null
    ) {
      const selfRated = attempt.confidenceBefore;
      const actual = score / 100;
      const delta = selfRated - actual;
      const [event] = await tx
        .insert(confidenceEvents)
        .values({
          learnerId,
          topicId,
          selfRated: selfRated.toFixed(3),
          actual: actual.toFixed(3),
          delta: delta.toFixed(3),
        })
        .returning({ id: confidenceEvents.id });
      confidenceEvent = event;
    }

    let retentionEvent: { id: string } | null = null;
    if (currentState.lastReviewedAt) {
      const daysSinceLastReview = Math.floor(
        (now.getTime() - currentState.lastReviewedAt.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const [event] = await tx
        .insert(retentionEvents)
        .values({
          learnerId,
          topicId,
          intervalDays: daysSinceLastReview,
          outcome: retentionOutcome,
          easeFactorBefore: currentEF.toFixed(2),
          easeFactorAfter: newEF.toFixed(2),
        })
        .returning({ id: retentionEvents.id });
      retentionEvent = event;
    }

    let memoryCandidatesUpdated = 0;
    for (const m of attempt.misconceptions) {
      const [existing] = await tx
        .select()
        .from(memoryCandidates)
        .where(
          and(
            eq(memoryCandidates.learnerId, learnerId),
            eq(memoryCandidates.category, "misconception_pattern"),
            eq(memoryCandidates.content, m.description)
          )
        )
        .limit(1);

      if (existing) {
        const newCount = existing.evidenceCount + 1;
        await tx
          .update(memoryCandidates)
          .set({ evidenceCount: newCount, lastSeenAt: now })
          .where(eq(memoryCandidates.id, existing.id));

        if (
          newCount >= MEMORY_PROMOTION_THRESHOLD &&
          !existing.promotedAt
        ) {
          await tx
            .update(memoryCandidates)
            .set({ promotedAt: now })
            .where(eq(memoryCandidates.id, existing.id));

          await tx.insert(memoryConfirmed).values({
            learnerId,
            category: "misconception_pattern",
            content: m.description,
            sourceCandidateId: existing.id,
            confirmedBy: "auto_promotion",
          });
        }
        memoryCandidatesUpdated++;
      } else {
        await tx.insert(memoryCandidates).values({
          learnerId,
          category: "misconception_pattern",
          content: m.description,
        });
        memoryCandidatesUpdated++;
      }
    }

    return {
      masteryUpdate: { topicId, before: currentMastery, after: newMastery },
      nextReviewAt,
      newEaseFactor: newEF,
      misconceptionEvents: misconceptionIds,
      confidenceEvent,
      retentionEvent,
      memoryCandidatesUpdated,
    };
  });
}

export async function initTopicStates(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  db: Database
): Promise<{ topicsCreated: number }> {
  const qualTopics = await db
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.qualificationVersionId, qualificationVersionId));

  if (qualTopics.length === 0) {
    return { topicsCreated: 0 };
  }

  const values = qualTopics.map((t) => ({
    learnerId: learnerId as string,
    topicId: t.id,
  }));

  const inserted = await db
    .insert(learnerTopicState)
    .values(values)
    .onConflictDoNothing({
      target: [learnerTopicState.learnerId, learnerTopicState.topicId],
    })
    .returning({ id: learnerTopicState.id });

  return { topicsCreated: inserted.length };
}

export async function processDiagnosticResult(
  learnerId: LearnerId,
  results: Array<{ topicId: TopicId; score: number; confidence: number }>,
  db: Database
): Promise<{ topicsUpdated: number }> {
  let topicsUpdated = 0;
  const now = new Date();

  for (const result of results) {
    const mastery = Math.min(1.0, Math.max(0.0, result.score));
    const confidence = Math.min(1.0, Math.max(0.0, result.confidence));

    const updated = await db
      .update(learnerTopicState)
      .set({
        masteryLevel: mastery.toFixed(3),
        confidence: confidence.toFixed(3),
        updatedAt: now,
      })
      .where(
        and(
          eq(learnerTopicState.learnerId, learnerId),
          eq(learnerTopicState.topicId, result.topicId)
        )
      )
      .returning({ id: learnerTopicState.id });

    if (updated.length > 0) {
      topicsUpdated++;
    }
  }

  return { topicsUpdated };
}
