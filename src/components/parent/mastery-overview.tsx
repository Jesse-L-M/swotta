import React from "react";
import { cn } from "@/lib/utils";

export interface MasteryChange {
  topicName: string;
  before: number;
  after: number;
  delta: number;
}

export interface MasteryOverviewProps {
  changes: MasteryChange[];
  className?: string;
}

function deltaLabel(delta: number): string {
  const pct = Math.round(delta * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function deltaColor(delta: number): string {
  if (delta > 0) return "text-emerald-600";
  if (delta < 0) return "text-red-600";
  return "text-muted-foreground";
}

function masteryBarColor(level: number): string {
  if (level >= 0.7) return "bg-emerald-500";
  if (level >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export function MasteryOverview({ changes, className }: MasteryOverviewProps) {
  if (changes.length === 0) {
    return (
      <div data-testid="mastery-empty" className={cn("text-sm text-muted-foreground", className)}>
        No mastery data this week
      </div>
    );
  }

  const sorted = [...changes].sort((a, b) => b.delta - a.delta);

  return (
    <div data-testid="mastery-overview" className={cn("space-y-2", className)}>
      {sorted.map((change, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm truncate">{change.topicName}</span>
            <span
              data-testid="mastery-delta"
              className={cn("shrink-0 font-serif text-sm font-semibold tabular-nums", deltaColor(change.delta))}
            >
              {deltaLabel(change.delta)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              data-testid="mastery-bar"
              className={cn("h-full rounded-full transition-all", masteryBarColor(change.after))}
              style={{ width: `${Math.round(change.after * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function computeStrengths(changes: MasteryChange[]): MasteryChange[] {
  return changes
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta);
}

export function computeAreasToWatch(changes: MasteryChange[]): MasteryChange[] {
  return changes
    .filter((c) => c.delta < 0 || c.after < 0.4)
    .sort((a, b) => a.delta - b.delta);
}
