import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  learnerQualifications,
  learnerPreferences,
  learners,
  users,
  studyBlocks,
  studyPlans,
  studySessions,
  topics,
  qualificationVersions,
  qualifications,
} from "@/db/schema";
import { eq, and, asc, desc, gte, inArray, lte } from "drizzle-orm";
import { sendEmail } from "@/email/send";
import {
  renderStudentWeeklyEmail,
  computeStudyStreak,
  type StudentWeeklyEmailProps,
  type WeekPlanDay,
  type ExamCountdownEntry,
} from "@/email/templates/student-weekly";
import {
  calculateDaysToExam,
  determinePhase,
} from "@/engine/proximity";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";
import { structuredLog } from "@/lib/logger";
import type { BlockType } from "@/lib/types";
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_KEYS,
} from "@/components/settings/settings-schemas";

const LONDON_TIME_ZONE = "Europe/London";
const LEGACY_NOTIFICATIONS_ENABLED_KEY = "notifications_enabled";
const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type PlanBlockRow = {
  topicName: string;
  blockType: string;
  durationMinutes: number;
  scheduledDate: string | null;
  scheduledOrder: number | null;
};

type StudentWeeklyResult = {
  learnerId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function extractFirstName(userName: string, displayName: string): string {
  const candidate = [userName, displayName]
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  if (!candidate) return "there";
  return candidate.split(/\s+/)[0] ?? "there";
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format date in Europe/London");
  }

  return `${year}-${month}-${day}`;
}

function buildWeekPlan(planBlocks: PlanBlockRow[]): WeekPlanDay[] {
  const dayMap = new Map<string, WeekPlanDay["blocks"]>();

  for (const block of planBlocks) {
    if (!block.scheduledDate) continue;

    // Treat scheduled dates as calendar days, not local midnights, so weekday
    // labels stay stable across server time zones and DST boundaries.
    const dayName =
      WEEKDAY_NAMES[
        new Date(`${block.scheduledDate}T12:00:00Z`).getUTCDay()
      ];

    if (!dayMap.has(dayName)) {
      dayMap.set(dayName, []);
    }

    dayMap.get(dayName)!.push({
      topicName: block.topicName,
      blockTypeLabel:
        BLOCK_TYPE_LABELS[block.blockType as BlockType] ?? block.blockType,
      durationMinutes: block.durationMinutes,
    });
  }

  return WEEKDAY_ORDER.filter((day) => dayMap.has(day)).map((day) => ({
    day,
    blocks: dayMap.get(day)!,
  }));
}

async function studentWeeklyEmailsDisabled(
  learnerId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      key: learnerPreferences.key,
      value: learnerPreferences.value,
    })
    .from(learnerPreferences)
    .where(
      and(
        eq(learnerPreferences.learnerId, learnerId),
        inArray(learnerPreferences.key, [
          PREFERENCE_KEYS.studyReminders,
          LEGACY_NOTIFICATIONS_ENABLED_KEY,
        ]),
      ),
    );

  let remindersEnabled = DEFAULT_PREFERENCES.studyReminders;
  let notificationsEnabled = true;

  for (const row of rows) {
    if (
      row.key === PREFERENCE_KEYS.studyReminders &&
      typeof row.value === "boolean"
    ) {
      remindersEnabled = row.value;
    }

    if (
      row.key === LEGACY_NOTIFICATIONS_ENABLED_KEY &&
      typeof row.value === "boolean"
    ) {
      notificationsEnabled = row.value;
    }
  }

  return !remindersEnabled || !notificationsEnabled;
}

/**
 * Cron: Monday 07:00 UK time
 * Sends each active student a personalised email with their week's study plan,
 * streak count, exam countdown, and a phase-adjusted motivational message.
 */
export const studentWeeklyTrigger = inngest.createFunction(
  { id: "student/weekly-email", retries: 3 },
  { cron: "TZ=Europe/London 0 7 * * 1" },
  async ({ step }) => {
    const activeLearners = await step.run("get-active-learners", async () => {
      const rows = await db
        .selectDistinct({
          learnerId: learners.id,
          displayName: learners.displayName,
          email: users.email,
          userName: users.name,
        })
        .from(learnerQualifications)
        .innerJoin(learners, eq(learnerQualifications.learnerId, learners.id))
        .innerJoin(users, eq(learners.userId, users.id))
        .where(eq(learnerQualifications.status, "active"));

      return rows.map((r) => ({
        learnerId: r.learnerId,
        email: r.email,
        firstName: extractFirstName(r.userName, r.displayName),
      }));
    });

    if (activeLearners.length === 0) {
      return { processed: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const results: StudentWeeklyResult[] = [];

    for (const learner of activeLearners) {
      const result = await step.run(
        `send-weekly-${learner.learnerId}`,
        async () => {
          const now = new Date();
          const currentDate = formatDateInTimeZone(now, LONDON_TIME_ZONE);

          if (await studentWeeklyEmailsDisabled(learner.learnerId)) {
            structuredLog("student-weekly-email.skipped", {
              learnerId: learner.learnerId,
              reason: "reminders_disabled",
            });

            return {
              learnerId: learner.learnerId,
              status: "skipped" as const,
              reason: "reminders_disabled",
            };
          }

          const [currentPlan] = await db
            .select({
              id: studyPlans.id,
              startDate: studyPlans.startDate,
              endDate: studyPlans.endDate,
            })
            .from(studyPlans)
            .where(
              and(
                eq(studyPlans.learnerId, learner.learnerId),
                eq(studyPlans.status, "active"),
                eq(studyPlans.planType, "weekly"),
                lte(studyPlans.startDate, currentDate),
                gte(studyPlans.endDate, currentDate),
              ),
            )
            .orderBy(desc(studyPlans.createdAt))
            .limit(1);

          // --- Fetch this week's plan blocks ---
          const planBlocks = currentPlan
            ? await db
                .select({
                  topicName: topics.name,
                  blockType: studyBlocks.blockType,
                  durationMinutes: studyBlocks.durationMinutes,
                  scheduledDate: studyBlocks.scheduledDate,
                  scheduledOrder: studyBlocks.scheduledOrder,
                })
                .from(studyBlocks)
                .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
                .where(
                  and(
                    eq(studyBlocks.planId, currentPlan.id),
                    eq(studyBlocks.status, "pending"),
                    gte(studyBlocks.scheduledDate, currentPlan.startDate),
                    lte(studyBlocks.scheduledDate, currentPlan.endDate),
                  ),
                )
                .orderBy(
                  asc(studyBlocks.scheduledDate),
                  asc(studyBlocks.scheduledOrder),
                )
            : [];

          const weekPlan = buildWeekPlan(planBlocks);

          const totalTimeEstimate = planBlocks.reduce(
            (sum, b) => sum + b.durationMinutes,
            0,
          );

          // --- Compute study streak ---
          const recentSessions = await db
            .select({ startedAt: studySessions.startedAt })
            .from(studySessions)
            .where(
              and(
                eq(studySessions.learnerId, learner.learnerId),
                eq(studySessions.status, "completed"),
              ),
            )
            .orderBy(desc(studySessions.startedAt))
            .limit(90);

          const streakCount = computeStudyStreak(
            recentSessions.map((s) => s.startedAt),
            now,
          );

          // --- Exam countdown + phase ---
          const qualEnrollments = await db
            .select({
              examDate: learnerQualifications.examDate,
              qualName: qualifications.name,
            })
            .from(learnerQualifications)
            .innerJoin(
              qualificationVersions,
              eq(
                learnerQualifications.qualificationVersionId,
                qualificationVersions.id,
              ),
            )
            .innerJoin(
              qualifications,
              eq(qualificationVersions.qualificationId, qualifications.id),
            )
            .where(
              and(
                eq(learnerQualifications.learnerId, learner.learnerId),
                eq(learnerQualifications.status, "active"),
              ),
            );

          const examCountdown: ExamCountdownEntry[] = [];
          for (const qual of qualEnrollments) {
            if (!qual.examDate) continue;
            const examDate = new Date(qual.examDate + "T00:00:00");
            const daysRemaining = calculateDaysToExam(now, examDate);
            if (daysRemaining < 0) continue;
            examCountdown.push({
              qualificationName: qual.qualName,
              daysRemaining,
            });
          }
          examCountdown.sort((a, b) => a.daysRemaining - b.daysRemaining);

          const closestPhase =
            examCountdown.length > 0
              ? determinePhase(examCountdown[0].daysRemaining)
              : determinePhase(999);

          // Skip if there's nothing to show
          if (
            weekPlan.length === 0 &&
            examCountdown.length === 0 &&
            streakCount === 0
          ) {
            structuredLog("student-weekly-email.skipped", {
              learnerId: learner.learnerId,
              reason: "no_content",
              currentPlanId: currentPlan?.id ?? null,
            });

            return {
              learnerId: learner.learnerId,
              status: "skipped" as const,
              reason: "no_content",
            };
          }

          // --- Render and send ---
          const emailProps: StudentWeeklyEmailProps = {
            firstName: learner.firstName,
            weekPlan,
            totalTimeEstimate,
            streakCount,
            examCountdown,
            phaseName: closestPhase,
          };

          const html = await renderStudentWeeklyEmail(emailProps);
          const subject = `Your week ahead, ${learner.firstName}`;

          try {
            await sendEmail({ to: learner.email, subject, html });
          } catch (error) {
            structuredLog("student-weekly-email.failed", {
              learnerId: learner.learnerId,
              email: learner.email,
              subject,
              currentPlanId: currentPlan?.id ?? null,
              blocksPlanned: planBlocks.length,
              streakCount,
              examCount: examCountdown.length,
              phase: closestPhase,
              error: error instanceof Error ? error.message : String(error),
            });

            return {
              learnerId: learner.learnerId,
              status: "failed" as const,
              reason: "email_send_failed",
            };
          }

          structuredLog("student-weekly-email.sent", {
            learnerId: learner.learnerId,
            currentPlanId: currentPlan?.id ?? null,
            blocksPlanned: planBlocks.length,
            streakCount,
            examCount: examCountdown.length,
            phase: closestPhase,
          });

          return { learnerId: learner.learnerId, status: "sent" as const };
        },
      );
      results.push(result);
    }

    return {
      processed: activeLearners.length,
      sent: results.filter((result) => result.status === "sent").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    };
  },
);
