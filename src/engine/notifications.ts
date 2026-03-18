import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { db as prodDb, type Database } from "@/lib/db";
import {
  notificationEvents,
  learnerTopicState,
  learnerQualifications,
  learnerPreferences,
  learners,
  guardianLinks,
  studySessions,
  users,
  topics,
  qualifications,
  qualificationVersions,
} from "@/db/schema";
import type { LearnerId, TopicId } from "@/lib/types";
import { sendEmail as defaultSendEmail, type EmailOptions, type EmailResult } from "@/email/send";
import { structuredLog } from "@/lib/logger";
import { determinePhase, calculateDaysToExam, type ExamPhaseName } from "@/engine/proximity";

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface NotificationDeps {
  db: Database;
  sendEmailFn: (options: EmailOptions) => Promise<EmailResult>;
  now: () => Date;
}

function defaultDeps(): NotificationDeps {
  return {
    db: prodDb,
    sendEmailFn: defaultSendEmail,
    now: () => new Date(),
  };
}

function resolveDeps(partial?: Partial<NotificationDeps>): NotificationDeps {
  return { ...defaultDeps(), ...partial };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "student_nudge"
  | "decay_alert"
  | "exam_proximity"
  | "parent_alert";

export interface NotificationResult {
  learnerId: LearnerId;
  sent: Array<{
    notificationId: string;
    type: NotificationType;
    channel: "email" | "in_app";
    recipientUserId: string;
  }>;
  skipped: Array<{
    type: NotificationType;
    reason: string;
  }>;
}

export interface DecayingTopic {
  topicId: TopicId;
  topicName: string;
  masteryLevel: number;
  lastReviewedAt: Date | null;
}

export interface NudgeTriggerData {
  learnerId: LearnerId;
  learnerName: string;
  learnerUserId: string;
  learnerEmail: string;
  daysSinceLastSession: number;
  decayingTopics: DecayingTopic[];
  examProximity: { qualName: string; daysToExam: number; phase: ExamPhaseName } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STUDENT_NUDGES_PER_DAY = 1;
const MAX_PARENT_ALERTS_PER_DAY = 1;
const DECAY_MASTERY_THRESHOLD = 0.5;
const INACTIVITY_DAYS_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Main entry point: process all notifications for a single learner
// ---------------------------------------------------------------------------

export async function processLearnerNotifications(
  learnerId: LearnerId,
  deps?: Partial<NotificationDeps>,
): Promise<NotificationResult> {
  const { db: database, sendEmailFn, now: getNow } = resolveDeps(deps);
  const currentTime = getNow();

  const result: NotificationResult = {
    learnerId,
    sent: [],
    skipped: [],
  };

  // 1. Get learner info
  const learnerInfo = await getLearnerInfo(database, learnerId);
  if (!learnerInfo) {
    result.skipped.push({ type: "student_nudge", reason: "learner_not_found" });
    return result;
  }

  // 2. Check notification preferences
  const notifDisabled = await isNotificationDisabled(database, learnerId);
  if (notifDisabled) {
    result.skipped.push({ type: "student_nudge", reason: "notifications_disabled" });
    return result;
  }

  // 3. Gather trigger data
  const triggerData = await gatherTriggerData(database, learnerId, learnerInfo, currentTime);

  // 4. Student nudge (inactivity + decay + exam proximity)
  const studentNudgeResult = await processStudentNudge(
    database, sendEmailFn, triggerData, currentTime,
  );
  result.sent.push(...studentNudgeResult.sent);
  result.skipped.push(...studentNudgeResult.skipped);

  // 5. Parent alerts
  const parentAlertResult = await processParentAlerts(
    database, sendEmailFn, triggerData, currentTime,
  );
  result.sent.push(...parentAlertResult.sent);
  result.skipped.push(...parentAlertResult.skipped);

  return result;
}

// ---------------------------------------------------------------------------
// Student nudge
// ---------------------------------------------------------------------------

async function processStudentNudge(
  db: Database,
  sendEmailFn: (options: EmailOptions) => Promise<EmailResult>,
  data: NudgeTriggerData,
  now: Date,
): Promise<{ sent: NotificationResult["sent"]; skipped: NotificationResult["skipped"] }> {
  const sent: NotificationResult["sent"] = [];
  const skipped: NotificationResult["skipped"] = [];

  const needsNudge =
    data.daysSinceLastSession >= INACTIVITY_DAYS_THRESHOLD ||
    data.decayingTopics.length > 0 ||
    (data.examProximity && data.examProximity.daysToExam <= 28);

  if (!needsNudge) {
    skipped.push({ type: "student_nudge", reason: "no_trigger" });
    return { sent, skipped };
  }

  // Rate limit: max 1 student nudge per day (any student-facing type counts)
  const studentTypes: NotificationType[] = ["student_nudge", "decay_alert", "exam_proximity"];
  const rateLimited = await hasRecentNotificationOfAnyType(
    db, data.learnerUserId, studentTypes, MAX_STUDENT_NUDGES_PER_DAY, now,
  );
  if (rateLimited) {
    skipped.push({ type: "student_nudge", reason: "rate_limited" });
    return { sent, skipped };
  }

  // Determine notification type
  const notifType = determineStudentNotificationType(data);
  const { subject, body } = buildStudentNudgeContent(data, notifType);

  const payload = buildNudgePayload(data, notifType);

  // Record in-app notification unconditionally
  const inAppEntry = await recordInAppNotification(db, {
    userId: data.learnerUserId, type: notifType, subject, payload, now,
  });
  sent.push(inAppEntry);

  // Attempt email (best-effort)
  try {
    await sendEmailFn({ to: data.learnerEmail, subject, html: body });
    const emailEntry = await recordEmailNotification(db, {
      userId: data.learnerUserId, type: notifType, subject, payload, now,
    });
    sent.push(emailEntry);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    structuredLog("notification.email-failed", {
      learnerId: data.learnerId,
      type: notifType,
      error: msg,
    });
    skipped.push({ type: notifType, reason: `email_failed: ${msg}` });
  }

  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Parent alerts
// ---------------------------------------------------------------------------

async function processParentAlerts(
  db: Database,
  sendEmailFn: (options: EmailOptions) => Promise<EmailResult>,
  data: NudgeTriggerData,
  now: Date,
): Promise<{ sent: NotificationResult["sent"]; skipped: NotificationResult["skipped"] }> {
  const sent: NotificationResult["sent"] = [];
  const skipped: NotificationResult["skipped"] = [];

  // Only alert parents if there's genuine concern
  const needsParentAlert =
    data.daysSinceLastSession >= INACTIVITY_DAYS_THRESHOLD ||
    data.decayingTopics.length >= 2;

  if (!needsParentAlert) {
    skipped.push({ type: "parent_alert", reason: "no_trigger" });
    return { sent, skipped };
  }

  // Get guardians who receive flags
  const guardians = await db
    .select({
      guardianUserId: guardianLinks.guardianUserId,
      email: users.email,
      name: users.name,
    })
    .from(guardianLinks)
    .innerJoin(users, eq(guardianLinks.guardianUserId, users.id))
    .where(
      and(
        eq(guardianLinks.learnerId, data.learnerId),
        eq(guardianLinks.receivesFlags, true),
      ),
    );

  if (guardians.length === 0) {
    skipped.push({ type: "parent_alert", reason: "no_guardians" });
    return { sent, skipped };
  }

  for (const guardian of guardians) {
    // Rate limit: max 1 parent alert per day per guardian
    const alreadySent = await hasRecentNotification(
      db, guardian.guardianUserId, "parent_alert", MAX_PARENT_ALERTS_PER_DAY, now,
    );
    if (alreadySent) {
      skipped.push({ type: "parent_alert", reason: `rate_limited:${guardian.guardianUserId}` });
      continue;
    }

    const { subject, body } = buildParentAlertContent(data, guardian.name, now);
    const payload = buildParentPayload(data);

    // Record in-app notification unconditionally
    const inAppEntry = await recordInAppNotification(db, {
      userId: guardian.guardianUserId, type: "parent_alert", subject, payload, now,
    });
    sent.push(inAppEntry);

    // Attempt email (best-effort)
    try {
      await sendEmailFn({ to: guardian.email, subject, html: body });
      const emailEntry = await recordEmailNotification(db, {
        userId: guardian.guardianUserId, type: "parent_alert", subject, payload, now,
      });
      sent.push(emailEntry);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      structuredLog("notification.parent-email-failed", {
        learnerId: data.learnerId,
        guardianUserId: guardian.guardianUserId,
        error: msg,
      });
      skipped.push({ type: "parent_alert", reason: `email_failed: ${msg}` });
    }
  }

  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Shared notification recording
// ---------------------------------------------------------------------------

interface NotificationRecordOpts {
  userId: string;
  type: NotificationType;
  subject: string;
  payload: Record<string, unknown>;
  now: Date;
}

async function recordInAppNotification(
  db: Database,
  opts: NotificationRecordOpts,
): Promise<NotificationResult["sent"][number]> {
  const [inAppNotif] = await db
    .insert(notificationEvents)
    .values({
      userId: opts.userId,
      type: opts.type,
      channel: "in_app",
      subject: opts.subject,
      payload: opts.payload,
      createdAt: opts.now,
    })
    .returning({ id: notificationEvents.id });

  return { notificationId: inAppNotif.id, type: opts.type, channel: "in_app" as const, recipientUserId: opts.userId };
}

async function recordEmailNotification(
  db: Database,
  opts: NotificationRecordOpts,
): Promise<NotificationResult["sent"][number]> {
  const [emailNotif] = await db
    .insert(notificationEvents)
    .values({
      userId: opts.userId,
      type: opts.type,
      channel: "email",
      subject: opts.subject,
      payload: opts.payload,
      sentAt: opts.now,
      createdAt: opts.now,
    })
    .returning({ id: notificationEvents.id });

  return { notificationId: emailNotif.id, type: opts.type, channel: "email" as const, recipientUserId: opts.userId };
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

interface LearnerInfo {
  learnerId: string;
  userId: string;
  displayName: string;
  email: string;
}

async function getLearnerInfo(
  db: Database,
  learnerId: LearnerId,
): Promise<LearnerInfo | null> {
  const [row] = await db
    .select({
      learnerId: learners.id,
      userId: learners.userId,
      displayName: learners.displayName,
      email: users.email,
    })
    .from(learners)
    .innerJoin(users, eq(learners.userId, users.id))
    .where(eq(learners.id, learnerId))
    .limit(1);

  return row ?? null;
}

async function isNotificationDisabled(
  db: Database,
  learnerId: LearnerId,
): Promise<boolean> {
  const [pref] = await db
    .select({ value: learnerPreferences.value })
    .from(learnerPreferences)
    .where(
      and(
        eq(learnerPreferences.learnerId, learnerId),
        eq(learnerPreferences.key, "notifications_enabled"),
      ),
    )
    .limit(1);

  if (!pref) return false;
  return pref.value === false;
}

export async function gatherTriggerData(
  db: Database,
  learnerId: LearnerId,
  learnerInfo: LearnerInfo,
  now: Date,
): Promise<NudgeTriggerData> {
  // Days since last completed session
  const daysSinceLastSession = await getDaysSinceLastSession(db, learnerId, now);

  // Topics with decaying mastery
  const decayingTopics = await getDecayingTopics(db, learnerId, now);

  // Exam proximity (closest exam)
  const examProximity = await getClosestExamProximity(db, learnerId, now);

  return {
    learnerId,
    learnerName: learnerInfo.displayName,
    learnerUserId: learnerInfo.userId,
    learnerEmail: learnerInfo.email,
    daysSinceLastSession,
    decayingTopics,
    examProximity,
  };
}

async function getDaysSinceLastSession(
  db: Database,
  learnerId: LearnerId,
  now: Date,
): Promise<number> {
  const [lastSession] = await db
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

  if (!lastSession) return 999;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - lastSession.startedAt.getTime()) / msPerDay);
}

export async function getDecayingTopics(
  db: Database,
  learnerId: LearnerId,
  now: Date,
): Promise<DecayingTopic[]> {
  const rows = await db
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      masteryLevel: learnerTopicState.masteryLevel,
      lastReviewedAt: learnerTopicState.lastReviewedAt,
      nextReviewAt: learnerTopicState.nextReviewAt,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        lte(learnerTopicState.nextReviewAt, now),
        gte(learnerTopicState.masteryLevel, "0.100"),
        lte(learnerTopicState.masteryLevel, String(DECAY_MASTERY_THRESHOLD)),
      ),
    );

  return rows.map((r) => ({
    topicId: r.topicId as TopicId,
    topicName: r.topicName,
    masteryLevel: Number(r.masteryLevel),
    lastReviewedAt: r.lastReviewedAt,
  }));
}

async function getClosestExamProximity(
  db: Database,
  learnerId: LearnerId,
  now: Date,
): Promise<{ qualName: string; daysToExam: number; phase: ExamPhaseName } | null> {
  const enrollments = await db
    .select({
      qualVersionId: learnerQualifications.qualificationVersionId,
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
      ),
    );

  let closest: { qualName: string; daysToExam: number; phase: ExamPhaseName } | null = null;

  for (const enrollment of enrollments) {
    if (!enrollment.examDate) continue;

    const examDate = new Date(enrollment.examDate + "T00:00:00");
    const daysToExam = calculateDaysToExam(now, examDate);

    if (daysToExam < 0) continue;

    if (!closest || daysToExam < closest.daysToExam) {
      closest = {
        qualName: enrollment.qualName,
        daysToExam,
        phase: determinePhase(daysToExam),
      };
    }
  }

  return closest;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export async function hasRecentNotification(
  db: Database,
  userId: string,
  type: string,
  maxPerDay: number,
  now: Date,
): Promise<boolean> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationEvents)
    .where(
      and(
        eq(notificationEvents.userId, userId),
        eq(notificationEvents.type, type),
        gte(notificationEvents.createdAt, dayStart),
      ),
    );

  return (countResult?.count ?? 0) >= maxPerDay;
}

export async function hasRecentNotificationOfAnyType(
  db: Database,
  userId: string,
  types: string[],
  maxPerDay: number,
  now: Date,
): Promise<boolean> {
  if (types.length === 0) return false;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationEvents)
    .where(
      and(
        eq(notificationEvents.userId, userId),
        inArray(notificationEvents.type, types),
        gte(notificationEvents.createdAt, dayStart),
      ),
    );

  return (countResult?.count ?? 0) >= maxPerDay;
}

// ---------------------------------------------------------------------------
// In-app notification queries (for API route)
// ---------------------------------------------------------------------------

export async function getInAppNotifications(
  db: Database,
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<Array<{
  id: string;
  type: string;
  subject: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}>> {
  const limit = options?.limit ?? 50;
  const conditions = [
    eq(notificationEvents.userId, userId),
    eq(notificationEvents.channel, "in_app"),
  ];

  if (options?.unreadOnly) {
    conditions.push(sql`${notificationEvents.readAt} IS NULL`);
  }

  return db
    .select({
      id: notificationEvents.id,
      type: notificationEvents.type,
      subject: notificationEvents.subject,
      payload: notificationEvents.payload,
      readAt: notificationEvents.readAt,
      createdAt: notificationEvents.createdAt,
    })
    .from(notificationEvents)
    .where(and(...conditions))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(limit);
}

export async function markNotificationRead(
  db: Database,
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(notificationEvents)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationEvents.id, notificationId),
        eq(notificationEvents.userId, userId),
      ),
    )
    .returning({ id: notificationEvents.id });

  return result.length > 0;
}

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function determineStudentNotificationType(data: NudgeTriggerData): NotificationType {
  if (data.examProximity && data.examProximity.daysToExam <= 28) {
    return "exam_proximity";
  }
  if (data.decayingTopics.length > 0) {
    return "decay_alert";
  }
  return "student_nudge";
}

export function buildStudentNudgeContent(
  data: NudgeTriggerData,
  type: NotificationType,
): { subject: string; body: string } {
  const firstName = escapeHtml(data.learnerName.split(" ")[0]);

  switch (type) {
    case "exam_proximity": {
      const exam = data.examProximity!;
      const subject = `${exam.daysToExam} days to your ${exam.qualName} exam`;
      const body = buildEmailHtml(
        subject,
        `<p>Hi ${firstName},</p>
<p>Your <strong>${exam.qualName}</strong> exam is in <strong>${exam.daysToExam} days</strong>.</p>
${data.decayingTopics.length > 0
          ? `<p>These topics need attention: <strong>${data.decayingTopics.slice(0, 3).map((t) => t.topicName).join(", ")}</strong>.</p>`
          : ""}
<p>Even 20 minutes tonight keeps your knowledge sharp. Every session counts at this stage.</p>`,
      );
      return { subject, body };
    }
    case "decay_alert": {
      const topicNames = data.decayingTopics.slice(0, 3).map((t) => t.topicName);
      const subject = `${topicNames[0]} is slipping — a quick session helps`;
      const body = buildEmailHtml(
        subject,
        `<p>Hi ${firstName},</p>
<p>You haven't reviewed <strong>${topicNames.join(", ")}</strong> recently, and ${topicNames.length === 1 ? "it's" : "they're"} starting to slip.</p>
<p>20 minutes tonight stops ${topicNames[0]} from fading. Your future self will thank you.</p>`,
      );
      return { subject, body };
    }
    default: {
      const dayWord = data.daysSinceLastSession === 1 ? "day" : "days";
      const subject = `You haven't studied in ${data.daysSinceLastSession} ${dayWord} — let's fix that`;
      const body = buildEmailHtml(
        subject,
        `<p>Hi ${firstName},</p>
<p>It's been <strong>${data.daysSinceLastSession} ${dayWord}</strong> since your last session.</p>
${data.decayingTopics.length > 0
          ? `<p>Meanwhile, <strong>${data.decayingTopics[0].topicName}</strong> is starting to slip. 20 minutes tonight stops it from fading.</p>`
          : "<p>20 minutes tonight keeps your momentum going. Small, consistent sessions beat marathon cramming.</p>"}`,
      );
      return { subject, body };
    }
  }
}

export function buildParentAlertContent(
  data: NudgeTriggerData,
  guardianName: string,
  now?: Date,
): { subject: string; body: string } {
  const firstName = escapeHtml(data.learnerName.split(" ")[0]);
  const guardianFirstName = escapeHtml(guardianName.split(" ")[0]);
  const referenceDate = now ?? new Date();

  let concern = "";
  if (data.daysSinceLastSession >= INACTIVITY_DAYS_THRESHOLD) {
    concern += `<p><strong>${firstName}</strong> hasn't studied since ${getDayDescription(data.daysSinceLastSession, referenceDate)}.</p>`;
  }
  if (data.decayingTopics.length > 0) {
    const topicNames = data.decayingTopics.slice(0, 3).map((t) => t.topicName);
    concern += `<p>${topicNames.join(", ")} ${topicNames.length === 1 ? "is" : "are"} slipping and ${topicNames.length === 1 ? "needs" : "need"} review.</p>`;
  }

  const subject = `${firstName}'s study update — needs attention`;
  const body = buildEmailHtml(
    subject,
    `<p>Hi ${guardianFirstName},</p>
${concern}
${data.examProximity
      ? `<p>${firstName}'s ${data.examProximity.qualName} exam is in ${data.examProximity.daysToExam} days.</p>`
      : ""}
<p>A gentle nudge to open Swotta could help get things back on track.</p>`,
  );

  return { subject, body };
}

function buildNudgePayload(
  data: NudgeTriggerData,
  type: NotificationType,
): Record<string, unknown> {
  return {
    learnerId: data.learnerId,
    type,
    daysSinceLastSession: data.daysSinceLastSession,
    decayingTopics: data.decayingTopics.map((t) => ({
      topicId: t.topicId,
      topicName: t.topicName,
      masteryLevel: t.masteryLevel,
    })),
    examProximity: data.examProximity,
  };
}

function buildParentPayload(data: NudgeTriggerData): Record<string, unknown> {
  return {
    learnerId: data.learnerId,
    learnerName: data.learnerName,
    daysSinceLastSession: data.daysSinceLastSession,
    decayingTopicCount: data.decayingTopics.length,
    examProximity: data.examProximity,
  };
}

function getDayDescription(daysAgo: number, now: Date): string {
  if (daysAgo <= 1) return "yesterday";
  if (daysAgo <= 6) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return days[d.getDay()];
  }
  return `${daysAgo} days ago`;
}

function buildEmailHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family: 'Instrument Sans', -apple-system, sans-serif; background-color: #FAF6F0; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(26,25,23,0.05);">
    <div style="margin-bottom: 24px;">
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 20px; color: #2D7A6E;">Swotta</span>
    </div>
    <h2 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 22px; color: #1A1917; margin: 0 0 16px;">${title}</h2>
    <div style="font-size: 16px; line-height: 1.6; color: #5C5950;">
      ${content}
    </div>
    <div style="margin-top: 24px;">
      <a href="https://app.swotta.com" style="display: inline-block; background: #2D7A6E; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Open Swotta</a>
    </div>
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E0D6; font-size: 12px; color: #949085;">
      You're receiving this because you use Swotta. Adjust notification settings in your profile.
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Batch processing (for Inngest cron)
// ---------------------------------------------------------------------------

export async function getActiveLearnerIds(
  db: Database,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ learnerId: learnerQualifications.learnerId })
    .from(learnerQualifications)
    .where(eq(learnerQualifications.status, "active"));

  return rows.map((r) => r.learnerId);
}
