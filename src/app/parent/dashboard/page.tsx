import { db } from "@/lib/db";
import {
  guardianLinks,
  learners,
  users,
  weeklyReports,
  safetyFlags,
  learnerQualifications,
  qualificationVersions,
  qualifications,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { LearnerCard } from "@/components/parent/learner-card";
import { computeExamCountdown } from "@/components/parent/exam-countdown";
import type { WeeklyReportData, LearnerId, TopicId } from "@/lib/types";

// TODO: Replace with real Clerk auth once Task 2.1 (Auth + Layout) is merged
async function getGuardianUserId(): Promise<string | null> {
  return null;
}

export default async function ParentDashboardPage() {
  const guardianUserId = await getGuardianUserId();

  if (!guardianUserId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Sign in required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please sign in to view your children&apos;s progress.
        </p>
      </div>
    );
  }

  const linkedLearners = await db
    .select({
      learnerId: guardianLinks.learnerId,
      displayName: learners.displayName,
      yearGroup: learners.yearGroup,
    })
    .from(guardianLinks)
    .innerJoin(learners, eq(guardianLinks.learnerId, learners.id))
    .where(eq(guardianLinks.guardianUserId, guardianUserId));

  if (linkedLearners.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">No linked learners</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have any linked learners yet.
        </p>
      </div>
    );
  }

  const cards = await Promise.all(
    linkedLearners.map(async (ll) => {
      const [latestReportRow] = await db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.learnerId, ll.learnerId))
        .orderBy(desc(weeklyReports.createdAt))
        .limit(1);

      const activeFlags = await db
        .select({
          type: safetyFlags.flagType,
          severity: safetyFlags.severity,
          description: safetyFlags.description,
        })
        .from(safetyFlags)
        .where(
          and(
            eq(safetyFlags.learnerId, ll.learnerId),
            eq(safetyFlags.resolved, false),
          ),
        );

      const quals = await db
        .select({
          name: qualifications.name,
          examDate: learnerQualifications.examDate,
          targetGrade: learnerQualifications.targetGrade,
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
            eq(learnerQualifications.learnerId, ll.learnerId),
            eq(learnerQualifications.status, "active"),
          ),
        );

      const exams = computeExamCountdown(
        quals.map((q) => ({
          name: q.name,
          examDate: q.examDate ? new Date(q.examDate) : null,
        })),
      );

      const latestReport: WeeklyReportData | null = latestReportRow
        ? {
            learnerId: latestReportRow.learnerId as LearnerId,
            periodStart: new Date(latestReportRow.periodStart),
            periodEnd: new Date(latestReportRow.periodEnd),
            sessionsCompleted: latestReportRow.sessionsCompleted,
            totalStudyMinutes: latestReportRow.totalStudyMinutes,
            topicsReviewed: latestReportRow.topicsReviewed,
            masteryChanges:
              (latestReportRow.masteryChanges as WeeklyReportData["masteryChanges"]) ??
              [],
            flags:
              (latestReportRow.flags as WeeklyReportData["flags"]) ?? [],
            summary: latestReportRow.summary,
          }
        : null;

      return {
        id: ll.learnerId,
        displayName: ll.displayName,
        yearGroup: ll.yearGroup,
        exams,
        latestReport,
        activeFlags: activeFlags.map((f) => ({
          type: f.type,
          severity: f.severity as "low" | "medium" | "high",
          description: f.description,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Your children</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {cards.map((card) => (
          <LearnerCard key={card.id} {...card} />
        ))}
      </div>
    </div>
  );
}
