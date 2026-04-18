"use client";

import { Button } from "@/components/ui/button";

export interface SessionRecoveryCardProps {
  topicName: string;
  statusLabel: string;
  title: string;
  description: string;
  summary: string | null;
  actionLabel: string | null;
  onRestart?: () => void;
  onBackToDashboard?: () => void;
}

export function SessionRecoveryCard({
  topicName,
  statusLabel,
  title,
  description,
  summary,
  actionLabel,
  onRestart,
  onBackToDashboard,
}: SessionRecoveryCardProps) {
  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border border-[#E5D9BF] bg-[#FFF8EA] p-6"
      data-testid="session-recovery-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9A6A1F]">
            {statusLabel}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#2F2414]">{title}</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#6A5840]">
          {topicName}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#5C4C36]">
        {description}
      </p>

      {summary ? (
        <div
          className="mt-4 rounded-xl border border-white/80 bg-white/70 p-4"
          data-testid="session-recovery-summary"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9A6A1F]">
            Last summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#5C4C36]">
            {summary}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        {actionLabel && onRestart ? (
          <Button
            onClick={onRestart}
            className="flex-1 bg-[#B7791F] text-white hover:bg-[#9A6A1F]"
            size="lg"
            data-testid="session-recovery-action"
          >
            {actionLabel}
          </Button>
        ) : null}
        {onBackToDashboard ? (
          <Button
            onClick={onBackToDashboard}
            variant="outline"
            className="flex-1"
            size="lg"
            data-testid="session-recovery-dashboard"
          >
            Back to Dashboard
          </Button>
        ) : null}
      </div>
    </div>
  );
}
