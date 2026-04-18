"use client";

import { formatStudyMinutes } from "@/components/dashboard/utils";
import type { JourneyStats as JourneyStatsType } from "./types";
import { conqueredPercent } from "./utils";

export interface JourneyStatsProps {
  stats: JourneyStatsType;
}

export function JourneyStat({
  label,
  value,
  detail,
  accent = "neutral",
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: "teal" | "coral" | "neutral";
  testId?: string;
}) {
  const accentStyles = {
    teal: "border-[#2D7A6E] bg-[#E4F0ED]",
    coral: "border-[#D4654A] bg-[#FAEAE5]",
    neutral: "border-[#E5E0D6] bg-white",
  };

  return (
    <div
      className={`rounded-lg border-l-[3px] p-4 ${accentStyles[accent]}`}
      data-testid={testId}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[#949085]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-2xl font-medium text-[#1A1917]">
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 text-sm text-[#5C5950]">{detail}</p>
      )}
    </div>
  );
}

export function JourneyStats({ stats }: JourneyStatsProps) {
  const conquered = conqueredPercent(
    stats.misconceptionsConquered,
    stats.misconceptionsTotal
  );

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      data-testid="journey-stats"
    >
      <JourneyStat
        label="Study momentum"
        value={`${stats.sessionsThisWeek} this week`}
        detail={
          stats.sessionsThisWeek > 0
            ? `${formatStudyMinutes(stats.studyMinutesThisWeek)} in the last 7 days`
            : "No completed sessions in the last 7 days"
        }
        accent={stats.sessionsThisWeek > 0 ? "teal" : "neutral"}
        testId="stat-sessions"
      />
      <JourneyStat
        label="Misconceptions conquered"
        value={String(stats.misconceptionsConquered)}
        detail={
          stats.misconceptionsTotal > 0
            ? `${conquered}% of the slips you've met so far`
            : "None encountered yet"
        }
        accent={stats.misconceptionsConquered > 0 ? "teal" : "neutral"}
        testId="stat-conquered"
      />
      <JourneyStat
        label="Active misconceptions"
        value={String(
          stats.misconceptionsTotal - stats.misconceptionsConquered
        )}
        detail={
          stats.misconceptionsTotal - stats.misconceptionsConquered > 0
            ? "These are still worth checking in your next sessions"
            : "Nothing is currently recurring"
        }
        accent={
          stats.misconceptionsTotal - stats.misconceptionsConquered > 0
            ? "coral"
            : "neutral"
        }
        testId="stat-active"
      />
      <JourneyStat
        label="Spec coverage"
        value={`${stats.specCoveragePercent}%`}
        detail={`${stats.topicsCovered} of ${stats.totalTopics} topics with study evidence`}
        accent={stats.specCoveragePercent >= 50 ? "teal" : "neutral"}
        testId="stat-coverage"
      />
    </div>
  );
}
