import { eq, and, sql, count, sum, desc } from "drizzle-orm";
import {
  misconceptionEvents,
  learnerTopicState,
  studySessions,
  topics,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import type { TopicId } from "@/lib/types";
import type { JourneyData, MisconceptionThread, JourneyStats } from "./types";
import { extractMilestones } from "./utils";

export async function loadJourneyData(
  learnerId: string,
  db: Database
): Promise<JourneyData> {
  const [threads, stats] = await Promise.all([
    loadMisconceptionThreads(learnerId, db),
    loadJourneyStats(learnerId, db),
  ]);

  const conquered = threads.filter((t) => t.resolved);
  const active = threads.filter((t) => !t.resolved);
  const milestones = extractMilestones(conquered);

  return { conquered, active, milestones, stats };
}

export async function loadMisconceptionThreads(
  learnerId: string,
  db: Database
): Promise<MisconceptionThread[]> {
  const rows = await db
    .select({
      description: misconceptionEvents.description,
      topicId: misconceptionEvents.topicId,
      topicName: topics.name,
      severity: sql<number>`max(${misconceptionEvents.severity})`,
      firstSeenAt: sql<Date>`min(${misconceptionEvents.createdAt})`,
      lastSeenAt: sql<Date>`max(${misconceptionEvents.createdAt})`,
      occurrenceCount: count(misconceptionEvents.id),
      resolvedCount:
        sql<number>`count(*) filter (where ${misconceptionEvents.resolved} = true)`,
      resolvedAt:
        sql<Date | null>`max(${misconceptionEvents.resolvedAt})`,
    })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(eq(misconceptionEvents.learnerId, learnerId))
    .groupBy(
      misconceptionEvents.description,
      misconceptionEvents.topicId,
      topics.name
    )
    .orderBy(desc(sql`max(${misconceptionEvents.createdAt})`));

  return rows.map((r, idx) => ({
    id: `thread-${idx}-${r.topicId}`,
    description: r.description,
    topicId: r.topicId as TopicId,
    topicName: r.topicName,
    severity: Number(r.severity),
    firstSeenAt: new Date(r.firstSeenAt),
    lastSeenAt: new Date(r.lastSeenAt),
    occurrenceCount: Number(r.occurrenceCount),
    resolved: Number(r.resolvedCount) > 0,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
  }));
}

export async function loadJourneyStats(
  learnerId: string,
  db: Database
): Promise<JourneyStats> {
  const [sessionResults, miscResults, topicStateRows] = await Promise.all([
    db
      .select({
        sessionsCompleted: count(studySessions.id),
        totalStudyMinutes: sum(studySessions.totalDurationMinutes),
      })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.learnerId, learnerId),
          eq(studySessions.status, "completed")
        )
      ),
    db
      .select({
        total: count(
          sql`distinct ${misconceptionEvents.description} || '::' || ${misconceptionEvents.topicId}`
        ),
        resolved:
          sql<number>`count(distinct ${misconceptionEvents.description} || '::' || ${misconceptionEvents.topicId}) filter (where ${misconceptionEvents.resolved} = true)`,
      })
      .from(misconceptionEvents)
      .where(eq(misconceptionEvents.learnerId, learnerId)),
    db
      .select({
        masteryLevel: learnerTopicState.masteryLevel,
      })
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learnerId)),
  ]);

  const sessionsCompleted = sessionResults[0]?.sessionsCompleted ?? 0;
  const totalStudyMinutes = Number(sessionResults[0]?.totalStudyMinutes ?? 0);
  const misconceptionsTotal = Number(miscResults[0]?.total ?? 0);
  const misconceptionsConquered = Number(miscResults[0]?.resolved ?? 0);

  const totalTopics = topicStateRows.length;
  const topicsCovered = topicStateRows.filter(
    (r) => Number(r.masteryLevel) > 0
  ).length;
  const specCoveragePercent =
    totalTopics > 0
      ? Math.round((topicsCovered / totalTopics) * 100 * 10) / 10
      : 0;

  return {
    sessionsCompleted,
    totalStudyMinutes,
    misconceptionsTotal,
    misconceptionsConquered,
    specCoveragePercent,
    topicsCovered,
    totalTopics,
  };
}
