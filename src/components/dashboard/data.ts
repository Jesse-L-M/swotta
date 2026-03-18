import { eq, and, sql, count, sum } from "drizzle-orm";
import {
  learners,
  learnerQualifications,
  qualifications,
  qualificationVersions,
  examBoards,
  subjects,
  learnerTopicState,
  studySessions,
  topics,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import type {
  DashboardQualification,
  DashboardStats,
  MasteryTopic,
} from "./types";

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
