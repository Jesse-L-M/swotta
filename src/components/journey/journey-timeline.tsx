"use client";

import type { JourneyData } from "./types";
import { JourneyStats } from "./journey-stats";
import { MisconceptionCard } from "./misconception-card";
import { MilestoneCard } from "./milestone-card";

export interface JourneyTimelineProps {
  data: JourneyData;
}

function EmptyJourney() {
  return (
    <div
      className="rounded-xl border border-[#E5E0D6] bg-white p-8 text-center"
      data-testid="journey-empty"
    >
      <p className="font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
        Your learning journey starts here
      </p>
      <p className="mt-2 text-sm text-[#5C5950]">
        As you study, misconceptions you encounter will appear here — along with
        your progress conquering them.
      </p>
    </div>
  );
}

export function JourneyTimeline({ data }: JourneyTimelineProps) {
  const hasMisconceptions =
    data.conquered.length > 0 || data.active.length > 0;

  return (
    <div className="space-y-8" data-testid="journey-timeline">
      <JourneyStats stats={data.stats} />

      {data.milestones.length > 0 && (
        <section data-testid="milestones-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Recent milestones
          </h2>
          <div className="space-y-3">
            {data.milestones.slice(0, 5).map((m) => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
          </div>
        </section>
      )}

      {!hasMisconceptions && <EmptyJourney />}

      {data.active.length > 0 && (
        <section data-testid="active-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Active misconceptions
            <span className="ml-2 inline-flex items-center rounded-full bg-[#FAEAE5] px-2 py-0.5 text-xs font-medium text-[#D4654A]">
              {data.active.length}
            </span>
          </h2>
          <div className="space-y-3">
            {data.active.map((thread) => (
              <MisconceptionCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      )}

      {data.conquered.length > 0 && (
        <section data-testid="conquered-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Conquered misconceptions
            <span className="ml-2 inline-flex items-center rounded-full bg-[#E4F0ED] px-2 py-0.5 text-xs font-medium text-[#2D7A6E]">
              {data.conquered.length}
            </span>
          </h2>
          <div className="space-y-3">
            {data.conquered.map((thread) => (
              <MisconceptionCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
