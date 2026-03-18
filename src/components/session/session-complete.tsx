"use client";

import { Button } from "@/components/ui/button";
import type { AttemptOutcome } from "@/lib/types";

export interface SessionCompleteProps {
  summary: string;
  outcome: AttemptOutcome;
  elapsedSeconds: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  onNextBlock?: () => void;
  onBackToDashboard?: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return "< 1 min";
  return `${mins} min`;
}

export function SessionComplete({
  summary,
  outcome,
  elapsedSeconds,
  confidenceBefore,
  confidenceAfter,
  onNextBlock,
  onBackToDashboard,
}: SessionCompleteProps) {
  const confidenceChanged =
    confidenceBefore !== null &&
    confidenceAfter !== null &&
    confidenceAfter > confidenceBefore;

  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border border-teal-200 bg-teal-50 p-6"
      data-testid="session-complete"
    >
      <div className="text-center">
        <div className="mb-3 text-3xl" data-testid="celebration-icon">
          {outcome.score !== null && outcome.score >= 80 ? "🌟" : "✓"}
        </div>
        <h2 className="text-xl font-bold text-teal-800">Session Complete</h2>
        <p className="mt-2 text-sm text-teal-700">{summary}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <StatCard
          label="Time"
          value={formatDuration(elapsedSeconds)}
          testId="stat-time"
        />
        <StatCard
          label="Score"
          value={
            outcome.score !== null ? `${Math.round(outcome.score)}%` : "--"
          }
          testId="stat-score"
        />
        {confidenceBefore !== null && (
          <StatCard
            label="Confidence Before"
            value={`${Math.round(confidenceBefore * 100)}%`}
            testId="stat-confidence-before"
          />
        )}
        {confidenceAfter !== null && (
          <StatCard
            label="Confidence After"
            value={`${Math.round(confidenceAfter * 100)}%`}
            testId="stat-confidence-after"
          />
        )}
      </div>

      {confidenceChanged && (
        <p
          className="mt-4 text-center text-sm font-medium text-teal-700"
          data-testid="confidence-improved"
        >
          Your confidence improved this session!
        </p>
      )}

      {outcome.misconceptions.length > 0 && (
        <div className="mt-4" data-testid="misconceptions-section">
          <p className="text-sm font-semibold text-teal-800">
            Areas to review:
          </p>
          <ul className="mt-1 space-y-1">
            {outcome.misconceptions.map((m, i) => (
              <li key={i} className="text-sm text-teal-700">
                - {m.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {onNextBlock && (
          <Button
            onClick={onNextBlock}
            className="flex-1 bg-teal-600 text-white hover:bg-teal-700"
            size="lg"
            data-testid="next-block-btn"
          >
            Next Block
          </Button>
        )}
        {onBackToDashboard && (
          <Button
            onClick={onBackToDashboard}
            variant="outline"
            className="flex-1"
            size="lg"
            data-testid="dashboard-btn"
          >
            Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg bg-white/60 p-3 text-center"
      data-testid={testId}
    >
      <p className="text-xs text-teal-600">{label}</p>
      <p className="text-lg font-bold text-teal-800">{value}</p>
    </div>
  );
}

export { formatDuration, StatCard };
