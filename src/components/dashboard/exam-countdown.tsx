import type { DashboardQualification } from "./types";
import { daysUntil } from "./utils";
import { cn } from "@/lib/utils";

interface ExamCountdownProps {
  qualifications: DashboardQualification[];
}

export function ExamCountdown({ qualifications }: ExamCountdownProps) {
  const exams = qualifications
    .filter((q) => q.examDate !== null)
    .map((q) => ({
      ...q,
      daysLeft: daysUntil(q.examDate)!,
    }))
    .filter((q) => q.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (exams.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {exams.map((exam) => {
        const urgent = exam.daysLeft <= 14;
        const soon = exam.daysLeft <= 30;

        return (
          <div
            key={exam.id}
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-3",
              urgent
                ? "border-red-200 bg-red-50"
                : soon
                  ? "border-amber-200 bg-amber-50"
                  : "border-[#E8E4DB] bg-white"
            )}
          >
            <div>
              <p className="text-sm font-medium text-[#1A1A2E]">
                {exam.subjectName}
              </p>
              <p className="text-xs text-[#6B7280]">
                {exam.qualificationName} &middot; {exam.examBoardCode}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "font-[family-name:var(--font-serif)] text-xl",
                  urgent
                    ? "text-[#F97066]"
                    : soon
                      ? "text-amber-600"
                      : "text-teal-600"
                )}
              >
                {exam.daysLeft}
              </p>
              <p className="text-xs text-[#6B7280]">days</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
