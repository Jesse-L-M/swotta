import { eq, and, lte, isNull, asc, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  learnerTopicState,
  studyPlans,
  studyBlocks,
  reviewQueue,
  topics,
  taskRules,
  learnerQualifications,
} from "@/db/schema";
import type {
  LearnerId,
  TopicId,
  QualificationVersionId,
  BlockId,
  BlockType,
  ReviewReason,
  StudyBlock,
  SchedulerConfig,
} from "@/lib/types";

const DEFAULT_CONFIG: SchedulerConfig = {
  maxBlocksPerSession: 5,
  defaultSessionMinutes: 30,
  examPressureWeightMultiplier: 2.0,
  decayUrgencyDays: 14,
};

export function calculateTopicPriority(
  masteryLevel: number,
  daysOverdue: number,
  daysUntilExam: number | null,
  config: SchedulerConfig = DEFAULT_CONFIG
): number {
  let priority = masteryLevel * 10;

  if (daysOverdue > 0) {
    const urgency = Math.min(daysOverdue / config.decayUrgencyDays, 1.0);
    priority -= urgency * 5;
  }

  if (daysUntilExam !== null && daysUntilExam > 0) {
    const examPressure = Math.max(0, 1 - daysUntilExam / 90);
    priority -= examPressure * config.examPressureWeightMultiplier;
  }

  return Math.max(1, Math.min(10, Math.round(priority)));
}

function heuristicBlockType(
  masteryLevel: number,
  streak: number,
  daysOverdue: number
): BlockType {
  if (daysOverdue > 14) return "reentry";
  if (masteryLevel < 0.2) return "explanation";
  if (masteryLevel < 0.4) return "worked_example";
  if (masteryLevel < 0.7) return "retrieval_drill";
  if (masteryLevel >= 0.7 && streak >= 3) return "timed_problems";
  return "retrieval_drill";
}

export async function selectBlockType(
  topicId: TopicId,
  masteryLevel: number,
  streak: number,
  daysOverdue: number,
  db: Database
): Promise<BlockType> {
  // Look up task_rules for this topic
  const rules = await db
    .select({
      blockType: taskRules.blockType,
      difficultyMin: taskRules.difficultyMin,
      difficultyMax: taskRules.difficultyMax,
    })
    .from(taskRules)
    .where(eq(taskRules.topicId, topicId));

  if (rules.length > 0) {
    // Map mastery to difficulty (1-5 scale)
    const difficulty = Math.max(1, Math.min(5, Math.round(masteryLevel * 5)));

    // Find a matching rule for the current difficulty
    const matching = rules.find(
      (r) => difficulty >= r.difficultyMin && difficulty <= r.difficultyMax
    );

    if (matching) {
      return matching.blockType as BlockType;
    }
  }

  // Fall back to heuristic
  return heuristicBlockType(masteryLevel, streak, daysOverdue);
}

// Keep synchronous version for backward compatibility in tests
export { heuristicBlockType as selectBlockTypeSync };

export function estimateBlockDuration(blockType: BlockType): number {
  const durations: Record<BlockType, number> = {
    retrieval_drill: 10,
    explanation: 15,
    worked_example: 15,
    timed_problems: 20,
    essay_planning: 20,
    source_analysis: 15,
    mistake_review: 10,
    reentry: 10,
  };
  return durations[blockType];
}

interface TopicCandidate {
  topicId: TopicId;
  topicName: string;
  masteryLevel: number;
  streak: number;
  daysOverdue: number;
  daysUntilExam: number | null;
  priority: number;
  blockType: BlockType;
  duration: number;
  reason: string;
}

async function buildCandidatePool(
  learnerId: LearnerId,
  qualVersionIds: QualificationVersionId[],
  examDateMap: Map<string, Date | null>,
  db: Database,
  config: SchedulerConfig = DEFAULT_CONFIG
): Promise<TopicCandidate[]> {
  const allTopicStates = await db
    .select({
      topicId: learnerTopicState.topicId,
      masteryLevel: learnerTopicState.masteryLevel,
      streak: learnerTopicState.streak,
      nextReviewAt: learnerTopicState.nextReviewAt,
      topicName: topics.name,
      qualificationVersionId: topics.qualificationVersionId,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(eq(learnerTopicState.learnerId, learnerId));

  const now = new Date();
  const candidates: TopicCandidate[] = [];

  for (const state of allTopicStates) {
    if (
      !qualVersionIds.includes(
        state.qualificationVersionId as QualificationVersionId
      )
    ) {
      continue;
    }

    const mastery = Number(state.masteryLevel);
    const streak = state.streak;

    let daysOverdue = 0;
    if (state.nextReviewAt) {
      const overdueMs = now.getTime() - state.nextReviewAt.getTime();
      daysOverdue = Math.max(0, Math.floor(overdueMs / (1000 * 60 * 60 * 24)));
    }

    const examDate = examDateMap.get(state.qualificationVersionId) ?? null;
    let daysUntilExam: number | null = null;
    if (examDate) {
      daysUntilExam = Math.max(
        0,
        Math.floor(
          (examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
    }

    const priority = calculateTopicPriority(
      mastery,
      daysOverdue,
      daysUntilExam,
      config
    );
    const blockType = await selectBlockType(
      state.topicId as TopicId,
      mastery,
      streak,
      daysOverdue,
      db
    );
    const duration = estimateBlockDuration(blockType);

    let reason = "Scheduled review";
    if (daysOverdue > 0) reason = "Overdue review";
    if (mastery < 0.3) reason = "Low mastery";
    if (daysUntilExam !== null && daysUntilExam < 14)
      reason = "Exam approaching";
    if (daysOverdue > 14) reason = "Returning after gap";

    candidates.push({
      topicId: state.topicId as TopicId,
      topicName: state.topicName,
      masteryLevel: mastery,
      streak,
      daysOverdue,
      daysUntilExam,
      priority,
      blockType,
      duration,
      reason,
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates;
}

async function loadQualContext(
  learnerId: LearnerId,
  db: Database
): Promise<{
  quals: Array<{ qualificationVersionId: string; examDate: string | null; status: string }>;
  qualVersionIds: QualificationVersionId[];
  examDateMap: Map<string, Date | null>;
} | null> {
  const quals = await db
    .select()
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active")
      )
    );

  if (quals.length === 0) return null;

  const qualVersionIds = quals.map(
    (q) => q.qualificationVersionId as QualificationVersionId
  );

  const examDateMap = new Map<string, Date | null>();
  for (const q of quals) {
    examDateMap.set(
      q.qualificationVersionId,
      q.examDate ? new Date(q.examDate) : null
    );
  }

  return { quals, qualVersionIds, examDateMap };
}

export async function getNextBlocks(
  learnerId: LearnerId,
  db: Database,
  options?: {
    qualificationVersionIds?: QualificationVersionId[];
    maxBlocks?: number;
    sessionMinutes?: number;
    focusTopicIds?: TopicId[];
    excludeBlockTypes?: BlockType[];
  },
  config: SchedulerConfig = DEFAULT_CONFIG
): Promise<StudyBlock[]> {
  const maxBlocks = options?.maxBlocks ?? config.maxBlocksPerSession;
  const sessionMinutes = options?.sessionMinutes ?? config.defaultSessionMinutes;

  // Idempotency guard: return existing pending blocks instead of creating duplicates
  const existingPending = await db
    .select({
      id: studyBlocks.id,
      learnerId: studyBlocks.learnerId,
      topicId: studyBlocks.topicId,
      blockType: studyBlocks.blockType,
      durationMinutes: studyBlocks.durationMinutes,
      priority: studyBlocks.priority,
      topicName: topics.name,
    })
    .from(studyBlocks)
    .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
    .where(
      and(
        eq(studyBlocks.learnerId, learnerId),
        eq(studyBlocks.status, "pending"),
        isNull(studyBlocks.planId)
      )
    )
    .orderBy(asc(studyBlocks.priority))
    .limit(maxBlocks);

  if (existingPending.length > 0) {
    return existingPending.map((b) => ({
      id: b.id as BlockId,
      learnerId: b.learnerId as LearnerId,
      topicId: b.topicId as TopicId,
      topicName: b.topicName,
      blockType: b.blockType as BlockType,
      durationMinutes: b.durationMinutes,
      priority: b.priority,
      reason: "Scheduled review",
    }));
  }

  const ctx = await loadQualContext(learnerId, db);
  if (!ctx) return [];

  let { qualVersionIds } = ctx;
  if (options?.qualificationVersionIds?.length) {
    qualVersionIds = qualVersionIds.filter((id) =>
      options.qualificationVersionIds!.includes(id)
    );
    if (qualVersionIds.length === 0) return [];
  }

  let candidates = await buildCandidatePool(
    learnerId,
    qualVersionIds,
    ctx.examDateMap,
    db,
    config
  );

  if (options?.focusTopicIds?.length) {
    candidates = candidates.filter((c) =>
      options.focusTopicIds!.includes(c.topicId)
    );
  }

  if (options?.excludeBlockTypes?.length) {
    candidates = candidates.filter(
      (c) => !options.excludeBlockTypes!.includes(c.blockType)
    );
  }

  const selected: typeof candidates = [];
  let totalMinutes = 0;
  for (const candidate of candidates) {
    if (selected.length >= maxBlocks) break;
    if (totalMinutes + candidate.duration > sessionMinutes) break;
    selected.push(candidate);
    totalMinutes += candidate.duration;
  }

  if (selected.length === 0) return [];

  const blockValues = selected.map((s, i) => ({
    learnerId: learnerId as string,
    topicId: s.topicId as string,
    blockType: s.blockType,
    durationMinutes: s.duration,
    priority: s.priority,
    scheduledOrder: i + 1,
  }));

  const insertedBlocks = await db
    .insert(studyBlocks)
    .values(blockValues)
    .returning();

  return insertedBlocks.map((b, i) => ({
    id: b.id as BlockId,
    learnerId: b.learnerId as LearnerId,
    topicId: b.topicId as TopicId,
    topicName: selected[i].topicName,
    blockType: b.blockType as BlockType,
    durationMinutes: b.durationMinutes,
    priority: b.priority,
    reason: selected[i].reason,
  }));
}

export async function getReviewQueue(
  learnerId: LearnerId,
  db: Database
): Promise<
  Array<{
    topicId: TopicId;
    topicName: string;
    reason: ReviewReason;
    priority: number;
    dueAt: Date;
  }>
> {
  const rows = await db
    .select({
      topicId: reviewQueue.topicId,
      topicName: topics.name,
      reason: reviewQueue.reason,
      priority: reviewQueue.priority,
      dueAt: reviewQueue.dueAt,
    })
    .from(reviewQueue)
    .innerJoin(topics, eq(reviewQueue.topicId, topics.id))
    .where(
      and(
        eq(reviewQueue.learnerId, learnerId),
        isNull(reviewQueue.fulfilledAt)
      )
    )
    .orderBy(asc(reviewQueue.priority), asc(reviewQueue.dueAt));

  return rows.map((r) => ({
    topicId: r.topicId as TopicId,
    topicName: r.topicName,
    reason: r.reason as ReviewReason,
    priority: r.priority,
    dueAt: r.dueAt,
  }));
}

export async function buildWeeklyPlan(
  learnerId: LearnerId,
  weekStart: Date,
  db: Database,
  options?: {
    dailyMinutes?: number;
    examDates?: Array<{ qualificationVersionId: string; date: Date }>;
  }
): Promise<{ planId: string; blocks: StudyBlock[] }> {
  const dailyMinutes = options?.dailyMinutes ?? 30;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const title = `Week of ${weekStart.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  })}`;

  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId: learnerId as string,
      planType: "weekly",
      title,
      startDate: formatDate(weekStart),
      endDate: formatDate(weekEnd),
      status: "active",
      config: { dailyMinutes },
    })
    .returning();

  const ctx = await loadQualContext(learnerId, db);
  if (!ctx) {
    return { planId: plan.id, blocks: [] };
  }

  if (options?.examDates) {
    for (const ed of options.examDates) {
      ctx.examDateMap.set(ed.qualificationVersionId, ed.date);
    }
  }

  const topicPool = await buildCandidatePool(
    learnerId,
    ctx.qualVersionIds,
    ctx.examDateMap,
    db
  );

  const allBlocks: StudyBlock[] = [];

  for (let day = 0; day < 7; day++) {
    const scheduledDate = new Date(weekStart);
    scheduledDate.setDate(scheduledDate.getDate() + day);
    const dateStr = formatDate(scheduledDate);

    let dayMinutes = 0;
    let dayOrder = 0;
    const dayTopicIds = new Set<string>();

    for (const topic of topicPool) {
      if (dayTopicIds.has(topic.topicId)) continue;
      if (dayMinutes + topic.duration > dailyMinutes) continue;

      dayOrder++;
      dayMinutes += topic.duration;
      dayTopicIds.add(topic.topicId);

      const [block] = await db
        .insert(studyBlocks)
        .values({
          planId: plan.id,
          learnerId: learnerId as string,
          topicId: topic.topicId as string,
          blockType: topic.blockType,
          scheduledDate: dateStr,
          scheduledOrder: dayOrder,
          durationMinutes: topic.duration,
          priority: topic.priority,
        })
        .returning();

      allBlocks.push({
        id: block.id as BlockId,
        learnerId: block.learnerId as LearnerId,
        topicId: block.topicId as TopicId,
        topicName: topic.topicName,
        blockType: block.blockType as BlockType,
        durationMinutes: block.durationMinutes,
        priority: block.priority,
        reason: topic.reason,
      });
    }
  }

  return { planId: plan.id, blocks: allBlocks };
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
