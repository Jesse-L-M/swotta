"use client";

import type { SessionCard } from "@/engine/replay";
import { formatRelativeTime } from "@/engine/replay";

export interface ReplayCardProps {
  session: SessionCard;
  onShare?: (sessionId: string) => void;
  onViewDetails?: (sessionId: string) => void;
}

function getStatusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "completed":
      return { bg: "bg-[#E4F0ED]", text: "text-[#2D7A6E]", label: "Completed" };
    case "abandoned":
      return { bg: "bg-[#FAEAE5]", text: "text-[#D4654A]", label: "Abandoned" };
    case "timeout":
      return { bg: "bg-[#FAEAE5]", text: "text-[#D4654A]", label: "Timed Out" };
    default:
      return { bg: "bg-[#F0ECE4]", text: "text-[#5C5950]", label: "Active" };
  }
}

function getScoreStyle(score: number): string {
  if (score >= 70) return "text-[#2D7A6E]";
  if (score < 50) return "text-[#D4654A]";
  return "text-[#5C5950]";
}

export function ReplayCard({ session, onShare, onViewDetails }: ReplayCardProps) {
  const statusStyle = getStatusStyle(session.status);

  return (
    <div
      className="rounded-xl border border-[#E5E0D6] bg-white p-4 shadow-[0_1px_3px_rgba(26,25,23,0.05)] transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(26,25,23,0.08)]"
      data-testid="replay-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate font-[family-name:var(--font-serif)] text-lg font-normal text-[#1A1917]"
            data-testid="replay-topic"
          >
            {session.topicName}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {session.blockTypeLabel && (
              <span
                className="inline-block rounded-full bg-[#F0ECE4] px-2 py-0.5 text-xs font-medium text-[#5C5950]"
                data-testid="replay-block-type"
              >
                {session.blockTypeLabel}
              </span>
            )}
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
              data-testid="replay-status"
            >
              {statusStyle.label}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {session.score !== null && (
            <span
              className={`font-[family-name:var(--font-jetbrains-mono)] text-lg font-medium ${getScoreStyle(session.score)}`}
              data-testid="replay-score"
            >
              {Math.round(session.score)}%
            </span>
          )}
          <span
            className="text-xs text-[#949085]"
            data-testid="replay-time"
          >
            {formatRelativeTime(session.startedAt)}
          </span>
        </div>
      </div>

      {session.summary && (
        <p
          className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#5C5950]"
          data-testid="replay-summary"
        >
          {session.summary}
        </p>
      )}

      {session.durationMinutes !== null && session.durationMinutes > 0 && (
        <div className="mt-2 text-xs text-[#949085]" data-testid="replay-duration">
          {session.durationMinutes} min
        </div>
      )}

      {(onShare || onViewDetails) && (
        <div className="mt-3 flex gap-2 border-t border-[#EFEBE4] pt-3">
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(session.sessionId)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#2D7A6E] transition-colors duration-150 hover:bg-[#E4F0ED]"
              data-testid="replay-view-btn"
            >
              View Details
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(session.sessionId)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#5C5950] transition-colors duration-150 hover:bg-[#F0ECE4]"
              data-testid="replay-share-btn"
            >
              Share
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { getStatusStyle, getScoreStyle };
