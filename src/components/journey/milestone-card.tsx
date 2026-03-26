"use client";

import type { JourneyMilestone } from "./types";
import { formatRelativeDate, buildMilestoneMessage } from "./utils";

export interface MilestoneCardProps {
  milestone: JourneyMilestone;
}

export function MilestoneCard({ milestone }: MilestoneCardProps) {
  return (
    <div
      className="rounded-xl bg-[#D6EBE7] p-5"
      data-testid="milestone-card"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2D7A6E] text-sm text-white"
          data-testid="milestone-icon"
          aria-hidden="true"
        >
          &#x2713;
        </span>
        <div className="min-w-0">
          <p
            className="font-[family-name:var(--font-serif)] text-lg text-[#1A1917]"
            data-testid="milestone-message"
          >
            {buildMilestoneMessage(milestone.description, milestone.topicName)}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-[#2D7A6E]">
            <span data-testid="milestone-date">
              {formatRelativeDate(milestone.resolvedAt)}
            </span>
            <span data-testid="milestone-sessions">
              After {milestone.occurrenceCount}{" "}
              {milestone.occurrenceCount === 1 ? "session" : "sessions"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
