"use client";

import type { DashboardQueueBlock } from "@/components/dashboard/types";
import { formatStudyMinutes } from "@/components/dashboard/utils";
import { ArrowRight } from "lucide-react";
import type { JourneyData } from "./types";
import { JourneyStats } from "./journey-stats";
import { MisconceptionCard } from "./misconception-card";
import { MilestoneCard } from "./milestone-card";
import { buildMomentumSummary } from "./utils";

export interface JourneyTimelineProps {
  data: JourneyData;
  todayQueue: DashboardQueueBlock[];
}

function EmptyJourney({ todayQueue }: { todayQueue: DashboardQueueBlock[] }) {
  const nextBlock = todayQueue[0] ?? null;

  return (
    <div
      className="rounded-xl border border-[#E5E0D6] bg-white p-8 text-center"
      data-testid="journey-empty"
    >
      <p className="font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
        Your learning journey starts here
      </p>
      <p className="mt-2 text-sm text-[#5C5950]">
        As you study, this page will start showing which ideas keep recurring,
        which ones are settling down, and what progress you have already locked
        in.
      </p>
      <a
        href={nextBlock ? `/session/${nextBlock.id}` : "/dashboard"}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        {nextBlock ? "Start today's next block" : "Back to dashboard"}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

export function JourneyTimeline({ data, todayQueue }: JourneyTimelineProps) {
  const hasMisconceptions =
    data.conquered.length > 0 || data.active.length > 0;
  const nextBlock = todayQueue[0] ?? null;
  const totalQueueMinutes = todayQueue.reduce(
    (sum, block) => sum + block.durationMinutes,
    0
  );
  const momentum = buildMomentumSummary({
    nextBlock,
    queueCount: todayQueue.length,
    activeMisconceptions: data.active.length,
  });

  return (
    <div className="space-y-8" data-testid="journey-timeline">
      <section
        className="rounded-2xl border border-[#E5E0D6] bg-white p-6 shadow-sm"
        data-testid="journey-momentum"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
              <span className="rounded-full bg-[#F3EEE3] px-2.5 py-1">
                Current momentum
              </span>
              <span>{todayQueue.length} block{todayQueue.length === 1 ? "" : "s"} queued</span>
              <span>{formatStudyMinutes(totalQueueMinutes)} planned</span>
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
                {momentum.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C5950]">
                {momentum.detail}
              </p>
            </div>
            {nextBlock && (
              <div className="flex flex-wrap gap-2 text-xs text-[#5C5950]">
                <span className="rounded-full bg-[#F8F6F1] px-3 py-1">
                  Next topic: {nextBlock.topicName}
                </span>
                <span className="rounded-full bg-[#F8F6F1] px-3 py-1">
                  {nextBlock.durationMinutes}m {nextBlock.blockType.replaceAll("_", " ")}
                </span>
                <span className="rounded-full bg-[#F8F6F1] px-3 py-1">
                  {data.active.length} active misconception{data.active.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>

          <a
            href={momentum.ctaHref}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            {momentum.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <JourneyStats stats={data.stats} />

      {data.milestones.length > 0 && (
        <section data-testid="milestones-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Recent milestones
          </h2>
          <p className="-mt-2 mb-4 max-w-2xl text-sm text-[#5C5950]">
            These are misconceptions you have already worked through and stopped
            repeating.
          </p>
          <div className="space-y-3">
            {data.milestones.slice(0, 5).map((m) => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
          </div>
        </section>
      )}

      {!hasMisconceptions && <EmptyJourney todayQueue={todayQueue} />}

      {data.active.length > 0 && (
        <section data-testid="active-section">
          <h2 className="mb-4 font-[family-name:var(--font-serif)] text-xl text-[#1A1917]">
            Active misconceptions
            <span className="ml-2 inline-flex items-center rounded-full bg-[#FAEAE5] px-2 py-0.5 text-xs font-medium text-[#D4654A]">
              {data.active.length}
            </span>
          </h2>
          <p className="-mt-2 mb-4 max-w-2xl text-sm text-[#5C5950]">
            These are the ideas still catching you out often enough to be worth
            another look in your next sessions.
          </p>
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
          <p className="-mt-2 mb-4 max-w-2xl text-sm text-[#5C5950]">
            These are the misunderstandings you have already put right.
          </p>
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
