import { eq, and, isNull, gte, inArray, desc } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  memoryCandidates,
  memoryConfirmed,
  learnerTopicState,
  misconceptionEvents,
  learnerPreferences,
  studySessions,
  studyBlocks,
} from "@/db/schema";
import type { LearnerContext } from "@/ai/study-modes";
import type { LearnerId, TopicId } from "@/lib/types";
import { resolveAllPolicies } from "@/engine/policies";

export const MEMORY_PROMOTION_THRESHOLD = 5;

const MIN_SESSIONS_FOR_LENGTH = 3;
const MIN_SESSIONS_FOR_TIME = 5;
const MIN_BLOCKS_FOR_TYPE = 5;
const MIN_SESSIONS_FOR_PACE = 3;

export interface LearnerPreference {
  key: string;
  value: unknown;
  source: string;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function classifyTimeOfDay(hour: number): string {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export async function promoteCandidates(
  db: Database,
  learnerId: LearnerId
): Promise<number> {
  return await db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.learnerId, learnerId),
          gte(memoryCandidates.evidenceCount, MEMORY_PROMOTION_THRESHOLD),
          isNull(memoryCandidates.promotedAt)
        )
      );

    if (candidates.length === 0) {
      return 0;
    }

    const now = new Date();

    const promoted = await tx
      .update(memoryCandidates)
      .set({ promotedAt: now })
      .where(
        and(
          inArray(
            memoryCandidates.id,
            candidates.map((c) => c.id)
          ),
          isNull(memoryCandidates.promotedAt)
        )
      )
      .returning();

    if (promoted.length === 0) {
      return 0;
    }

    await tx.insert(memoryConfirmed).values(
      promoted.map((c) => ({
        learnerId: learnerId as string,
        category: c.category,
        content: c.content,
        sourceCandidateId: c.id,
        confirmedBy: "auto_promotion",
      }))
    );

    return promoted.length;
  });
}

export async function inferPreferences(
  db: Database,
  learnerId: LearnerId
): Promise<LearnerPreference[]> {
  const prefs: LearnerPreference[] = [];
  const now = new Date();

  const completedSessions = await db
    .select({
      totalDurationMinutes: studySessions.totalDurationMinutes,
      startedAt: studySessions.startedAt,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        eq(studySessions.status, "completed")
      )
    )
    .orderBy(desc(studySessions.startedAt))
    .limit(30);

  // 1. Preferred session length
  const durations = completedSessions
    .map((s) => s.totalDurationMinutes)
    .filter((d): d is number => d !== null && d > 0);

  if (durations.length >= MIN_SESSIONS_FOR_LENGTH) {
    prefs.push({
      key: "preferred_session_minutes",
      value: Math.round(median(durations)),
      source: "inferred",
    });
  }

  // 2. Preferred time of day (all sessions, any status)
  const allSessions = await db
    .select({ startedAt: studySessions.startedAt })
    .from(studySessions)
    .where(eq(studySessions.learnerId, learnerId))
    .orderBy(desc(studySessions.startedAt))
    .limit(30);

  if (allSessions.length >= MIN_SESSIONS_FOR_TIME) {
    const timeBuckets: Record<string, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };

    for (const s of allSessions) {
      const hour = new Date(s.startedAt).getUTCHours();
      timeBuckets[classifyTimeOfDay(hour)]++;
    }

    const sorted = Object.entries(timeBuckets).sort(
      ([, a], [, b]) => b - a
    );
    prefs.push({
      key: "preferred_time_of_day",
      value: sorted[0][0],
      source: "inferred",
    });
  }

  // 3. Preferred block types
  const completedBlocks = await db
    .select({ blockType: studyBlocks.blockType })
    .from(studyBlocks)
    .where(
      and(
        eq(studyBlocks.learnerId, learnerId),
        eq(studyBlocks.status, "completed")
      )
    );

  if (completedBlocks.length >= MIN_BLOCKS_FOR_TYPE) {
    const typeCounts = new Map<string, number>();
    for (const b of completedBlocks) {
      typeCounts.set(b.blockType, (typeCounts.get(b.blockType) ?? 0) + 1);
    }
    const sorted = [...typeCounts.entries()].sort(([, a], [, b]) => b - a);
    prefs.push({
      key: "preferred_block_types",
      value: sorted.slice(0, 3).map(([type]) => type),
      source: "inferred",
    });
  }

  // 4. Learning pace (sessions per week over last 4 weeks)
  if (completedSessions.length >= MIN_SESSIONS_FOR_PACE) {
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const recentCount = completedSessions.filter(
      (s) => new Date(s.startedAt) >= fourWeeksAgo
    ).length;
    const sessionsPerWeek = recentCount / 4;

    let pace: string;
    if (sessionsPerWeek >= 7) pace = "intensive";
    else if (sessionsPerWeek >= 3) pace = "moderate";
    else if (sessionsPerWeek >= 1) pace = "light";
    else pace = "sporadic";

    prefs.push({
      key: "learning_pace",
      value: pace,
      source: "inferred",
    });
  }

  // Persist inferred preferences (don't overwrite stated/guardian_set)
  const existingPrefs = await db
    .select({
      key: learnerPreferences.key,
      source: learnerPreferences.source,
    })
    .from(learnerPreferences)
    .where(eq(learnerPreferences.learnerId, learnerId));

  const nonInferredKeys = new Set(
    existingPrefs
      .filter((p) => p.source !== "inferred")
      .map((p) => p.key)
  );

  for (const pref of prefs) {
    if (nonInferredKeys.has(pref.key)) {
      continue;
    }
    await db
      .insert(learnerPreferences)
      .values({
        learnerId,
        key: pref.key,
        value: pref.value,
        source: "inferred",
      })
      .onConflictDoUpdate({
        target: [learnerPreferences.learnerId, learnerPreferences.key],
        set: {
          value: pref.value,
          source: "inferred",
          updatedAt: now,
        },
        where: eq(learnerPreferences.source, "inferred"),
      });
  }

  return prefs;
}

export async function assembleLearnerContext(
  db: Database,
  learnerId: LearnerId,
  topicId: TopicId
): Promise<LearnerContext> {
  const [topicState] = await db
    .select({ masteryLevel: learnerTopicState.masteryLevel })
    .from(learnerTopicState)
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        eq(learnerTopicState.topicId, topicId)
      )
    )
    .limit(1);

  const masteryLevel = topicState ? Number(topicState.masteryLevel) : 0;

  const misconceptions = await db
    .select({ description: misconceptionEvents.description })
    .from(misconceptionEvents)
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        eq(misconceptionEvents.topicId, topicId),
        eq(misconceptionEvents.resolved, false)
      )
    );

  const knownMisconceptions = [
    ...new Set(misconceptions.map((m) => m.description)),
  ];

  const memories = await db
    .select({
      category: memoryConfirmed.category,
      content: memoryConfirmed.content,
    })
    .from(memoryConfirmed)
    .where(eq(memoryConfirmed.learnerId, learnerId));

  const confirmedMemory = memories.map((m) => ({
    category: m.category,
    content: m.content,
  }));

  const prefsRows = await db
    .select({
      key: learnerPreferences.key,
      value: learnerPreferences.value,
    })
    .from(learnerPreferences)
    .where(eq(learnerPreferences.learnerId, learnerId));

  const preferences: Record<string, unknown> = {};
  for (const row of prefsRows) {
    preferences[row.key] = row.value;
  }

  const policies = await resolveAllPolicies(learnerId, db);

  return {
    masteryLevel,
    knownMisconceptions,
    confirmedMemory,
    preferences,
    policies,
  };
}
