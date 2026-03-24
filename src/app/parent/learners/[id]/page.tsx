import { db } from "@/lib/db";
import {
  guardianLinks,
  learners,
  weeklyReports,
  learnerQualifications,
  qualificationVersions,
  qualifications,
  studySessions,
} from "@/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { ReportView } from "@/components/parent/report-view";
import { computeExamCountdown } from "@/components/parent/exam-countdown";
import type { WeeklyReportData, LearnerId } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LearnerDetailPage({ params }: PageProps) {
  const { id: learnerId } = await params;
  const ctx = await getAuthContext();
  const guardianUserId = ctx?.user.id ?? null;

  if (!guardianUserId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Sign in required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please sign in to view this learner&apos;s progress.
        </p>
      </div>
    );
  }

  // Verify guardian link
  const [link] = await db
    .select()
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.guardianUserId, guardianUserId),
        eq(guardianLinks.learnerId, learnerId),
      ),
    )
    .limit(1);

  if (!link) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this learner&apos;s data.
        </p>
      </div>
    );
  }

  // Get learner info
  const [learnerRow] = await db
    .select()
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);

  if (!learnerRow) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Learner not found</h2>
      </div>
    );
  }

  // Latest report
  const [latestReportRow] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.learnerId, learnerId))
    .orderBy(desc(weeklyReports.createdAt))
    .limit(1);

  // Qualifications + exam dates
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
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active"),
      ),
    );

  const exams = computeExamCountdown(
    quals.map((q) => ({
      name: q.name,
      examDate: q.examDate ? new Date(q.examDate) : null,
    })),
  );

  // Compute daily breakdown from last 7 days of sessions
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentSessions = await db
    .select({
      startedAt: studySessions.startedAt,
      totalDurationMinutes: studySessions.totalDurationMinutes,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        eq(studySessions.status, "completed"),
        gte(studySessions.startedAt, sevenDaysAgo),
      ),
    );

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dailyMinutes = new Map<number, number>();
  for (const session of recentSessions) {
    const dayOfWeek = session.startedAt.getDay();
    // Convert JS day (0=Sun) to Mon-based (0=Mon)
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    dailyMinutes.set(
      dayIndex,
      (dailyMinutes.get(dayIndex) ?? 0) + (session.totalDurationMinutes ?? 0),
    );
  }

  const dailyBreakdown = dayLabels.map((label, i) => ({
    dayLabel: label,
    minutes: dailyMinutes.get(i) ?? 0,
  }));

  if (!latestReportRow) {
    return (
      <div className="space-y-6">
        <div>
          <a
            href="/parent/dashboard"
            className="text-sm text-primary hover:underline"
          >
            &larr; Back to dashboard
          </a>
        </div>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">{learnerRow.displayName}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No weekly reports yet. Reports are generated every Sunday.
          </p>
        </div>
      </div>
    );
  }

  const reportData: WeeklyReportData = {
    learnerId: latestReportRow.learnerId as LearnerId,
    periodStart: new Date(latestReportRow.periodStart),
    periodEnd: new Date(latestReportRow.periodEnd),
    sessionsCompleted: latestReportRow.sessionsCompleted,
    totalStudyMinutes: latestReportRow.totalStudyMinutes,
    topicsReviewed: latestReportRow.topicsReviewed,
    masteryChanges:
      (latestReportRow.masteryChanges as WeeklyReportData["masteryChanges"]) ?? [],
    flags: (latestReportRow.flags as WeeklyReportData["flags"]) ?? [],
    summary: latestReportRow.summary,
  };

  return (
    <div className="space-y-6">
      <div>
        <a
          href="/parent/dashboard"
          className="text-sm text-primary hover:underline"
        >
          &larr; Back to dashboard
        </a>
      </div>
      <ReportView
        data={reportData}
        learnerName={learnerRow.displayName}
        exams={exams}
        dailyBreakdown={dailyBreakdown}
      />
    </div>
  );
}
