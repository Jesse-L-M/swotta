"use client";

import type { PostExamSummary as PostExamSummaryType } from "@/engine/proximity";
import { formatDate } from "./utils";

export interface PostExamSummaryProps {
  summary: PostExamSummaryType;
}

function SummaryStatRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center justify-between border-b border-[#EFEBE4] py-3 last:border-b-0"
      data-testid={testId}
    >
      <span className="text-sm text-[#A09B90]">{label}</span>
      <span className="font-[family-name:var(--font-jetbrains-mono)] text-sm font-medium text-[#F0ECE4]">
        {value}
      </span>
    </div>
  );
}

function TopicList({
  title,
  topics: topicList,
  accent,
  testId,
}: {
  title: string;
  topics: Array<{ topicName: string; mastery: number }>;
  accent: "teal" | "coral";
  testId: string;
}) {
  if (topicList.length === 0) return null;

  const dotColor = accent === "teal" ? "bg-[#4DAFA0]" : "bg-[#E8836A]";
  const textColor = accent === "teal" ? "text-[#4DAFA0]" : "text-[#E8836A]";

  return (
    <div data-testid={testId}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949085]">
        {title}
      </h4>
      <ul className="space-y-1.5">
        {topicList.map((t, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[#F0ECE4]">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`}
              />
              {t.topicName}
            </span>
            <span
              className={`font-[family-name:var(--font-jetbrains-mono)] text-xs ${textColor}`}
            >
              {Math.round(t.mastery * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PostExamSummary({ summary }: PostExamSummaryProps) {
  const resolveRate =
    summary.misconceptionsTotal > 0
      ? Math.round(
          (summary.misconceptionsResolved / summary.misconceptionsTotal) * 100
        )
      : 0;

  return (
    <div
      className="rounded-xl bg-[#1A1917] p-6 text-white"
      data-testid="post-exam-summary"
    >
      <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#F0ECE4]">
        Exam Summary
      </h2>
      <p className="mt-1 text-sm text-[#949085]">
        {summary.qualificationName} &mdash;{" "}
        {formatDate(summary.examDate)}
      </p>

      <div className="mt-6 rounded-lg bg-[#222120] p-4">
        <SummaryStatRow
          label="Sessions completed"
          value={String(summary.sessionsCompleted)}
          testId="summary-sessions"
        />
        <SummaryStatRow
          label="Total study time"
          value={`${summary.totalStudyMinutes} min`}
          testId="summary-time"
        />
        <SummaryStatRow
          label="Spec coverage"
          value={`${summary.specCoveragePercent}%`}
          testId="summary-coverage"
        />
        <SummaryStatRow
          label="Average mastery"
          value={`${Math.round(summary.averageMastery * 100)}%`}
          testId="summary-mastery"
        />
        <SummaryStatRow
          label="Misconceptions conquered"
          value={
            summary.misconceptionsTotal > 0
              ? `${summary.misconceptionsResolved}/${summary.misconceptionsTotal} (${resolveRate}%)`
              : "None encountered"
          }
          testId="summary-misconceptions"
        />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <TopicList
          title="Strongest topics"
          topics={summary.strongestTopics}
          accent="teal"
          testId="summary-strongest"
        />
        <TopicList
          title="Areas for growth"
          topics={summary.weakestTopics}
          accent="coral"
          testId="summary-weakest"
        />
      </div>
    </div>
  );
}

export { SummaryStatRow, TopicList };
