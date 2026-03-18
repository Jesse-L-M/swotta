"use client";

import type { DiagnosticProgress } from "./types";

interface ChatHeaderProps {
  qualificationName: string;
  progress: DiagnosticProgress;
  topicCount: number;
}

export function ChatHeader({
  qualificationName,
  progress,
  topicCount,
}: ChatHeaderProps) {
  const total = progress.total || topicCount;
  const explored = progress.explored.length;
  const percent = total > 0 ? Math.round((explored / total) * 100) : 0;

  function getStatusText(): string {
    if (explored === 0) return "Getting started...";
    if (explored >= total) return `All ${total} topics explored`;
    if (progress.current) return `Exploring: ${progress.current}`;
    return `${explored} of ${total} topics explored`;
  }

  return (
    <div
      className="border-b border-[#E5E0D6] bg-white px-4 py-3"
      data-testid="chat-header"
    >
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-serif)] text-[1.125rem] leading-[1.3] text-[#1A1917]">
              {qualificationName} Diagnostic
            </h2>
            <p
              className="mt-0.5 text-[0.875rem] leading-[1.5] text-[#949085]"
              data-testid="progress-status"
            >
              {getStatusText()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[0.875rem] font-medium tabular-nums text-[#2D7A6E]"
              data-testid="progress-count"
            >
              {explored}/{total}
            </span>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
          <div
            className="h-full rounded-full bg-[#2D7A6E] transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>
    </div>
  );
}
