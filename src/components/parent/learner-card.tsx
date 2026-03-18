import React from "react";
import { cn } from "@/lib/utils";
import type { WeeklyReportData } from "@/lib/types";
import { ExamCountdown, type ExamInfo } from "./exam-countdown";
import { FlagAlertList } from "./flag-alerts";

export interface LearnerCardProps {
  id: string;
  displayName: string;
  yearGroup: number | null;
  exams: ExamInfo[];
  latestReport: WeeklyReportData | null;
  activeFlags: Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  className?: string;
}

export function LearnerCard({
  id,
  displayName,
  yearGroup,
  exams,
  latestReport,
  activeFlags,
  className,
}: LearnerCardProps) {
  return (
    <div
      data-testid="learner-card"
      className={cn(
        "rounded-lg border bg-card p-5 shadow-sm space-y-4",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{displayName}</h3>
          {yearGroup !== null && (
            <p className="text-sm text-muted-foreground">Year {yearGroup}</p>
          )}
        </div>
        <a
          href={`/parent/learners/${id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View details
        </a>
      </div>

      {/* Quick stats */}
      {latestReport ? (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div data-testid="stat-value" className="font-serif text-xl font-bold tabular-nums">
              {latestReport.sessionsCompleted}
            </div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </div>
          <div>
            <div data-testid="stat-value" className="font-serif text-xl font-bold tabular-nums">
              {latestReport.totalStudyMinutes}
            </div>
            <div className="text-xs text-muted-foreground">Minutes</div>
          </div>
          <div>
            <div data-testid="stat-value" className="font-serif text-xl font-bold tabular-nums">
              {latestReport.topicsReviewed}
            </div>
            <div className="text-xs text-muted-foreground">Topics</div>
          </div>
        </div>
      ) : (
        <p data-testid="no-report" className="text-sm text-muted-foreground">
          No reports yet
        </p>
      )}

      {/* Exam countdown */}
      {exams.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Upcoming exams
          </p>
          <ExamCountdown exams={exams} />
        </div>
      )}

      {/* Active flags */}
      {activeFlags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Attention needed
          </p>
          <FlagAlertList flags={activeFlags} />
        </div>
      )}
    </div>
  );
}
