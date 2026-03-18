import React from "react";
import { cn } from "@/lib/utils";

export interface ExamInfo {
  qualificationName: string;
  examDate: Date;
  daysRemaining: number;
}

export interface ExamCountdownProps {
  exams: ExamInfo[];
  className?: string;
}

function urgencyClass(days: number): string {
  if (days <= 14) return "text-red-600";
  if (days <= 30) return "text-amber-600";
  return "text-foreground";
}

function urgencyLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

export function ExamCountdown({ exams, className }: ExamCountdownProps) {
  if (exams.length === 0) {
    return (
      <div data-testid="exam-countdown-empty" className={cn("text-sm text-muted-foreground", className)}>
        No upcoming exams
      </div>
    );
  }

  return (
    <div data-testid="exam-countdown" className={cn("space-y-3", className)}>
      {exams.map((exam, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground truncate">
            {exam.qualificationName}
          </span>
          <span
            data-testid="exam-days"
            className={cn("shrink-0 font-serif text-lg font-bold tabular-nums", urgencyClass(exam.daysRemaining))}
          >
            {urgencyLabel(exam.daysRemaining)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function computeExamCountdown(
  qualifications: Array<{
    name: string;
    examDate: Date | null;
  }>,
  now: Date = new Date(),
): ExamInfo[] {
  return qualifications
    .filter((q): q is { name: string; examDate: Date } => q.examDate !== null)
    .map((q) => {
      const diffMs = q.examDate.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      return {
        qualificationName: q.name,
        examDate: q.examDate,
        daysRemaining,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}
