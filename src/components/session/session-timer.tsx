"use client";

import { cn } from "@/lib/utils";
import type { BlockType } from "@/lib/types";

export interface SessionTimerProps {
  elapsedSeconds: number;
  durationMinutes: number;
  blockType: BlockType;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SessionTimer({
  elapsedSeconds,
  durationMinutes,
  blockType,
}: SessionTimerProps) {
  const isTimed = blockType === "timed_problems";
  const totalSeconds = durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const isOvertime = isTimed && elapsedSeconds > totalSeconds;
  const progressPercent = Math.min(
    100,
    (elapsedSeconds / totalSeconds) * 100
  );

  return (
    <div className="flex items-center gap-3" data-testid="session-timer">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            isOvertime ? "bg-destructive" : "bg-teal-500"
          )}
          style={{ width: `${progressPercent}%` }}
          data-testid="timer-progress-bar"
        />
      </div>
      <span
        className={cn(
          "min-w-[4rem] text-right text-sm font-mono tabular-nums",
          isOvertime && "text-destructive font-semibold"
        )}
        data-testid="timer-display"
      >
        {isTimed ? formatTime(remainingSeconds) : formatTime(elapsedSeconds)}
      </span>
    </div>
  );
}

export { formatTime };
