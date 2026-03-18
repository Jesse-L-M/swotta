"use client";

import type { MisconceptionThread } from "./types";
import { formatDate, formatRelativeDate, severityLabel } from "./utils";

export interface MisconceptionCardProps {
  thread: MisconceptionThread;
}

export function MisconceptionCard({ thread }: MisconceptionCardProps) {
  const isConquered = thread.resolved;

  const borderColor = isConquered ? "border-[#2D7A6E]" : "border-[#D4654A]";
  const badgeBg = isConquered ? "bg-[#E4F0ED]" : "bg-[#FAEAE5]";
  const badgeText = isConquered ? "text-[#2D7A6E]" : "text-[#D4654A]";
  const badgeLabel = isConquered ? "Conquered" : "Active";

  return (
    <div
      className={`rounded-xl border-l-[3px] bg-white p-4 shadow-[0_1px_3px_rgba(26,25,23,0.05)] ${borderColor}`}
      data-testid="misconception-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="font-medium text-[#1A1917]"
            data-testid="misconception-description"
          >
            {thread.description}
          </p>
          <p className="mt-1 text-sm text-[#5C5950]" data-testid="misconception-topic">
            {thread.topicName}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeBg} ${badgeText}`}
          data-testid="misconception-status"
        >
          {badgeLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#949085]">
        <span data-testid="misconception-first-seen">
          First seen: {formatDate(thread.firstSeenAt)}
        </span>
        <span data-testid="misconception-occurrences">
          {thread.occurrenceCount} {thread.occurrenceCount === 1 ? "session" : "sessions"}
        </span>
        <span data-testid="misconception-severity">
          {severityLabel(thread.severity)}
        </span>
        {isConquered && thread.resolvedAt && (
          <span data-testid="misconception-resolved-at">
            Resolved: {formatRelativeDate(thread.resolvedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
