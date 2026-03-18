import React from "react";
import { cn } from "@/lib/utils";

export interface StudyPatternsProps {
  sessionsCompleted: number;
  totalStudyMinutes: number;
  topicsReviewed: number;
  dailyBreakdown?: Array<{
    dayLabel: string;
    minutes: number;
  }>;
  className?: string;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function StudyPatterns({
  sessionsCompleted,
  totalStudyMinutes,
  topicsReviewed,
  dailyBreakdown,
  className,
}: StudyPatternsProps) {
  const maxMinutes = dailyBreakdown
    ? Math.max(...dailyBreakdown.map((d) => d.minutes), 1)
    : 0;

  return (
    <div data-testid="study-patterns" className={cn("space-y-4", className)}>
      <div className="grid grid-cols-3 gap-4">
        <StatCard value={sessionsCompleted} label="Sessions" />
        <StatCard value={formatMinutes(totalStudyMinutes)} label="Study time" />
        <StatCard value={topicsReviewed} label="Topics" />
      </div>

      {dailyBreakdown && dailyBreakdown.length > 0 && (
        <div data-testid="daily-breakdown" className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Daily activity
          </p>
          <div className="flex items-end gap-1.5 h-16">
            {dailyBreakdown.map((day, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-sm bg-primary/80"
                  style={{ height: `${Math.max((day.minutes / maxMinutes) * 100, 4)}%` }}
                  title={`${day.minutes}m`}
                />
                <span className="text-[10px] text-muted-foreground">{day.dayLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <div data-testid="stat-value" className="font-serif text-2xl font-bold tabular-nums">
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export { formatMinutes, StatCard };
