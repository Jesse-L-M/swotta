import { db } from "@/lib/db";
import { loadTodayQueue } from "@/components/dashboard/data";
import { loadQualifications } from "@/components/dashboard/data";
import { loadJourneyData } from "@/components/journey/data";
import { JourneyTimeline } from "@/components/journey/journey-timeline";
import { PostExamSummary } from "@/components/journey/post-exam-summary";
import {
  generatePostExamSummary,
  calculateDaysToExam,
} from "@/engine/proximity";
import type { LearnerId, QualificationVersionId } from "@/lib/types";
import { requireStudentPageAuth } from "../student-page-auth";

export default async function JourneyPage() {
  const { learner } = await requireStudentPageAuth("/journey");

  const [journeyData, qualifications, todayQueue] = await Promise.all([
    loadJourneyData(learner.id, db),
    loadQualifications(learner.id, db),
    loadTodayQueue(learner.id, db),
  ]);

  const now = new Date();
  const pastExams = qualifications.filter((q) => {
    if (!q.examDate) return false;
    const examDate = new Date(q.examDate + "T00:00:00");
    return calculateDaysToExam(now, examDate) < 0;
  });

  const postExamSummaries = await Promise.all(
    pastExams.map((q) =>
      generatePostExamSummary(
        db,
        learner.id as LearnerId,
        q.qualificationVersionId as QualificationVersionId
      )
    )
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
          Your learning journey
        </h1>
        <p className="mt-1 text-[#5C5950]">
          See what is getting stronger, what still trips you up, and how
          today&apos;s queue fits into that story.
        </p>
      </div>

      <JourneyTimeline data={journeyData} todayQueue={todayQueue} />

      {postExamSummaries.length > 0 && (
        <section data-testid="post-exam-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Exam summaries
          </h2>
          <div className="space-y-4">
            {postExamSummaries.map((summary, idx) => (
              <PostExamSummary key={idx} summary={summary} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
