import fs from "node:fs";
import path from "node:path";
import { db as prodDb, type Database } from "@/lib/db";
import { structuredLog } from "@/lib/logger";
import type {
  LearnerId,
  UserId,
  TopicId,
  QualificationVersionId,
  TopicMastery,
  WeeklyReportData,
} from "@/lib/types";
import {
  studySessions,
  learnerTopicState,
  misconceptionEvents,
  weeklyReports,
  notificationEvents,
  guardianLinks,
  learnerQualifications,
  qualificationVersions,
  qualifications,
  topics,
  users,
  learners,
} from "@/db/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail as defaultSendEmail, type EmailOptions, type EmailResult } from "@/email/send";
import { renderWeeklyReportEmail } from "@/email/templates/weekly-report";
import { detectPatterns, type BehaviourReport } from "@/engine/behaviour";
import { calculateCalibration, type CalibrationResult } from "@/engine/calibration";
import {
  findRecentMisconceptionClusters,
  type MisconceptionRootCauseCluster,
} from "@/engine/misconception-clustering";
import { getTechniqueMastery, type TechniqueMastery } from "@/engine/technique";
import { getExamPhase, type ExamPhase, type ExamPhaseName, calculateDaysToExam } from "@/engine/proximity";

// ---------------------------------------------------------------------------
// Dependency injection for testability
// ---------------------------------------------------------------------------

export interface ReportingDeps {
  db: Database;
  aiSummarize: (prompt: string) => Promise<string>;
  sendEmailFn: (options: EmailOptions) => Promise<EmailResult>;
  detectPatternsFn?: (db: Database, learnerId: LearnerId) => Promise<BehaviourReport>;
  calculateCalibrationFn?: (db: Database, learnerId: LearnerId) => Promise<CalibrationResult>;
  getTechniqueMasteryFn?: (db: Database, learnerId: LearnerId) => Promise<TechniqueMastery[]>;
  getExamPhaseFn?: (db: Database, learnerId: LearnerId, qualVersionId: QualificationVersionId) => Promise<ExamPhase>;
}

async function defaultAiSummarize(prompt: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  if (block.type === "text") return block.text;
  return "";
}

function defaultDeps(): ReportingDeps {
  return {
    db: prodDb,
    aiSummarize: defaultAiSummarize,
    sendEmailFn: defaultSendEmail,
    detectPatternsFn: detectPatterns,
    calculateCalibrationFn: calculateCalibration,
    getTechniqueMasteryFn: getTechniqueMastery,
    getExamPhaseFn: getExamPhase,
  };
}

function resolveDeps(partial?: Partial<ReportingDeps>): ReportingDeps {
  return { ...defaultDeps(), ...partial };
}

// ---------------------------------------------------------------------------
// generateWeeklyReport
// ---------------------------------------------------------------------------

export async function generateWeeklyReport(
  learnerId: LearnerId,
  periodStart: Date,
  periodEnd: Date,
  deps?: Partial<ReportingDeps>,
): Promise<WeeklyReportData & { reportId: string }> {
  const { db: database, aiSummarize } = resolveDeps(deps);

  // 1. Get completed sessions in the period
  const sessions = await database
    .select()
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, periodStart),
        lte(studySessions.startedAt, periodEnd),
        eq(studySessions.status, "completed"),
      ),
    );

  const sessionsCompleted = sessions.length;
  const totalStudyMinutes = sessions.reduce(
    (sum, s) => sum + (s.totalDurationMinutes ?? 0),
    0,
  );

  // 2. Collect unique topic IDs from sessions
  const topicIdSet = new Set<string>();
  for (const session of sessions) {
    if (session.topicsCovered) {
      for (const tid of session.topicsCovered) {
        if (tid) topicIdSet.add(tid);
      }
    }
  }
  const topicsReviewed = topicIdSet.size;
  const reviewedTopicIds = Array.from(topicIdSet);

  // 3. Current mastery for reviewed topics
  let currentMastery: Array<{
    topicId: string;
    topicName: string;
    masteryLevel: string;
    confidence: string;
    nextReviewAt: Date | null;
    streak: number;
  }> = [];

  if (reviewedTopicIds.length > 0) {
    currentMastery = await database
      .select({
        topicId: learnerTopicState.topicId,
        topicName: topics.name,
        masteryLevel: learnerTopicState.masteryLevel,
        confidence: learnerTopicState.confidence,
        nextReviewAt: learnerTopicState.nextReviewAt,
        streak: learnerTopicState.streak,
      })
      .from(learnerTopicState)
      .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
      .where(
        and(
          eq(learnerTopicState.learnerId, learnerId),
          inArray(learnerTopicState.topicId, reviewedTopicIds),
        ),
      );
  }

  // 4. Get previous report for baseline mastery
  const [previousReport] = await database
    .select()
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.learnerId, learnerId),
        lte(weeklyReports.periodEnd, periodStart.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(weeklyReports.periodEnd))
    .limit(1);

  const previousMasteryMap = new Map<string, number>();
  if (previousReport?.masteryChanges) {
    const prev = previousReport.masteryChanges as Array<{
      topicId: string;
      after: number;
    }>;
    for (const entry of prev) {
      previousMasteryMap.set(entry.topicId, entry.after);
    }
  }

  // 5. Compute mastery changes
  const masteryChanges = currentMastery.map((m) => {
    const after = Number(m.masteryLevel);
    const before = previousMasteryMap.get(m.topicId) ?? 0;
    return {
      topicId: m.topicId as TopicId,
      topicName: m.topicName,
      before,
      after,
      delta: Math.round((after - before) * 1000) / 1000,
    };
  });

  // 6. Detect flags
  const flags = await detectFlags(learnerId, 7, deps);

  // 7. Get learner name for the summary prompt
  const [learnerRow] = await database
    .select({ displayName: learners.displayName })
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);
  const learnerName = learnerRow?.displayName ?? "Student";

  // 8. Generate AI summary
  const summaryPrompt = buildReportSummaryPrompt({
    learnerName,
    periodStart,
    periodEnd,
    sessionsCompleted,
    totalStudyMinutes,
    topicsReviewed,
    masteryChanges,
    flags,
  });
  const summary = await aiSummarize(summaryPrompt);

  // 9. Persist report (flags are stored in the report's JSON column;
  //    the detect-flags cron owns safetyFlags table inserts)
  const [report] = await database
    .insert(weeklyReports)
    .values({
      learnerId,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      summary,
      masteryChanges: masteryChanges as unknown as Record<string, unknown>,
      sessionsCompleted,
      totalStudyMinutes,
      topicsReviewed,
      flags: flags.map((f) => ({
        type: f.type,
        description: f.description,
        severity: f.severity,
      })) as unknown as Record<string, unknown>,
      sentTo: [] as unknown as Record<string, unknown>,
    })
    .returning();

  const reportData: WeeklyReportData & { reportId: string } = {
    reportId: report.id,
    learnerId,
    periodStart,
    periodEnd,
    sessionsCompleted,
    totalStudyMinutes,
    topicsReviewed,
    masteryChanges,
    flags: flags.map((f) => ({
      type: f.type,
      description: f.description,
      severity: f.severity,
    })),
    summary,
  };

  return reportData;
}

// ---------------------------------------------------------------------------
// detectFlags
// ---------------------------------------------------------------------------

type FlagSeverity = "low" | "medium" | "high";

export interface DetectedFlag {
  type: string;
  description: string;
  severity: FlagSeverity;
  evidence: Record<string, unknown>;
}

interface SingleTopicMisconceptionCluster {
  topicId: string;
  topicName: string;
  count: number;
}

export async function detectFlags(
  learnerId: LearnerId,
  lookbackDays = 7,
  deps?: Partial<ReportingDeps>,
): Promise<DetectedFlag[]> {
  const { db: database } = resolveDeps(deps);
  const flags: DetectedFlag[] = [];
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // --- 1. Sudden disengagement: no completed sessions for N days ---
  const recentSessions = await database
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, lookbackDate),
        eq(studySessions.status, "completed"),
      ),
    )
    .limit(1);

  if (recentSessions.length === 0) {
    const lastSession = await database
      .select({ startedAt: studySessions.startedAt })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.learnerId, learnerId),
          eq(studySessions.status, "completed"),
        ),
      )
      .orderBy(desc(studySessions.startedAt))
      .limit(1);

    const daysSinceLastSession = lastSession.length > 0
      ? Math.floor((now.getTime() - lastSession[0].startedAt.getTime()) / (24 * 60 * 60 * 1000))
      : lookbackDays;

    const severity: FlagSeverity = daysSinceLastSession >= 7 ? "high" : daysSinceLastSession >= 3 ? "medium" : "low";

    flags.push({
      type: "disengagement",
      description: `No study sessions in the last ${daysSinceLastSession} days.`,
      severity,
      evidence: { daysSinceLastSession, lookbackDays },
    });
  }

  // --- 2. Chronic avoidance: topics overdue for review ---
  const overdueTopics = await database
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      nextReviewAt: learnerTopicState.nextReviewAt,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        lte(learnerTopicState.nextReviewAt, now),
      ),
    );

  if (overdueTopics.length >= 5) {
    const severity: FlagSeverity = overdueTopics.length >= 10 ? "high" : "medium";
    const topicNames = overdueTopics.slice(0, 5).map((t) => t.topicName);
    flags.push({
      type: "avoidance",
      description: `${overdueTopics.length} topics are overdue for review, including: ${topicNames.join(", ")}.`,
      severity,
      evidence: {
        overdueCount: overdueTopics.length,
        topicNames,
      },
    });
  }

  // --- 3. Rapid mastery decay: topics with recent forgotten retention ---
  const decayedTopics = await database
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      masteryLevel: learnerTopicState.masteryLevel,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        lte(learnerTopicState.masteryLevel, "0.300"),
        gte(learnerTopicState.reviewCount, 3),
      ),
    );

  if (decayedTopics.length >= 3) {
    const severity: FlagSeverity = decayedTopics.length >= 6 ? "high" : "medium";
    const topicNames = decayedTopics.slice(0, 5).map((t) => t.topicName);
    flags.push({
      type: "distress",
      description: `Rapid mastery decay detected in ${decayedTopics.length} topics despite multiple reviews: ${topicNames.join(", ")}.`,
      severity,
      evidence: {
        decayedCount: decayedTopics.length,
        topicNames,
      },
    });
  }

  // --- 4. Repeated misconception clusters ---
  const crossTopicClusters = await findRecentMisconceptionClusters(
    database,
    learnerId,
    {
      lookbackDays,
      minEvents: 2,
      minTopics: 2,
      now,
    },
  );
  const actionableRootCauseClusters = crossTopicClusters.filter(
    (cluster) => cluster.signal.totalEvents >= 3,
  );

  const singleTopicClusters = (await database
    .select({
      topicId: misconceptionEvents.topicId,
      topicName: topics.name,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        gte(misconceptionEvents.createdAt, lookbackDate),
        eq(misconceptionEvents.resolved, false),
      ),
    )
    .groupBy(misconceptionEvents.topicId, topics.name)
    .having(sql`count(*) >= 3`)).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.topicName.localeCompare(right.topicName);
  });

  if (actionableRootCauseClusters.length > 0 || singleTopicClusters.length > 0) {
    const severity: FlagSeverity =
      actionableRootCauseClusters.some((cluster) => cluster.signal.level === "high") ||
      singleTopicClusters.some((cluster) => cluster.count >= 5)
        ? "high"
        : "medium";

    flags.push({
      type: "distress",
      description: buildMisconceptionDistressDescription(
        actionableRootCauseClusters,
        singleTopicClusters,
      ),
      severity,
      evidence: {
        crossTopicClusters: actionableRootCauseClusters,
        singleTopicClusters: singleTopicClusters.map((cluster) => ({
          topicId: cluster.topicId,
          topicName: cluster.topicName,
          count: cluster.count,
        })),
      },
    });
  }

  return flags;
}

function buildMisconceptionDistressDescription(
  crossTopicClusters: MisconceptionRootCauseCluster[],
  singleTopicClusters: SingleTopicMisconceptionCluster[],
): string {
  const crossTopicDetails = crossTopicClusters.map((cluster) => {
    const topicNames = cluster.memberTopics.map((topic) => topic.topicName);
    return `${cluster.rootCauseLabel} (${topicNames.join(", ")}; ${cluster.signal.totalEvents}x)`;
  });
  const singleTopicDetails = singleTopicClusters.map(
    (cluster) => `${cluster.topicName} (${cluster.count}x)`,
  );

  if (crossTopicDetails.length > 0 && singleTopicDetails.length === 0) {
    return `Repeated root-cause misconceptions detected across topics: ${crossTopicDetails.join("; ")}.`;
  }

  if (crossTopicDetails.length === 0 && singleTopicDetails.length > 0) {
    return `Repeated misconceptions detected: ${singleTopicDetails.join(", ")}.`;
  }

  return [
    "Repeated misconceptions detected.",
    `Cross-topic root causes: ${crossTopicDetails.join("; ")}.`,
    `Concentrated single-topic struggles: ${singleTopicDetails.join(", ")}.`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// sendWeeklyReport
// ---------------------------------------------------------------------------

export async function sendWeeklyReport(
  reportId: string,
  deps?: Partial<ReportingDeps>,
): Promise<{ sentTo: Array<{ userId: string; channel: string }> }> {
  const { db: database, sendEmailFn } = resolveDeps(deps);

  // 1. Look up the report
  const [report] = await database
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new Error(`Report not found: ${reportId}`);
  }

  // 2. Get learner info
  const [learnerRow] = await database
    .select({ displayName: learners.displayName })
    .from(learners)
    .where(eq(learners.id, report.learnerId))
    .limit(1);
  const learnerName = learnerRow?.displayName ?? "Student";

  // 3. Get guardians who receive weekly reports
  const guardians = await database
    .select({
      guardianUserId: guardianLinks.guardianUserId,
      email: users.email,
      name: users.name,
    })
    .from(guardianLinks)
    .innerJoin(users, eq(guardianLinks.guardianUserId, users.id))
    .where(
      and(
        eq(guardianLinks.learnerId, report.learnerId),
        eq(guardianLinks.receivesWeeklyReport, true),
      ),
    );

  // 4. Check existing sentTo for idempotency on retry
  const existingSentTo = (report.sentTo ?? []) as Array<{
    userId: string;
    channel: string;
    sentAt: string;
  }>;
  const alreadySentUserIds = new Set(existingSentTo.map((s) => s.userId));
  const allSentTo = [...existingSentTo];
  const sentTo: Array<{ userId: string; channel: string }> = [];

  // 5. Reconstruct WeeklyReportData for the email template
  const reportData: WeeklyReportData = {
    learnerId: report.learnerId as LearnerId,
    periodStart: new Date(report.periodStart),
    periodEnd: new Date(report.periodEnd),
    sessionsCompleted: report.sessionsCompleted,
    totalStudyMinutes: report.totalStudyMinutes,
    topicsReviewed: report.topicsReviewed,
    masteryChanges: (report.masteryChanges ?? []) as WeeklyReportData["masteryChanges"],
    flags: (report.flags ?? []) as WeeklyReportData["flags"],
    summary: report.summary,
  };

  // 6. Send emails (skip guardians already sent to on a previous attempt)
  for (const guardian of guardians) {
    if (alreadySentUserIds.has(guardian.guardianUserId)) {
      sentTo.push({ userId: guardian.guardianUserId, channel: "email" });
      continue;
    }

    const html = await renderWeeklyReportEmail({
      data: reportData,
      learnerName,
    });

    const subject = `${learnerName}'s Weekly Study Report - ${reportData.periodStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${reportData.periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

    await sendEmailFn({
      to: guardian.email,
      subject,
      html,
    });

    // Record notification event
    await database.insert(notificationEvents).values({
      userId: guardian.guardianUserId,
      type: "weekly_report",
      channel: "email",
      subject,
      payload: { reportId, learnerId: report.learnerId } as Record<string, unknown>,
      sentAt: new Date(),
    });

    const entry = {
      userId: guardian.guardianUserId,
      channel: "email",
      sentAt: new Date().toISOString(),
    };
    allSentTo.push(entry);
    sentTo.push({ userId: guardian.guardianUserId, channel: "email" });

    // Persist sentTo incrementally so retries skip already-sent guardians
    await database
      .update(weeklyReports)
      .set({ sentTo: allSentTo as unknown as Record<string, unknown> })
      .where(eq(weeklyReports.id, reportId));
  }

  return { sentTo };
}

// ---------------------------------------------------------------------------
// generateTeacherInsight
// ---------------------------------------------------------------------------

export async function generateTeacherInsight(
  learnerId: LearnerId,
  requestedByUserId: UserId,
  deps?: Partial<ReportingDeps>,
): Promise<{
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  topicBreakdown: TopicMastery[];
}> {
  const { db: database, aiSummarize } = resolveDeps(deps);

  // 1. Get learner info
  const [learnerRow] = await database
    .select({ displayName: learners.displayName })
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);
  const learnerName = learnerRow?.displayName ?? "Student";

  // 2. Get all topic mastery for this learner
  const masteryData = await database
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      masteryLevel: learnerTopicState.masteryLevel,
      confidence: learnerTopicState.confidence,
      nextReviewAt: learnerTopicState.nextReviewAt,
      streak: learnerTopicState.streak,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(eq(learnerTopicState.learnerId, learnerId));

  const now = new Date();
  const topicBreakdown: TopicMastery[] = masteryData.map((m) => ({
    topicId: m.topicId as TopicId,
    topicName: m.topicName,
    masteryLevel: Number(m.masteryLevel),
    confidence: Number(m.confidence),
    nextReviewAt: m.nextReviewAt,
    streak: m.streak,
    isOverdue: m.nextReviewAt !== null && m.nextReviewAt < now,
  }));

  // 3. Get recent session stats (last 30 days) via aggregate
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [sessionStats] = await database
    .select({
      count: sql<number>`count(*)::int`,
      totalMinutes: sql<number>`coalesce(sum(${studySessions.totalDurationMinutes}), 0)::int`,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, thirtyDaysAgo),
        eq(studySessions.status, "completed"),
      ),
    );

  // 4. Get recent misconceptions
  const recentMisconceptions = await database
    .select({
      topicName: topics.name,
      description: misconceptionEvents.description,
      severity: misconceptionEvents.severity,
      resolved: misconceptionEvents.resolved,
    })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        gte(misconceptionEvents.createdAt, thirtyDaysAgo),
      ),
    );

  // 5. Build prompt for AI
  const insightPrompt = buildTeacherInsightPrompt({
    learnerName,
    topicBreakdown,
    sessionsLast30Days: sessionStats?.count ?? 0,
    totalMinutesLast30Days: sessionStats?.totalMinutes ?? 0,
    misconceptions: recentMisconceptions.map((m) => ({
      topicName: m.topicName,
      description: m.description,
      severity: m.severity,
      resolved: m.resolved,
    })),
  });

  const aiResponse = await aiSummarize(insightPrompt);
  const parsed = parseTeacherInsightResponse(aiResponse);

  return {
    summary: parsed.summary,
    strengths: parsed.strengths,
    concerns: parsed.concerns,
    recommendations: parsed.recommendations,
    topicBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

function loadPrompt(filename: string, variables: Record<string, string>): string {
  const filePath = path.join(process.cwd(), "src", "ai", "prompts", filename);
  let template = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface ReportSummaryInput {
  learnerName: string;
  periodStart: Date;
  periodEnd: Date;
  sessionsCompleted: number;
  totalStudyMinutes: number;
  topicsReviewed: number;
  masteryChanges: Array<{
    topicName: string;
    before: number;
    after: number;
    delta: number;
  }>;
  flags: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
}

function buildReportSummaryPrompt(input: ReportSummaryInput): string {
  const improvements = input.masteryChanges
    .filter((m) => m.delta > 0)
    .map((m) => `${m.topicName}: +${Math.round(m.delta * 100)}%`);
  const declines = input.masteryChanges
    .filter((m) => m.delta < 0)
    .map((m) => `${m.topicName}: ${Math.round(m.delta * 100)}%`);

  return loadPrompt("report-summary.md", {
    learnerName: input.learnerName,
    periodRange: `${input.periodStart.toLocaleDateString("en-GB")} to ${input.periodEnd.toLocaleDateString("en-GB")}`,
    sessionsCompleted: String(input.sessionsCompleted),
    totalStudyMinutes: String(input.totalStudyMinutes),
    topicsReviewed: String(input.topicsReviewed),
    improvementsSection:
      improvements.length > 0
        ? `Improvements:\n${improvements.map((i) => `- ${i}`).join("\n")}`
        : "No mastery improvements this week.",
    declinesSection:
      declines.length > 0
        ? `Areas needing attention:\n${declines.map((d) => `- ${d}`).join("\n")}`
        : "",
    flagsSection:
      input.flags.length > 0
        ? `Flags:\n${input.flags.map((f) => `- ${f.type} (${f.severity}): ${f.description}`).join("\n")}`
        : "No concerns flagged this week.",
  });
}

interface TeacherInsightInput {
  learnerName: string;
  topicBreakdown: TopicMastery[];
  sessionsLast30Days: number;
  totalMinutesLast30Days: number;
  misconceptions: Array<{
    topicName: string;
    description: string;
    severity: number;
    resolved: boolean;
  }>;
}

function buildTeacherInsightPrompt(input: TeacherInsightInput): string {
  const strongTopics = input.topicBreakdown
    .filter((t) => t.masteryLevel >= 0.7)
    .map((t) => `${t.topicName} (${Math.round(t.masteryLevel * 100)}%)`);

  const weakTopics = input.topicBreakdown
    .filter((t) => t.masteryLevel < 0.4)
    .map((t) => `${t.topicName} (${Math.round(t.masteryLevel * 100)}%)`);

  const unresolvedMisconceptions = input.misconceptions
    .filter((m) => !m.resolved)
    .map((m) => `${m.topicName}: ${m.description}`);

  return loadPrompt("teacher-insight.md", {
    learnerName: input.learnerName,
    sessionsLast30Days: String(input.sessionsLast30Days),
    totalMinutesLast30Days: String(input.totalMinutesLast30Days),
    topicsTracked: String(input.topicBreakdown.length),
    strongTopicsSection:
      strongTopics.length > 0
        ? `Strong topics: ${strongTopics.join(", ")}`
        : "No topics above 70% mastery.",
    weakTopicsSection:
      weakTopics.length > 0
        ? `Weak topics: ${weakTopics.join(", ")}`
        : "No topics below 40% mastery.",
    misconceptionsSection:
      unresolvedMisconceptions.length > 0
        ? `Unresolved misconceptions:\n${unresolvedMisconceptions.map((m) => `- ${m}`).join("\n")}`
        : "No unresolved misconceptions.",
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTeacherInsightResponse(response: string): {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
} {
  try {
    const parsed = JSON.parse(response) as {
      summary: string;
      strengths: string[];
      concerns: string[];
      recommendations: string[];
    };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : String(parsed.summary ?? ""),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    return {
      summary: response,
      strengths: [],
      concerns: [],
      recommendations: [],
    };
  }
}

type FlagTypeEnum = "disengagement" | "avoidance" | "distress" | "overreliance";

export function mapFlagTypeToEnum(type: string): FlagTypeEnum {
  const validTypes: FlagTypeEnum[] = ["disengagement", "avoidance", "distress", "overreliance"];
  if (validTypes.includes(type as FlagTypeEnum)) {
    return type as FlagTypeEnum;
  }
  return "distress";
}

// ---------------------------------------------------------------------------
// Enhanced report types (Phase 6.4)
// ---------------------------------------------------------------------------

export interface MisconceptionNarrative {
  topicName: string;
  description: string;
  occurrences: number;
  resolved: boolean;
  resolvedAt: Date | null;
  firstSeenAt: Date;
  narrative: string;
}

export interface ExamPhaseContext {
  phase: ExamPhaseName;
  daysToExam: number;
  weeksToExam: number;
  qualificationName: string;
  description: string;
}

export interface ActionableSuggestion {
  category: "avoidance" | "calibration" | "technique" | "engagement" | "misconception" | "exam";
  message: string;
  priority: "high" | "medium" | "low";
}

export interface ReportEnrichment {
  behaviour: BehaviourReport | null;
  calibration: CalibrationResult | null;
  misconceptionNarratives: MisconceptionNarrative[];
  misconceptionClusters?: MisconceptionRootCauseCluster[];
  techniqueMastery: TechniqueMastery[];
  examPhase: ExamPhaseContext | null;
  suggestions: ActionableSuggestion[];
}

export interface EnhancedReportData extends WeeklyReportData {
  reportId: string;
  enrichment: ReportEnrichment;
}

// ---------------------------------------------------------------------------
// generateEnhancedWeeklyReport
// ---------------------------------------------------------------------------

export async function generateEnhancedWeeklyReport(
  learnerId: LearnerId,
  periodStart: Date,
  periodEnd: Date,
  deps?: Partial<ReportingDeps>,
): Promise<EnhancedReportData> {
  const resolved = resolveDeps(deps);
  const { db: database, aiSummarize } = resolved;

  // 1. Get completed sessions in the period (same as generateWeeklyReport)
  const sessions = await database
    .select()
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, periodStart),
        lte(studySessions.startedAt, periodEnd),
        eq(studySessions.status, "completed"),
      ),
    );

  const sessionsCompleted = sessions.length;
  const totalStudyMinutes = sessions.reduce(
    (sum, s) => sum + (s.totalDurationMinutes ?? 0),
    0,
  );

  // 2. Collect unique topic IDs from sessions
  const topicIdSet = new Set<string>();
  for (const session of sessions) {
    if (session.topicsCovered) {
      for (const tid of session.topicsCovered) {
        if (tid) topicIdSet.add(tid);
      }
    }
  }
  const topicsReviewed = topicIdSet.size;
  const reviewedTopicIds = Array.from(topicIdSet);

  // 3. Current mastery for reviewed topics
  let currentMastery: Array<{
    topicId: string;
    topicName: string;
    masteryLevel: string;
    confidence: string;
    nextReviewAt: Date | null;
    streak: number;
  }> = [];

  if (reviewedTopicIds.length > 0) {
    currentMastery = await database
      .select({
        topicId: learnerTopicState.topicId,
        topicName: topics.name,
        masteryLevel: learnerTopicState.masteryLevel,
        confidence: learnerTopicState.confidence,
        nextReviewAt: learnerTopicState.nextReviewAt,
        streak: learnerTopicState.streak,
      })
      .from(learnerTopicState)
      .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
      .where(
        and(
          eq(learnerTopicState.learnerId, learnerId),
          inArray(learnerTopicState.topicId, reviewedTopicIds),
        ),
      );
  }

  // 4. Get previous report for baseline mastery
  const [previousReport] = await database
    .select()
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.learnerId, learnerId),
        lte(weeklyReports.periodEnd, periodStart.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(weeklyReports.periodEnd))
    .limit(1);

  const previousMasteryMap = new Map<string, number>();
  if (previousReport?.masteryChanges) {
    const prev = previousReport.masteryChanges as Array<{
      topicId: string;
      after: number;
    }>;
    for (const entry of prev) {
      previousMasteryMap.set(entry.topicId, entry.after);
    }
  }

  // 5. Compute mastery changes
  const masteryChanges = currentMastery.map((m) => {
    const after = Number(m.masteryLevel);
    const before = previousMasteryMap.get(m.topicId) ?? 0;
    return {
      topicId: m.topicId as TopicId,
      topicName: m.topicName,
      before,
      after,
      delta: Math.round((after - before) * 1000) / 1000,
    };
  });

  // 6. Detect flags
  const flags = await detectFlags(learnerId, 7, deps);

  // 7. Get learner name
  const [learnerRow] = await database
    .select({ displayName: learners.displayName })
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);
  const learnerName = learnerRow?.displayName ?? "Student";

  // 8. Gather Phase 5 enrichment data (best-effort, parallel)
  const enrichment = await gatherEnrichment(
    learnerId,
    periodStart,
    periodEnd,
    resolved,
  );

  // 9. Generate enhanced AI summary
  const summaryPrompt = buildEnhancedReportSummaryPrompt({
    learnerName,
    periodStart,
    periodEnd,
    sessionsCompleted,
    totalStudyMinutes,
    topicsReviewed,
    masteryChanges,
    flags,
    enrichment,
  });
  const summary = await aiSummarize(summaryPrompt);

  // 10. Persist report
  const [report] = await database
    .insert(weeklyReports)
    .values({
      learnerId,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      summary,
      masteryChanges: masteryChanges as unknown as Record<string, unknown>,
      sessionsCompleted,
      totalStudyMinutes,
      topicsReviewed,
      flags: flags.map((f) => ({
        type: f.type,
        description: f.description,
        severity: f.severity,
      })) as unknown as Record<string, unknown>,
      sentTo: [] as unknown as Record<string, unknown>,
    })
    .returning();

  return {
    reportId: report.id,
    learnerId,
    periodStart,
    periodEnd,
    sessionsCompleted,
    totalStudyMinutes,
    topicsReviewed,
    masteryChanges,
    flags: flags.map((f) => ({
      type: f.type,
      description: f.description,
      severity: f.severity,
    })),
    summary,
    enrichment,
  };
}

// ---------------------------------------------------------------------------
// sendWeeklyReport (enhanced overload)
// ---------------------------------------------------------------------------

export async function sendEnhancedWeeklyReport(
  reportId: string,
  enrichment: ReportEnrichment,
  deps?: Partial<ReportingDeps>,
): Promise<{ sentTo: Array<{ userId: string; channel: string }> }> {
  const { db: database, sendEmailFn } = resolveDeps(deps);

  const [report] = await database
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new Error(`Report not found: ${reportId}`);
  }

  const [learnerRow] = await database
    .select({ displayName: learners.displayName })
    .from(learners)
    .where(eq(learners.id, report.learnerId))
    .limit(1);
  const learnerName = learnerRow?.displayName ?? "Student";

  const guardians = await database
    .select({
      guardianUserId: guardianLinks.guardianUserId,
      email: users.email,
      name: users.name,
    })
    .from(guardianLinks)
    .innerJoin(users, eq(guardianLinks.guardianUserId, users.id))
    .where(
      and(
        eq(guardianLinks.learnerId, report.learnerId),
        eq(guardianLinks.receivesWeeklyReport, true),
      ),
    );

  const existingSentTo = (report.sentTo ?? []) as Array<{
    userId: string;
    channel: string;
    sentAt: string;
  }>;
  const alreadySentUserIds = new Set(existingSentTo.map((s) => s.userId));
  const allSentTo = [...existingSentTo];
  const sentTo: Array<{ userId: string; channel: string }> = [];

  const reportData: WeeklyReportData = {
    learnerId: report.learnerId as LearnerId,
    periodStart: new Date(report.periodStart),
    periodEnd: new Date(report.periodEnd),
    sessionsCompleted: report.sessionsCompleted,
    totalStudyMinutes: report.totalStudyMinutes,
    topicsReviewed: report.topicsReviewed,
    masteryChanges: (report.masteryChanges ?? []) as WeeklyReportData["masteryChanges"],
    flags: (report.flags ?? []) as WeeklyReportData["flags"],
    summary: report.summary,
  };

  for (const guardian of guardians) {
    if (alreadySentUserIds.has(guardian.guardianUserId)) {
      sentTo.push({ userId: guardian.guardianUserId, channel: "email" });
      continue;
    }

    const html = await renderWeeklyReportEmail({
      data: reportData,
      learnerName,
      ...mapEnrichmentToEmailProps(enrichment, learnerName),
    });

    const subject = `${learnerName}'s Weekly Study Report - ${reportData.periodStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${reportData.periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

    await sendEmailFn({
      to: guardian.email,
      subject,
      html,
    });

    await database.insert(notificationEvents).values({
      userId: guardian.guardianUserId,
      type: "weekly_report",
      channel: "email",
      subject,
      payload: { reportId, learnerId: report.learnerId } as Record<string, unknown>,
      sentAt: new Date(),
    });

    const entry = {
      userId: guardian.guardianUserId,
      channel: "email",
      sentAt: new Date().toISOString(),
    };
    allSentTo.push(entry);
    sentTo.push({ userId: guardian.guardianUserId, channel: "email" });

    await database
      .update(weeklyReports)
      .set({ sentTo: allSentTo as unknown as Record<string, unknown> })
      .where(eq(weeklyReports.id, reportId));
  }

  return { sentTo };
}

// ---------------------------------------------------------------------------
// Enrichment gathering (Phase 5 engines)
// ---------------------------------------------------------------------------

async function gatherEnrichment(
  learnerId: LearnerId,
  periodStart: Date,
  periodEnd: Date,
  deps: ReportingDeps,
): Promise<ReportEnrichment> {
  const {
    db: database,
    detectPatternsFn,
    calculateCalibrationFn,
    getTechniqueMasteryFn,
    getExamPhaseFn,
  } = deps;

  const [
    behaviourResult,
    calibrationResult,
    techniqueResult,
    misconceptionNarratives,
    misconceptionClusters,
  ] =
    await Promise.all([
      detectPatternsFn
        ? detectPatternsFn(database, learnerId).catch((err: unknown) => {
            structuredLog("enrichment_engine_failed", { engine: "detectPatterns", learnerId, err: String(err) });
            return null;
          })
        : Promise.resolve(null),
      calculateCalibrationFn
        ? calculateCalibrationFn(database, learnerId).catch((err: unknown) => {
            structuredLog("enrichment_engine_failed", { engine: "calculateCalibration", learnerId, err: String(err) });
            return null;
          })
        : Promise.resolve(null),
      getTechniqueMasteryFn
        ? getTechniqueMasteryFn(database, learnerId).catch((err: unknown) => {
            structuredLog("enrichment_engine_failed", { engine: "getTechniqueMastery", learnerId, err: String(err) });
            return [] as TechniqueMastery[];
          })
        : Promise.resolve([]),
      buildMisconceptionNarratives(database, learnerId),
      findRecentMisconceptionClusters(database, learnerId, {
        since: periodStart,
        until: periodEnd,
        minEvents: 2,
        minTopics: 2,
      }).catch((err: unknown) => {
        structuredLog("enrichment_engine_failed", {
          engine: "findRecentMisconceptionClusters",
          learnerId,
          err: String(err),
        });
        return [] as MisconceptionRootCauseCluster[];
      }),
    ]);

  let examPhase: ExamPhaseContext | null = null;
  if (getExamPhaseFn) {
    examPhase = await getClosestExamPhase(database, learnerId, getExamPhaseFn);
  }

  const suggestions = computeSuggestions(
    behaviourResult,
    calibrationResult,
    techniqueResult,
    misconceptionNarratives,
    examPhase,
  );

  return {
    behaviour: behaviourResult,
    calibration: calibrationResult,
    misconceptionNarratives,
    misconceptionClusters,
    techniqueMastery: techniqueResult,
    examPhase,
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Exam phase lookup
// ---------------------------------------------------------------------------

async function getClosestExamPhase(
  database: Database,
  learnerId: LearnerId,
  getExamPhaseFn: NonNullable<ReportingDeps["getExamPhaseFn"]>,
): Promise<ExamPhaseContext | null> {
  try {
    const quals = await database
      .select({
        qualificationVersionId: learnerQualifications.qualificationVersionId,
        examDate: learnerQualifications.examDate,
        qualName: qualifications.name,
      })
      .from(learnerQualifications)
      .innerJoin(
        qualificationVersions,
        eq(learnerQualifications.qualificationVersionId, qualificationVersions.id),
      )
      .innerJoin(
        qualifications,
        eq(qualificationVersions.qualificationId, qualifications.id),
      )
      .where(
        and(
          eq(learnerQualifications.learnerId, learnerId),
          eq(learnerQualifications.status, "active"),
          sql`${learnerQualifications.examDate} IS NOT NULL`,
        ),
      );

    if (quals.length === 0) return null;

    const now = new Date();
    const sorted = quals
      .map((q) => ({
        ...q,
        daysToExam: calculateDaysToExam(now, new Date(q.examDate + "T00:00:00")),
      }))
      .filter((q) => q.daysToExam >= 0)
      .sort((a, b) => a.daysToExam - b.daysToExam);

    if (sorted.length === 0) return null;
    const closest = sorted[0];

    const phase = await getExamPhaseFn(
      database,
      learnerId,
      closest.qualificationVersionId as QualificationVersionId,
    );

    return {
      phase: phase.phase,
      daysToExam: phase.daysToExam,
      weeksToExam: phase.weeksToExam,
      qualificationName: closest.qualName,
      description: phase.toneModifiers.description,
    };
  } catch (err: unknown) {
    structuredLog("enrichment_engine_failed", { engine: "getClosestExamPhase", learnerId, err: String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Misconception narratives
// ---------------------------------------------------------------------------

export async function buildMisconceptionNarratives(
  database: Database,
  learnerId: LearnerId,
): Promise<MisconceptionNarrative[]> {
  const rows = await database
    .select({
      topicName: topics.name,
      description: misconceptionEvents.description,
      occurrences: sql<number>`count(*)::int`,
      resolved: sql<boolean>`bool_and(${misconceptionEvents.resolved})`,
      resolvedAt: sql<Date | null>`max(${misconceptionEvents.resolvedAt})`,
      firstSeenAt: sql<Date>`min(${misconceptionEvents.createdAt})`,
    })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(eq(misconceptionEvents.learnerId, learnerId))
    .groupBy(misconceptionEvents.topicId, topics.name, misconceptionEvents.description)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    topicName: r.topicName,
    description: r.description,
    occurrences: r.occurrences,
    resolved: r.resolved ?? false,
    resolvedAt: r.resolvedAt,
    firstSeenAt: r.firstSeenAt,
    narrative: buildNarrativeText(
      r.topicName,
      r.description,
      r.occurrences,
      r.resolved ?? false,
    ),
  }));
}

function buildNarrativeText(
  topicName: string,
  description: string,
  occurrences: number,
  resolved: boolean,
): string {
  if (resolved) {
    return `${description} — targeted in ${occurrences} session${occurrences === 1 ? "" : "s"}, now resolved.`;
  }
  return `${description} — seen ${occurrences} time${occurrences === 1 ? "" : "s"}, still working on it.`;
}

// ---------------------------------------------------------------------------
// Actionable suggestions
// ---------------------------------------------------------------------------

export function computeSuggestions(
  behaviour: BehaviourReport | null,
  calibration: CalibrationResult | null,
  techniqueMastery: TechniqueMastery[],
  misconceptions: MisconceptionNarrative[],
  examPhase: ExamPhaseContext | null,
): ActionableSuggestion[] {
  const suggestions: ActionableSuggestion[] = [];

  if (behaviour?.avoidedTopics && behaviour.avoidedTopics.length > 0) {
    const topicName = behaviour.avoidedTopics[0].topicName;
    suggestions.push({
      category: "avoidance",
      message: `They've been avoiding ${topicName}. A conversation about what feels difficult could help — the system will reintroduce it gently.`,
      priority: behaviour.avoidedTopics.length >= 3 ? "high" : "medium",
    });
  }

  if (behaviour?.engagementTrend.direction === "declining") {
    suggestions.push({
      category: "engagement",
      message: "Study sessions are getting shorter and gaps between them are growing. Encouragement to keep a regular routine would help.",
      priority: "high",
    });
  }

  if (calibration && calibration.dataPoints > 0) {
    const underconfidentTopics = calibration.topicCalibrations.filter(
      (t) => t.underconfident && t.dataPoints >= 2,
    );
    if (underconfidentTopics.length > 0) {
      const topicName = underconfidentTopics[0].topicName;
      suggestions.push({
        category: "calibration",
        message: `They consistently underestimate their ability on ${topicName} — scores are much higher than self-assessments. Some encouragement could really help.`,
        priority: "medium",
      });
    }

    const overconfidentTopics = calibration.topicCalibrations.filter(
      (t) => t.overconfident && t.dataPoints >= 2,
    );
    if (overconfidentTopics.length > 0 && underconfidentTopics.length === 0) {
      const topicName = overconfidentTopics[0].topicName;
      suggestions.push({
        category: "calibration",
        message: `They may be overconfident on ${topicName} — actual scores don't match self-assessment. More focused practice would help.`,
        priority: "medium",
      });
    }
  }

  const weakTechniques = techniqueMastery.filter(
    (t) => t.avgScore !== null && t.avgScore < 50 && t.questionsAttempted >= 3,
  );
  if (weakTechniques.length > 0) {
    const words = weakTechniques
      .slice(0, 3)
      .map((t) => `'${t.commandWord.toLowerCase()}'`)
      .join(", ");
    suggestions.push({
      category: "technique",
      message: `Needs more practice with ${words} questions — these require a specific approach that takes time to master.`,
      priority: "medium",
    });
  }

  const unresolvedMisconceptions = misconceptions.filter(
    (m) => !m.resolved && m.occurrences >= 3,
  );
  if (unresolvedMisconceptions.length > 0) {
    const topicNames = unresolvedMisconceptions
      .slice(0, 2)
      .map((m) => m.topicName)
      .join(" and ");
    suggestions.push({
      category: "misconception",
      message: `Recurring misconceptions in ${topicNames} are being addressed but haven't fully resolved yet. Extra support on these topics could help.`,
      priority: "high",
    });
  }

  if (examPhase && examPhase.daysToExam <= 28) {
    const phaseMessage =
      examPhase.phase === "confidence"
        ? "Focus on maintaining calm and confidence — the hard work is done."
        : "Prioritising weak areas and retrieval practice is key right now.";
    suggestions.push({
      category: "exam",
      message: `${examPhase.qualificationName} exam is ${examPhase.daysToExam} days away. ${phaseMessage}`,
      priority: examPhase.daysToExam <= 7 ? "high" : "medium",
    });
  }

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort(
    (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
  );

  return suggestions;
}

// ---------------------------------------------------------------------------
// Enrichment → email props mapping
// ---------------------------------------------------------------------------

export function mapEnrichmentToEmailProps(
  enrichment: ReportEnrichment,
  _learnerName: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const misconceptionClusters = enrichment.misconceptionClusters ?? [];

  if (enrichment.behaviour) {
    props.behaviourInsights = {
      engagementDirection: enrichment.behaviour.engagementTrend.direction,
      avoidedTopics: enrichment.behaviour.avoidedTopics.map((t) => ({
        topicName: t.topicName,
        skippedCount: t.skippedCount,
      })),
    };
  }

  if (enrichment.calibration && enrichment.calibration.dataPoints > 0) {
    props.calibrationInsight = {
      overconfident: enrichment.calibration.overconfident,
      underconfident: enrichment.calibration.underconfident,
      calibrationScore: enrichment.calibration.calibrationScore,
      trend: enrichment.calibration.trend,
      message: enrichment.calibration.message,
      topicHighlights: enrichment.calibration.topicCalibrations
        .filter((t) => (t.overconfident || t.underconfident) && t.dataPoints >= 2)
        .slice(0, 5)
        .map((t) => ({
          topicName: t.topicName,
          message: t.message,
          overconfident: t.overconfident,
          underconfident: t.underconfident,
        })),
    };
  }

  if (enrichment.misconceptionNarratives.length > 0) {
    props.misconceptionNarratives = enrichment.misconceptionNarratives.map((m) => ({
      narrative: m.narrative,
      resolved: m.resolved,
    }));
  }

  if (misconceptionClusters.length > 0) {
    props.misconceptionClusters = misconceptionClusters.map((cluster) => ({
      rootCauseLabel: cluster.rootCauseLabel,
      explanation: cluster.explanation,
      topicNames: cluster.memberTopics.map((topic) => topic.topicName),
      totalEvents: cluster.signal.totalEvents,
      signalLevel: cluster.signal.level,
    }));
  }

  if (enrichment.techniqueMastery.length > 0) {
    props.techniqueMastery = enrichment.techniqueMastery
      .filter((t) => t.questionsAttempted > 0)
      .map((t) => ({
        commandWord: t.commandWord,
        avgScore: t.avgScore,
        trend: t.trend,
      }));
  }

  if (enrichment.examPhase) {
    props.examPhaseContext = {
      phase: enrichment.examPhase.phase,
      description: enrichment.examPhase.description,
      daysToExam: enrichment.examPhase.daysToExam,
    };
  }

  if (enrichment.suggestions.length > 0) {
    props.suggestions = enrichment.suggestions.map((s) => ({
      message: s.message,
      priority: s.priority,
    }));
  }

  return props;
}

// ---------------------------------------------------------------------------
// Enhanced report prompt builder
// ---------------------------------------------------------------------------

interface EnhancedReportSummaryInput extends ReportSummaryInput {
  enrichment: ReportEnrichment;
}

function buildEnhancedReportSummaryPrompt(input: EnhancedReportSummaryInput): string {
  const improvements = input.masteryChanges
    .filter((m) => m.delta > 0)
    .map((m) => `${m.topicName}: +${Math.round(m.delta * 100)}%`);
  const declines = input.masteryChanges
    .filter((m) => m.delta < 0)
    .map((m) => `${m.topicName}: ${Math.round(m.delta * 100)}%`);

  const { enrichment } = input;
  const misconceptionClusters = enrichment.misconceptionClusters ?? [];

  let behaviourSection = "No behavioural data available.";
  if (enrichment.behaviour) {
    const parts: string[] = [];
    parts.push(`Engagement trend: ${enrichment.behaviour.engagementTrend.direction}`);
    if (enrichment.behaviour.avoidedTopics.length > 0) {
      const names = enrichment.behaviour.avoidedTopics.map((t) => t.topicName).join(", ");
      parts.push(`Avoided topics: ${names}`);
    }
    if (enrichment.behaviour.peakHours.length > 0) {
      const best = enrichment.behaviour.peakHours[0];
      parts.push(`Best study time: ${best.hour}:00 (avg score: ${best.avgScore})`);
    }
    behaviourSection = parts.join("\n");
  }

  let calibrationSection = "No calibration data available.";
  if (enrichment.calibration && enrichment.calibration.dataPoints > 0) {
    const parts: string[] = [enrichment.calibration.message];
    const highlights = enrichment.calibration.topicCalibrations
      .filter((t) => (t.overconfident || t.underconfident) && t.dataPoints >= 2)
      .slice(0, 3);
    for (const h of highlights) {
      parts.push(`- ${h.message}`);
    }
    calibrationSection = parts.join("\n");
  }

  let misconceptionSection = "No misconceptions tracked.";
  if (misconceptionClusters.length > 0 || enrichment.misconceptionNarratives.length > 0) {
    const parts: string[] = [];
    if (misconceptionClusters.length > 0) {
      parts.push("Cross-topic clusters:");
      for (const cluster of misconceptionClusters.slice(0, 3)) {
        const topicNames = cluster.memberTopics.map((topic) => topic.topicName).join(", ");
        parts.push(
          `- ${cluster.rootCauseLabel} (${cluster.signal.totalEvents} events across ${cluster.signal.distinctTopics} topics: ${topicNames})`,
        );
      }
    }
    if (enrichment.misconceptionNarratives.length > 0) {
      parts.push("Topic narratives:");
      for (const narrative of enrichment.misconceptionNarratives.slice(0, 5)) {
        parts.push(`- ${narrative.narrative}`);
      }
    }
    misconceptionSection = parts.join("\n");
  }

  let techniqueSection = "No technique data available.";
  if (enrichment.techniqueMastery.length > 0) {
    const withData = enrichment.techniqueMastery.filter((t) => t.questionsAttempted > 0);
    if (withData.length > 0) {
      techniqueSection = withData
        .map(
          (t) =>
            `- ${t.commandWord}: ${t.avgScore !== null ? `${t.avgScore}% avg` : "no scores yet"}, ${t.questionsAttempted} attempted, trend: ${t.trend}`,
        )
        .join("\n");
    }
  }

  let examPhaseSection = "No exam date set.";
  if (enrichment.examPhase) {
    examPhaseSection = `Phase: ${enrichment.examPhase.phase} (${enrichment.examPhase.daysToExam} days to exam, ${enrichment.examPhase.qualificationName})\n${enrichment.examPhase.description}`;
  }

  return loadPrompt("enhanced-report-summary.md", {
    learnerName: input.learnerName,
    periodRange: `${input.periodStart.toLocaleDateString("en-GB")} to ${input.periodEnd.toLocaleDateString("en-GB")}`,
    sessionsCompleted: String(input.sessionsCompleted),
    totalStudyMinutes: String(input.totalStudyMinutes),
    topicsReviewed: String(input.topicsReviewed),
    improvementsSection:
      improvements.length > 0
        ? `Improvements:\n${improvements.map((i) => `- ${i}`).join("\n")}`
        : "No mastery improvements this week.",
    declinesSection:
      declines.length > 0
        ? `Areas needing attention:\n${declines.map((d) => `- ${d}`).join("\n")}`
        : "",
    flagsSection:
      input.flags.length > 0
        ? `Flags:\n${input.flags.map((f) => `- ${f.type} (${f.severity}): ${f.description}`).join("\n")}`
        : "No concerns flagged this week.",
    behaviourSection,
    calibrationSection,
    misconceptionSection,
    techniqueSection,
    examPhaseSection,
  });
}
