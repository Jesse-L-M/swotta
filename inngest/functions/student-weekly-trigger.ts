import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  learnerQualifications,
  learners,
  users,
  studyBlocks,
  studyPlans,
  studySessions,
  topics,
  qualificationVersions,
  qualifications,
} from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
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
        firstName:
          r.userName.split(" ")[0] || r.displayName.split(" ")[0] || "there",
      }));
    });

    if (activeLearners.length === 0) {
      return { processed: 0, sent: 0, skipped: 0 };
    }

    const results: Array<{ learnerId: string; sent: boolean }> = [];

    for (const learner of activeLearners) {
      const result = await step.run(
        `send-weekly-${learner.learnerId}`,
        async () => {
          const now = new Date();

          // --- Fetch this week's plan blocks ---
          const planBlocks = await db
            .select({
              topicName: topics.name,
              blockType: studyBlocks.blockType,
              durationMinutes: studyBlocks.durationMinutes,
              scheduledDate: studyBlocks.scheduledDate,
              scheduledOrder: studyBlocks.scheduledOrder,
            })
            .from(studyBlocks)
            .innerJoin(studyPlans, eq(studyBlocks.planId, studyPlans.id))
            .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
            .where(
              and(
                eq(studyBlocks.learnerId, learner.learnerId),
                eq(studyPlans.status, "active"),
                eq(studyPlans.planType, "weekly"),
                eq(studyBlocks.status, "pending"),
              ),
            )
            .orderBy(
              asc(studyBlocks.scheduledDate),
              asc(studyBlocks.scheduledOrder),
            );

          // Group blocks by day
          const dayOrder = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ];
          const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];
          const dayMap = new Map<string, WeekPlanDay["blocks"]>();

          for (const block of planBlocks) {
            if (!block.scheduledDate) continue;
            const date = new Date(block.scheduledDate + "T00:00:00");
            const dayName = dayNames[date.getDay()];
            if (!dayMap.has(dayName)) dayMap.set(dayName, []);
            dayMap.get(dayName)!.push({
              topicName: block.topicName,
              blockTypeLabel:
                BLOCK_TYPE_LABELS[block.blockType as BlockType] ??
                block.blockType,
              durationMinutes: block.durationMinutes,
            });
          }

          const weekPlan: WeekPlanDay[] = dayOrder
            .filter((d) => dayMap.has(d))
            .map((d) => ({ day: d, blocks: dayMap.get(d)! }));

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
            return { learnerId: learner.learnerId, sent: false };
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

          await sendEmail({ to: learner.email, subject, html });

          structuredLog("student-weekly-email.sent", {
            learnerId: learner.learnerId,
            blocksPlanned: planBlocks.length,
            streakCount,
            examCount: examCountdown.length,
            phase: closestPhase,
          });

          return { learnerId: learner.learnerId, sent: true };
        },
      );
      results.push(result);
    }

    return {
      processed: activeLearners.length,
      sent: results.filter((r) => r.sent).length,
      skipped: results.filter((r) => !r.sent).length,
    };
  },
);
