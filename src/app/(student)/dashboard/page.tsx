import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  loadLearnerByUserId,
  loadQualifications,
  loadDashboardStats,
  loadMasteryTopics,
  loadTodayQueue,
} from "@/components/dashboard/data";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodayQueue } from "@/components/dashboard/today-queue";
import { SubjectList } from "@/components/dashboard/subject-list";
import { ExamCountdown } from "@/components/dashboard/exam-countdown";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  getGreeting,
  formatStudyMinutes,
  masteryPercent,
  nextExam,
  getMasteryState,
} from "@/components/dashboard/utils";

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const learner = await loadLearnerByUserId(ctx.user.id, db);
  if (!learner) redirect("/onboarding");

  const qualifications = await loadQualifications(learner.id, db);

  if (qualifications.length === 0) {
    return <EmptyState learnerName={learner.displayName} />;
  }

  const [stats, masteryTopics, todayQueue] = await Promise.all([
    loadDashboardStats(learner.id, db),
    loadMasteryTopics(learner.id, db),
    loadTodayQueue(learner.id, db),
  ]);

  const closest = nextExam(qualifications);
  const greeting = getGreeting(learner.displayName);
  const masteryState = getMasteryState(stats.averageMastery);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1A2E]">
          {greeting}
        </h1>
        <p className="mt-1 text-[#6B7280]">
          Here&apos;s your study overview for today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Average mastery"
          value={`${masteryPercent(stats.averageMastery)}%`}
          detail={`${stats.topicsStudied} of ${stats.topicsTotal} topics`}
          accent={
            masteryState === "strong"
              ? "teal"
              : masteryState === "developing"
                ? "amber"
                : "coral"
          }
        />
        <StatCard
          label="Sessions"
          value={String(stats.totalSessions)}
          detail={formatStudyMinutes(stats.totalStudyMinutes) + " total"}
          accent="neutral"
        />
        <StatCard
          label="Streak"
          value={String(stats.currentStreak)}
          detail="consecutive reviews"
          accent={stats.currentStreak > 0 ? "teal" : "neutral"}
        />
        <StatCard
          label="Next exam"
          value={closest ? `${closest.daysLeft}d` : "--"}
          detail={closest ? "days remaining" : "No upcoming exams"}
          accent={
            closest
              ? closest.daysLeft <= 14
                ? "coral"
                : closest.daysLeft <= 30
                  ? "amber"
                  : "teal"
              : "neutral"
          }
        />
      </div>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          Today&apos;s queue
        </h2>
        <TodayQueue blocks={todayQueue} />
      </section>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          Your subjects
        </h2>
        <SubjectList
          qualifications={qualifications}
          masteryTopics={masteryTopics}
        />
      </section>

      {qualifications.some((q) => q.examDate !== null) && (
        <section>
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
            Exam countdown
          </h2>
          <ExamCountdown qualifications={qualifications} />
        </section>
      )}
    </div>
  );
}
