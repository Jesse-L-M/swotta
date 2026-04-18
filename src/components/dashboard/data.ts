import { eq, and, count, sum, asc, inArray, isNull, desc } from "drizzle-orm";
import {
  learners,
  learnerQualifications,
  qualifications,
  qualificationVersions,
  examBoards,
  subjects,
  learnerTopicState,
  studySessions,
  studyBlocks,
  topics,
  misconceptionEvents,
  reviewQueue,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import type {
  StudyBlock,
  LearnerId,
  BlockId,
  TopicId,
  BlockType,
  ReviewReason,
} from "@/lib/types";
import type {
  DashboardQueueBlock,
  DashboardQualification,
  DashboardStats,
  MasteryTopic,
} from "./types";
import {
  buildQueueWhyNow,
  getQueueActionTitle,
  getQueueImpact,
} from "./utils";

export async function loadLearnerByUserId(
  userId: string,
  db: Database
): Promise<{
  id: string;
  displayName: string;
  yearGroup: number | null;
} | null> {
  const [learner] = await db
    .select({
      id: learners.id,
      displayName: learners.displayName,
      yearGroup: learners.yearGroup,
    })
    .from(learners)
    .where(eq(learners.userId, userId))
    .limit(1);

  return learner ?? null;
}

export async function loadQualifications(
  learnerId: string,
  db: Database
): Promise<DashboardQualification[]> {
  const rows = await db
    .select({
      id: learnerQualifications.id,
      qualificationVersionId: learnerQualifications.qualificationVersionId,
      targetGrade: learnerQualifications.targetGrade,
      examDate: learnerQualifications.examDate,
      qualificationName: qualifications.name,
      subjectName: subjects.name,
      examBoardCode: examBoards.code,
    })
    .from(learnerQualifications)
    .innerJoin(
      qualificationVersions,
      eq(
        learnerQualifications.qualificationVersionId,
        qualificationVersions.id
      )
    )
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .innerJoin(subjects, eq(qualifications.subjectId, subjects.id))
    .innerJoin(
      examBoards,
      eq(qualificationVersions.examBoardId, examBoards.id)
    )
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active")
      )
    );

  return rows;
}

export async function loadDashboardStats(
  learnerId: string,
  db: Database
): Promise<DashboardStats> {
  const sessionRows = await db
    .select({
      totalSessions: count(studySessions.id),
      totalStudyMinutes: sum(studySessions.totalDurationMinutes),
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        eq(studySessions.status, "completed")
      )
    );

  const totalSessions = sessionRows[0]?.totalSessions ?? 0;
  const totalStudyMinutes = Number(sessionRows[0]?.totalStudyMinutes ?? 0);

  const topicStateRows = await db
    .select({
      masteryLevel: learnerTopicState.masteryLevel,
      streak: learnerTopicState.streak,
    })
    .from(learnerTopicState)
    .where(eq(learnerTopicState.learnerId, learnerId));

  const topicsTotal = topicStateRows.length;
  const topicsStudied = topicStateRows.filter(
    (r) => Number(r.masteryLevel) > 0
  ).length;

  const levels = topicStateRows.map((r) => Number(r.masteryLevel));
  const averageMastery =
    levels.length > 0
      ? Math.round(
          (levels.reduce((a, b) => a + b, 0) / levels.length) * 1000
        ) / 1000
      : 0;

  const maxStreak = topicStateRows.reduce(
    (max, r) => Math.max(max, r.streak),
    0
  );

  return {
    totalSessions,
    totalStudyMinutes,
    averageMastery,
    topicsStudied,
    topicsTotal,
    currentStreak: maxStreak,
  };
}

export async function loadTodayQueue(
  learnerId: string,
  db: Database
): Promise<DashboardQueueBlock[]> {
  const existing = await db
    .select({
      id: studyBlocks.id,
      learnerId: studyBlocks.learnerId,
      topicId: studyBlocks.topicId,
      topicName: topics.name,
      blockType: studyBlocks.blockType,
      durationMinutes: studyBlocks.durationMinutes,
      priority: studyBlocks.priority,
    })
    .from(studyBlocks)
    .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
    .where(
      and(
        eq(studyBlocks.learnerId, learnerId),
        eq(studyBlocks.status, "pending")
      )
    )
    .orderBy(asc(studyBlocks.priority));

  if (existing.length > 0) {
    return enrichQueueBlocks(
      existing.map((b) => ({
        id: b.id as BlockId,
        learnerId: b.learnerId as LearnerId,
        topicId: b.topicId as TopicId,
        topicName: b.topicName,
        blockType: b.blockType as BlockType,
        durationMinutes: b.durationMinutes,
        priority: b.priority,
        reason: "Scheduled review",
      })),
      learnerId,
      db
    );
  }

  const { getNextBlocks } = await import("@/engine/scheduler");
  const blocks = await getNextBlocks(learnerId as LearnerId, db);
  return enrichQueueBlocks(blocks, learnerId, db);
}

async function enrichQueueBlocks(
  blocks: StudyBlock[],
  learnerId: string,
  db: Database
): Promise<DashboardQueueBlock[]> {
  if (blocks.length === 0) {
    return [];
  }

  const topicIds = [...new Set(blocks.map((block) => block.topicId as string))];

  const [topicStateRows, reviewRows, misconceptionRows] = await Promise.all([
    db
      .select({
        topicId: topics.id,
        masteryLevel: learnerTopicState.masteryLevel,
        confidence: learnerTopicState.confidence,
        reviewCount: learnerTopicState.reviewCount,
        nextReviewAt: learnerTopicState.nextReviewAt,
        examDate: learnerQualifications.examDate,
      })
      .from(topics)
      .leftJoin(
        learnerTopicState,
        and(
          eq(learnerTopicState.topicId, topics.id),
          eq(learnerTopicState.learnerId, learnerId)
        )
      )
      .leftJoin(
        learnerQualifications,
        and(
          eq(learnerQualifications.learnerId, learnerId),
          eq(
            learnerQualifications.qualificationVersionId,
            topics.qualificationVersionId
          ),
          eq(learnerQualifications.status, "active")
        )
      )
      .where(inArray(topics.id, topicIds)),
    db
      .select({
        topicId: reviewQueue.topicId,
        reason: reviewQueue.reason,
        priority: reviewQueue.priority,
        dueAt: reviewQueue.dueAt,
      })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, learnerId),
          inArray(reviewQueue.topicId, topicIds),
          isNull(reviewQueue.fulfilledAt)
        )
      )
      .orderBy(asc(reviewQueue.priority), asc(reviewQueue.dueAt)),
    db
      .select({
        topicId: misconceptionEvents.topicId,
        description: misconceptionEvents.description,
        createdAt: misconceptionEvents.createdAt,
      })
      .from(misconceptionEvents)
      .where(
        and(
          eq(misconceptionEvents.learnerId, learnerId),
          inArray(misconceptionEvents.topicId, topicIds),
          eq(misconceptionEvents.resolved, false)
        )
      )
      .orderBy(desc(misconceptionEvents.createdAt)),
  ]);

  const topicStateMap = new Map(
    topicStateRows.map((row) => [
      row.topicId,
      {
        masteryLevel:
          row.masteryLevel === null ? null : Number(row.masteryLevel),
        confidence: row.confidence === null ? null : Number(row.confidence),
        reviewCount: row.reviewCount ?? 0,
        nextReviewAt: row.nextReviewAt,
        examDate: row.examDate,
      },
    ])
  );

  const reviewReasonMap = new Map<string, ReviewReason>();
  for (const row of reviewRows) {
    if (!reviewReasonMap.has(row.topicId)) {
      reviewReasonMap.set(row.topicId, row.reason as ReviewReason);
    }
  }

  const misconceptionMap = new Map<
    string,
    { count: number; description: string | null }
  >();
  for (const row of misconceptionRows) {
    const existing = misconceptionMap.get(row.topicId);
    if (existing) {
      existing.count += 1;
      continue;
    }

    misconceptionMap.set(row.topicId, {
      count: 1,
      description: row.description,
    });
  }

  return blocks.map((block) => {
    const topicState = topicStateMap.get(block.topicId as string);
    const misconception = misconceptionMap.get(block.topicId as string);
    const reviewReason = reviewReasonMap.get(block.topicId as string) ?? null;

    return {
      id: block.id,
      learnerId: block.learnerId,
      topicId: block.topicId,
      topicName: block.topicName,
      blockType: block.blockType,
      durationMinutes: block.durationMinutes,
      priority: block.priority,
      reason: block.reason,
      reviewReason,
      actionTitle: getQueueActionTitle(block.blockType, block.topicName),
      whyNow: buildQueueWhyNow({
        topicName: block.topicName,
        reviewReason,
        masteryLevel: topicState?.masteryLevel ?? null,
        confidence: topicState?.confidence ?? null,
        reviewCount: topicState?.reviewCount ?? 0,
        nextReviewAt: topicState?.nextReviewAt ?? null,
        examDate: topicState?.examDate ?? null,
        activeMisconceptionCount: misconception?.count ?? 0,
        activeMisconceptionDescription: misconception?.description ?? null,
      }),
      impact: getQueueImpact(block.blockType),
    };
  });
}

export async function loadMasteryTopics(
  learnerId: string,
  db: Database
): Promise<MasteryTopic[]> {
  const rows = await db
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      masteryLevel: learnerTopicState.masteryLevel,
      qualificationVersionId: topics.qualificationVersionId,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(eq(learnerTopicState.learnerId, learnerId));

  return rows.map((r) => ({
    topicId: r.topicId,
    topicName: r.topicName,
    masteryLevel: Number(r.masteryLevel),
    qualificationVersionId: r.qualificationVersionId,
  }));
}
