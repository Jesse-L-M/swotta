import { db as prodDb, type Database } from "@/lib/db";
import type {
  LearnerId,
  UserId,
  TopicId,
  TopicMastery,
  WeeklyReportData,
} from "@/lib/types";
import {
  studySessions,
  learnerTopicState,
  misconceptionEvents,
  weeklyReports,
  safetyFlags,
  notificationEvents,
  guardianLinks,
  topics,
  users,
  learners,
} from "@/db/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail as defaultSendEmail, type EmailOptions, type EmailResult } from "@/email/send";
import { renderWeeklyReportEmail } from "@/email/templates/weekly-report";

// ---------------------------------------------------------------------------
// Dependency injection for testability
// ---------------------------------------------------------------------------

export interface ReportingDeps {
  db: Database;
  aiSummarize: (prompt: string) => Promise<string>;
  sendEmailFn: (options: EmailOptions) => Promise<EmailResult>;
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

  // 9. Persist report + safety flags in a single transaction (per INTERFACES.md)
  const report = await database.transaction(async (tx) => {
    const [reportRow] = await tx
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

    for (const flag of flags) {
      await tx.insert(safetyFlags).values({
        learnerId,
        flagType: mapFlagTypeToEnum(flag.type),
        severity: flag.severity,
        description: flag.description,
        evidence: flag.evidence as Record<string, unknown>,
      });
    }

    return reportRow;
  });

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

export async function detectFlags(
  learnerId: LearnerId,
  lookbackDays = 7,
  deps?: Partial<ReportingDeps>,
): Promise<DetectedFlag[]> {
  const { db: database } = resolveDeps(deps);
  const flags: DetectedFlag[] = [];
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // --- 1. Sudden disengagement: no sessions for N days ---
  const recentSessions = await database
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        gte(studySessions.startedAt, lookbackDate),
      ),
    )
    .limit(1);

  if (recentSessions.length === 0) {
    const lastSession = await database
      .select({ startedAt: studySessions.startedAt })
      .from(studySessions)
      .where(eq(studySessions.learnerId, learnerId))
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
  const misconceptionClusters = await database
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
    .having(sql`count(*) >= 3`);

  if (misconceptionClusters.length > 0) {
    const severity: FlagSeverity = misconceptionClusters.some((c) => c.count >= 5) ? "high" : "medium";
    const details = misconceptionClusters.map((c) => `${c.topicName} (${c.count}x)`);
    flags.push({
      type: "distress",
      description: `Repeated misconceptions detected: ${details.join(", ")}.`,
      severity,
      evidence: {
        clusters: misconceptionClusters.map((c) => ({
          topicId: c.topicId,
          topicName: c.topicName,
          count: c.count,
        })),
      },
    });
  }

  return flags;
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

  const sentTo: Array<{ userId: string; channel: string }> = [];

  // 4. Reconstruct WeeklyReportData for the email template
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

  // 5. Send emails
  for (const guardian of guardians) {
    const html = renderWeeklyReportEmail({
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

    sentTo.push({ userId: guardian.guardianUserId, channel: "email" });
  }

  // 6. Update the report's sentTo field
  await database
    .update(weeklyReports)
    .set({
      sentTo: sentTo.map((s) => ({
        ...s,
        sentAt: new Date().toISOString(),
      })) as unknown as Record<string, unknown>,
    })
    .where(eq(weeklyReports.id, reportId));

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

  return `You are writing a weekly study report summary for a parent or guardian about their child's academic progress. Write in a warm, encouraging, but honest tone. Keep it concise (2-3 short paragraphs).

Student: ${input.learnerName}
Period: ${input.periodStart.toLocaleDateString("en-GB")} to ${input.periodEnd.toLocaleDateString("en-GB")}

Key metrics:
- Sessions completed: ${input.sessionsCompleted}
- Total study time: ${input.totalStudyMinutes} minutes
- Topics reviewed: ${input.topicsReviewed}

${improvements.length > 0 ? `Improvements:\n${improvements.map((i) => `- ${i}`).join("\n")}` : "No mastery improvements this week."}

${declines.length > 0 ? `Areas needing attention:\n${declines.map((d) => `- ${d}`).join("\n")}` : ""}

${input.flags.length > 0 ? `Flags:\n${input.flags.map((f) => `- ${f.type} (${f.severity}): ${f.description}`).join("\n")}` : "No concerns flagged this week."}

Write only the summary text. Do not include greetings, sign-offs, or headers.`;
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

  return `You are a teaching assistant AI providing a professional insight report about a student to their teacher. Provide structured analysis.

Student: ${input.learnerName}
Sessions (last 30 days): ${input.sessionsLast30Days}
Total study time (last 30 days): ${input.totalMinutesLast30Days} minutes
Topics tracked: ${input.topicBreakdown.length}

${strongTopics.length > 0 ? `Strong topics: ${strongTopics.join(", ")}` : "No topics above 70% mastery."}
${weakTopics.length > 0 ? `Weak topics: ${weakTopics.join(", ")}` : "No topics below 40% mastery."}
${unresolvedMisconceptions.length > 0 ? `Unresolved misconceptions:\n${unresolvedMisconceptions.map((m) => `- ${m}`).join("\n")}` : "No unresolved misconceptions."}

Respond in exactly this JSON format (no markdown):
{"summary": "...", "strengths": ["...", "..."], "concerns": ["...", "..."], "recommendations": ["...", "..."]}

Keep each entry concise (one sentence). Provide 2-4 items per array.`;
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
      summary: parsed.summary ?? "",
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
