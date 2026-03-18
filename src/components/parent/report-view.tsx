import React from "react";
import { cn } from "@/lib/utils";
import type { WeeklyReportData } from "@/lib/types";
import { FlagAlert, FlagAlertList } from "./flag-alerts";
import { ExamCountdown, type ExamInfo } from "./exam-countdown";
import { StudyPatterns } from "./study-patterns";
import {
  MasteryOverview,
  computeStrengths,
  computeAreasToWatch,
  type MasteryChange,
} from "./mastery-overview";

export interface ReportViewProps {
  data: WeeklyReportData;
  learnerName: string;
  exams: ExamInfo[];
  dailyBreakdown?: Array<{ dayLabel: string; minutes: number }>;
  className?: string;
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const startStr = start.toLocaleDateString("en-GB", opts);
  const endStr = end.toLocaleDateString("en-GB", {
    ...opts,
    year: "numeric",
  });
  return `${startStr} - ${endStr}`;
}

export function ReportView({
  data,
  learnerName,
  exams,
  dailyBreakdown,
  className,
}: ReportViewProps) {
  const changes: MasteryChange[] = data.masteryChanges.map((c) => ({
    topicName: c.topicName,
    before: c.before,
    after: c.after,
    delta: c.delta,
  }));
  const strengths = computeStrengths(changes);
  const areasToWatch = computeAreasToWatch(changes);

  return (
    <div data-testid="report-view" className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">
          Weekly Report: {learnerName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatDateRange(data.periodStart, data.periodEnd)}
        </p>
      </div>

      {/* Study patterns */}
      <Section title="Study patterns">
        <StudyPatterns
          sessionsCompleted={data.sessionsCompleted}
          totalStudyMinutes={data.totalStudyMinutes}
          topicsReviewed={data.topicsReviewed}
          dailyBreakdown={dailyBreakdown}
        />
      </Section>

      {/* Summary */}
      <Section title="Summary">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data.summary}
        </p>
      </Section>

      {/* Strengths */}
      {strengths.length > 0 && (
        <Section title="Strengths">
          <div data-testid="strengths-section" className="space-y-2">
            {strengths.map((s, i) => (
              <FlagAlert
                key={i}
                variant="success"
                title={s.topicName}
                description={`Mastery improved by ${Math.round(s.delta * 100)}%`}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Areas to watch */}
      {areasToWatch.length > 0 && (
        <Section title="Areas to watch">
          <div data-testid="areas-to-watch-section" className="space-y-2">
            {areasToWatch.map((a, i) => (
              <FlagAlert
                key={i}
                variant={a.delta < 0 ? "warning" : "danger"}
                title={a.topicName}
                description={
                  a.delta < 0
                    ? `Mastery declined by ${Math.abs(Math.round(a.delta * 100))}%`
                    : `Mastery at ${Math.round(a.after * 100)}% - needs attention`
                }
              />
            ))}
          </div>
        </Section>
      )}

      {/* Mastery progress */}
      {changes.length > 0 && (
        <Section title="Mastery progress">
          <MasteryOverview changes={changes} />
        </Section>
      )}

      {/* Exam countdown */}
      {exams.length > 0 && (
        <Section title="Exam countdown">
          <ExamCountdown exams={exams} />
        </Section>
      )}

      {/* Flags */}
      {data.flags.length > 0 && (
        <Section title="Attention needed">
          <FlagAlertList flags={data.flags} />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export { formatDateRange };
