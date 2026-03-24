import { eq, and, gte, sql, or, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  studyBlocks,
  studySessions,
  blockAttempts,
  learnerTopicState,
  safetyFlags,
  topics,
  topicEdges,
} from "@/db/schema";
import type { LearnerId, TopicId, BlockType } from "@/lib/types";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReintroductionStrategy {
  approach: "connect_to_strength" | "reduce_difficulty" | "change_block_type";
  suggestedBlockType: BlockType;
  rationale: string;
}

export interface AvoidedTopic {
  topicId: TopicId;
  topicName: string;
  scheduledCount: number;
  skippedCount: number;
  lastScheduledAt: Date;
  reintroductionStrategy: ReintroductionStrategy;
}

export interface EngagementTrend {
  direction: "improving" | "stable" | "declining";
  sessionDurationTrend: number;
  gapTrend: number;
  confidenceTrend: number;
  recentAvgDurationMinutes: number;
  earlierAvgDurationMinutes: number;
  recentAvgGapDays: number;
  earlierAvgGapDays: number;
}

export interface PeakHour {
  hour: number;
  avgScore: number;
  sessionCount: number;
}

export interface OverRelianceSignal {
  topicId: TopicId;
  topicName: string;
  totalAttempts: number;
  helpBeforeAttemptCount: number;
  helpBeforeAttemptRate: number;
}

export interface SafetyFlagResult {
  id: string;
  flagType: "disengagement" | "avoidance" | "distress" | "overreliance";
  severity: "low" | "medium" | "high";
  description: string;
}

export interface BehaviourReport {
  avoidedTopics: AvoidedTopic[];
  engagementTrend: EngagementTrend;
  peakHours: PeakHour[];
  overRelianceSignals: OverRelianceSignal[];
  safetyFlags: SafetyFlagResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AVOIDANCE_MIN_SCHEDULED = 3;
const AVOIDANCE_MIN_SKIPPED = 2;
const ENGAGEMENT_LOOKBACK_DAYS = 28;
const ENGAGEMENT_HALF_WINDOW_DAYS = 14;
const OVERRELIANCE_MIN_ATTEMPTS = 5;
const OVERRELIANCE_MIN_RATE = 0.5;
const PEAK_HOURS_MIN_SESSIONS = 2;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function detectPatterns(
  db: Database,
  learnerId: LearnerId,
): Promise<BehaviourReport> {
  const [avoidedTopics, engagementTrend, peakHours, overRelianceSignals] =
    await Promise.all([
      detectAvoidedTopics(db, learnerId),
      detectEngagementTrend(db, learnerId),
      detectPeakHours(db, learnerId),
      detectOverReliance(db, learnerId),
    ]);

  const safetyFlagResults = await writeSafetyFlags(db, learnerId, {
    avoidedTopics,
    engagementTrend,
    overRelianceSignals,
  });

  return {
    avoidedTopics,
    engagementTrend,
    peakHours,
    overRelianceSignals,
    safetyFlags: safetyFlagResults,
  };
}

// ---------------------------------------------------------------------------
// Avoidance detection
// ---------------------------------------------------------------------------

interface BlockOutcomeRow {
  topicId: string;
  topicName: string;
  scheduledCount: number;
  skippedCount: number;
  abandonedCount: number;
  lastScheduledAt: Date;
}

async function detectAvoidedTopics(
  db: Database,
  learnerId: LearnerId,
): Promise<AvoidedTopic[]> {
  // Get block outcomes per topic: how many were scheduled, skipped, or abandoned
  const blockCounts = await db
    .select({
      topicId: studyBlocks.topicId,
      topicName: topics.name,
      scheduledCount: sql<number>`count(*)::int`,
      skippedCount:
        sql<number>`count(*) FILTER (WHERE ${studyBlocks.status} = 'skipped')::int`,
      lastScheduledAt: sql<Date>`max(${studyBlocks.createdAt})`,
    })
    .from(studyBlocks)
    .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
    .where(eq(studyBlocks.learnerId, learnerId))
    .groupBy(studyBlocks.topicId, topics.name)
    .having(
      and(
        sql`count(*) >= ${AVOIDANCE_MIN_SCHEDULED}`,
        sql`count(*) FILTER (WHERE ${studyBlocks.status} = 'skipped') >= 1`,
      ),
    );

  // Also check for abandoned sessions per topic
  const abandonedCounts = await db
    .select({
      topicId: studyBlocks.topicId,
      abandonedCount: sql<number>`count(*)::int`,
    })
    .from(studySessions)
    .innerJoin(studyBlocks, eq(studySessions.blockId, studyBlocks.id))
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        eq(studySessions.status, "abandoned"),
      ),
    )
    .groupBy(studyBlocks.topicId);

  const abandonedMap = new Map(
    abandonedCounts.map((r) => [r.topicId, r.abandonedCount]),
  );

  // Combine: a topic is avoided if total skipped + abandoned >= threshold
  const candidates: BlockOutcomeRow[] = blockCounts
    .map((row) => ({
      topicId: row.topicId,
      topicName: row.topicName,
      scheduledCount: row.scheduledCount,
      skippedCount: row.skippedCount,
      abandonedCount: abandonedMap.get(row.topicId) ?? 0,
      lastScheduledAt: row.lastScheduledAt,
    }))
    .filter(
      (row) =>
        row.skippedCount + row.abandonedCount >= AVOIDANCE_MIN_SKIPPED,
    );

  if (candidates.length === 0) return [];

  const candidateTopicIds = candidates.map((c) => c.topicId);

  // Batch-load all data needed for reintroduction strategies in 3 queries
  const [allEdges, allMastery, allSkippedTypes] = await Promise.all([
    // All topic edges involving any candidate topic
    db
      .select({
        fromTopicId: topicEdges.fromTopicId,
        toTopicId: topicEdges.toTopicId,
      })
      .from(topicEdges)
      .where(
        or(
          inArray(topicEdges.fromTopicId, candidateTopicIds),
          inArray(topicEdges.toTopicId, candidateTopicIds),
        ),
      ),
    // All learner mastery states (for connecting to strengths)
    db
      .select({
        topicId: learnerTopicState.topicId,
        topicName: topics.name,
        masteryLevel: learnerTopicState.masteryLevel,
      })
      .from(learnerTopicState)
      .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
      .where(eq(learnerTopicState.learnerId, learnerId)),
    // Skipped block types per candidate topic
    db
      .select({
        topicId: studyBlocks.topicId,
        blockType: studyBlocks.blockType,
        count: sql<number>`count(*)::int`,
      })
      .from(studyBlocks)
      .where(
        and(
          eq(studyBlocks.learnerId, learnerId),
          inArray(studyBlocks.topicId, candidateTopicIds),
          eq(studyBlocks.status, "skipped"),
        ),
      )
      .groupBy(studyBlocks.topicId, studyBlocks.blockType),
  ]);

  // Index mastery by topicId for fast lookup
  const masteryByTopicId = new Map(
    allMastery.map((m) => [m.topicId, { topicName: m.topicName, masteryLevel: Number(m.masteryLevel) }]),
  );

  // Index skipped block types by topicId
  const skippedTypesByTopicId = new Map<string, Array<{ blockType: string; count: number }>>();
  for (const row of allSkippedTypes) {
    const existing = skippedTypesByTopicId.get(row.topicId) ?? [];
    existing.push({ blockType: row.blockType, count: row.count });
    skippedTypesByTopicId.set(row.topicId, existing);
  }

  // Build reintroduction strategies for each avoided topic (in-memory, no queries)
  const avoidedTopics: AvoidedTopic[] = candidates.map((candidate) => {
    const strategy = buildReintroductionStrategy(
      candidate.topicId,
      allEdges,
      masteryByTopicId,
      skippedTypesByTopicId.get(candidate.topicId) ?? [],
    );
    return {
      topicId: candidate.topicId as TopicId,
      topicName: candidate.topicName,
      scheduledCount: candidate.scheduledCount,
      skippedCount: candidate.skippedCount + candidate.abandonedCount,
      lastScheduledAt: candidate.lastScheduledAt,
      reintroductionStrategy: strategy,
    };
  });

  return avoidedTopics;
}

// ---------------------------------------------------------------------------
// Reintroduction strategy (pure, no DB queries)
// ---------------------------------------------------------------------------

function buildReintroductionStrategy(
  avoidedTopicId: string,
  allEdges: Array<{ fromTopicId: string; toTopicId: string }>,
  masteryByTopicId: Map<string, { topicName: string; masteryLevel: number }>,
  skippedBlockTypes: Array<{ blockType: string; count: number }>,
): ReintroductionStrategy {
  // 1. Find related topics via topic_edges
  const relatedTopicIds = allEdges
    .filter(
      (e) =>
        e.fromTopicId === avoidedTopicId || e.toTopicId === avoidedTopicId,
    )
    .map((e) =>
      e.fromTopicId === avoidedTopicId ? e.toTopicId : e.fromTopicId,
    );

  // 2. Check for related topics with strong mastery
  const strongRelated = relatedTopicIds
    .map((id) => masteryByTopicId.get(id))
    .filter(
      (m): m is { topicName: string; masteryLevel: number } =>
        m !== undefined && m.masteryLevel >= 0.6,
    )
    .sort((a, b) => b.masteryLevel - a.masteryLevel);

  if (strongRelated.length > 0) {
    return {
      approach: "connect_to_strength",
      suggestedBlockType: "worked_example",
      rationale: `You're doing well with ${strongRelated[0].topicName} — let's use that as a foundation to build confidence here. We'll start with a ${BLOCK_TYPE_LABELS.worked_example} that connects the concepts.`,
    };
  }

  // 3. Check what block types were skipped — suggest a different one
  if (skippedBlockTypes.length > 0) {
    const mostSkipped = [...skippedBlockTypes].sort(
      (a, b) => b.count - a.count,
    )[0];
    const alternatives: BlockType[] = [
      "worked_example",
      "explanation",
      "retrieval_drill",
    ];
    const suggested =
      alternatives.find((a) => a !== mostSkipped.blockType) ??
      "worked_example";

    return {
      approach: "change_block_type",
      suggestedBlockType: suggested,
      rationale: `Let's try a different approach to this topic. A ${BLOCK_TYPE_LABELS[suggested]} might help it click in a way that feels more natural.`,
    };
  }

  // 4. Default: gentle re-entry with reduced difficulty
  return {
    approach: "reduce_difficulty",
    suggestedBlockType: "worked_example",
    rationale:
      "Let's take a gentler approach to this topic. We'll start with a Worked Example to rebuild confidence before moving to practice questions.",
  };
}

// ---------------------------------------------------------------------------
// Engagement trend
// ---------------------------------------------------------------------------

async function detectEngagementTrend(
  db: Database,
  learnerId: LearnerId,
): Promise<EngagementTrend> {
  const now = new Date();
  const recentCutoff = new Date(
    now.getTime() - ENGAGEMENT_HALF_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const earlierCutoff = new Date(
    now.getTime() - ENGAGEMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  // Fetch all sessions in the lookback window
  const sessions = await db
    .select({
      startedAt: studySessions.startedAt,
      totalDurationMinutes: studySessions.totalDurationMinutes,
      status: studySessions.status,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, earlierCutoff),
      ),
    )
    .orderBy(studySessions.startedAt);

  const completedSessions = sessions.filter(
    (s) => s.status === "completed" || s.status === "abandoned",
  );

  const recentSessions = completedSessions.filter(
    (s) => s.startedAt >= recentCutoff,
  );
  const earlierSessions = completedSessions.filter(
    (s) => s.startedAt < recentCutoff,
  );

  const recentAvgDuration = avgDuration(recentSessions);
  const earlierAvgDuration = avgDuration(earlierSessions);
  const durationTrend = earlierAvgDuration > 0
    ? recentAvgDuration - earlierAvgDuration
    : 0;

  const recentAvgGap = avgGapDays(recentSessions);
  const earlierAvgGap = avgGapDays(earlierSessions);
  const gapTrend = earlierAvgGap > 0 ? recentAvgGap - earlierAvgGap : 0;

  // Confidence trend from block attempts
  const confidenceData = await db
    .select({
      startedAt: blockAttempts.startedAt,
      confidenceAfter: blockAttempts.confidenceAfter,
    })
    .from(blockAttempts)
    .innerJoin(studyBlocks, eq(blockAttempts.blockId, studyBlocks.id))
    .where(
      and(
        eq(studyBlocks.learnerId, learnerId),
        gte(blockAttempts.startedAt, earlierCutoff),
      ),
    )
    .orderBy(blockAttempts.startedAt);

  const recentConfidence = confidenceData
    .filter((c) => c.startedAt >= recentCutoff && c.confidenceAfter !== null)
    .map((c) => Number(c.confidenceAfter));
  const earlierConfidence = confidenceData
    .filter((c) => c.startedAt < recentCutoff && c.confidenceAfter !== null)
    .map((c) => Number(c.confidenceAfter));

  const recentAvgConf = avg(recentConfidence);
  const earlierAvgConf = avg(earlierConfidence);
  const confidenceTrend = earlierAvgConf > 0
    ? recentAvgConf - earlierAvgConf
    : 0;

  // Determine overall direction
  let direction: EngagementTrend["direction"] = "stable";
  const declineSignals =
    (durationTrend < -5 ? 1 : 0) +
    (gapTrend > 1 ? 1 : 0) +
    (confidenceTrend < -0.1 ? 1 : 0);
  const improveSignals =
    (durationTrend > 5 ? 1 : 0) +
    (gapTrend < -1 ? 1 : 0) +
    (confidenceTrend > 0.1 ? 1 : 0);

  if (declineSignals >= 2) direction = "declining";
  else if (improveSignals >= 2) direction = "improving";

  return {
    direction,
    sessionDurationTrend: round2(durationTrend),
    gapTrend: round2(gapTrend),
    confidenceTrend: round2(confidenceTrend),
    recentAvgDurationMinutes: round2(recentAvgDuration),
    earlierAvgDurationMinutes: round2(earlierAvgDuration),
    recentAvgGapDays: round2(recentAvgGap),
    earlierAvgGapDays: round2(earlierAvgGap),
  };
}

function avgDuration(
  sessions: Array<{ totalDurationMinutes: number | null }>,
): number {
  const durations = sessions
    .map((s) => s.totalDurationMinutes)
    .filter((d): d is number => d !== null && d > 0);
  return avg(durations);
}

function avgGapDays(
  sessions: Array<{ startedAt: Date }>,
): number {
  if (sessions.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sessions.length; i++) {
    const gapMs =
      sessions[i].startedAt.getTime() - sessions[i - 1].startedAt.getTime();
    gaps.push(gapMs / (24 * 60 * 60 * 1000));
  }
  return avg(gaps);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Peak hours
// ---------------------------------------------------------------------------

async function detectPeakHours(
  db: Database,
  learnerId: LearnerId,
): Promise<PeakHour[]> {
  const hourStats = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${blockAttempts.startedAt})::int`,
      avgScore:
        sql<number>`round(avg(${blockAttempts.score})::numeric, 2)::float`,
      sessionCount: sql<number>`count(*)::int`,
    })
    .from(blockAttempts)
    .innerJoin(studyBlocks, eq(blockAttempts.blockId, studyBlocks.id))
    .where(
      and(
        eq(studyBlocks.learnerId, learnerId),
        sql`${blockAttempts.score} IS NOT NULL`,
      ),
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${blockAttempts.startedAt})`)
    .having(sql`count(*) >= ${PEAK_HOURS_MIN_SESSIONS}`);

  return hourStats
    .map((row) => ({
      hour: row.hour,
      avgScore: row.avgScore,
      sessionCount: row.sessionCount,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

// ---------------------------------------------------------------------------
// Over-reliance signals
// ---------------------------------------------------------------------------

async function detectOverReliance(
  db: Database,
  learnerId: LearnerId,
): Promise<OverRelianceSignal[]> {
  const helpStats = await db
    .select({
      topicId: studyBlocks.topicId,
      topicName: topics.name,
      totalAttempts: sql<number>`count(*)::int`,
      helpBeforeAttemptCount:
        sql<number>`count(*) FILTER (WHERE ${blockAttempts.helpRequested} = true AND ${blockAttempts.helpTiming} = 'before_attempt')::int`,
    })
    .from(blockAttempts)
    .innerJoin(studyBlocks, eq(blockAttempts.blockId, studyBlocks.id))
    .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
    .where(eq(studyBlocks.learnerId, learnerId))
    .groupBy(studyBlocks.topicId, topics.name)
    .having(sql`count(*) >= ${OVERRELIANCE_MIN_ATTEMPTS}`);

  return helpStats
    .filter((row) => {
      const rate = row.helpBeforeAttemptCount / row.totalAttempts;
      return rate >= OVERRELIANCE_MIN_RATE;
    })
    .map((row) => ({
      topicId: row.topicId as TopicId,
      topicName: row.topicName,
      totalAttempts: row.totalAttempts,
      helpBeforeAttemptCount: row.helpBeforeAttemptCount,
      helpBeforeAttemptRate: round2(
        row.helpBeforeAttemptCount / row.totalAttempts,
      ),
    }));
}

// ---------------------------------------------------------------------------
// Safety flag writing
// ---------------------------------------------------------------------------

type FlagType = "disengagement" | "avoidance" | "distress" | "overreliance";
type FlagSeverity = "low" | "medium" | "high";

async function writeSafetyFlags(
  db: Database,
  learnerId: LearnerId,
  data: {
    avoidedTopics: AvoidedTopic[];
    engagementTrend: EngagementTrend;
    overRelianceSignals: OverRelianceSignal[];
  },
): Promise<SafetyFlagResult[]> {
  const flags: Array<{
    flagType: FlagType;
    severity: FlagSeverity;
    description: string;
    evidence: Record<string, unknown>;
  }> = [];

  // Avoidance flags
  if (data.avoidedTopics.length > 0) {
    const topicNames = data.avoidedTopics.map((t) => t.topicName);
    const severity: FlagSeverity =
      data.avoidedTopics.length >= 3 ? "high" : "medium";
    flags.push({
      flagType: "avoidance",
      severity,
      description: `Persistent avoidance detected for ${data.avoidedTopics.length} topic(s): ${topicNames.join(", ")}.`,
      evidence: {
        topics: data.avoidedTopics.map((t) => ({
          topicId: t.topicId,
          topicName: t.topicName,
          scheduledCount: t.scheduledCount,
          skippedCount: t.skippedCount,
        })),
      },
    });
  }

  // Engagement decline → disengagement flag
  if (data.engagementTrend.direction === "declining") {
    const severity: FlagSeverity =
      data.engagementTrend.gapTrend > 3 ||
      data.engagementTrend.sessionDurationTrend < -10
        ? "high"
        : "medium";
    flags.push({
      flagType: "disengagement",
      severity,
      description:
        "Engagement is declining: sessions are getting shorter and gaps between study are growing.",
      evidence: {
        sessionDurationTrend: data.engagementTrend.sessionDurationTrend,
        gapTrend: data.engagementTrend.gapTrend,
        confidenceTrend: data.engagementTrend.confidenceTrend,
      },
    });
  }

  // Over-reliance flags
  if (data.overRelianceSignals.length > 0) {
    const topicNames = data.overRelianceSignals.map((s) => s.topicName);
    const maxRate = Math.max(
      ...data.overRelianceSignals.map((s) => s.helpBeforeAttemptRate),
    );
    const severity: FlagSeverity = maxRate >= 0.8 ? "high" : "medium";
    flags.push({
      flagType: "overreliance",
      severity,
      description: `Over-reliance on hints detected in ${data.overRelianceSignals.length} topic(s): ${topicNames.join(", ")}. Hints are frequently requested before attempting answers.`,
      evidence: {
        topics: data.overRelianceSignals.map((s) => ({
          topicId: s.topicId,
          topicName: s.topicName,
          totalAttempts: s.totalAttempts,
          helpBeforeRate: s.helpBeforeAttemptRate,
        })),
      },
    });
  }

  // Write flags to DB, avoiding duplicates with existing unresolved flags
  const results: SafetyFlagResult[] = [];

  for (const flag of flags) {
    // Check for existing unresolved flag of the same type
    const existing = await db
      .select({ id: safetyFlags.id })
      .from(safetyFlags)
      .where(
        and(
          eq(safetyFlags.learnerId, learnerId),
          eq(safetyFlags.flagType, flag.flagType),
          eq(safetyFlags.resolved, false),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Flag already exists, don't duplicate
      results.push({
        id: existing[0].id,
        flagType: flag.flagType,
        severity: flag.severity,
        description: flag.description,
      });
      continue;
    }

    const [inserted] = await db
      .insert(safetyFlags)
      .values({
        learnerId,
        flagType: flag.flagType,
        severity: flag.severity,
        description: flag.description,
        evidence: flag.evidence,
      })
      .returning({ id: safetyFlags.id });

    results.push({
      id: inserted.id,
      flagType: flag.flagType,
      severity: flag.severity,
      description: flag.description,
    });
  }

  return results;
}
