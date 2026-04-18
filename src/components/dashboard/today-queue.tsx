"use client";

import type { BlockType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardList,
  Clock,
  FileText,
  Lightbulb,
  Pencil,
  RotateCcw,
} from "lucide-react";
import type { DashboardQueueBlock } from "./types";
import {
  formatStudyMinutes,
  getBlockTypeLabel,
  getQueuePositionLabel,
} from "./utils";

const blockTypeIcons: Record<BlockType, React.ElementType> = {
  retrieval_drill: Brain,
  explanation: Lightbulb,
  worked_example: ClipboardList,
  timed_problems: Clock,
  essay_planning: Pencil,
  source_analysis: FileText,
  mistake_review: RotateCcw,
  reentry: BookOpen,
};

interface TodayQueueProps {
  blocks: DashboardQueueBlock[];
}

export function TodayQueue({ blocks }: TodayQueueProps) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E8E4DB] bg-white p-6 shadow-sm">
        <p className="font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          Your queue is clear for now
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[#6B7280]">
          That usually means you have finished today&apos;s scheduled review or
          there is no fresh block to queue yet. Use the journey page to see what
          you have already strengthened, then come back later for the next
          study step.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/journey"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            See your journey
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-[#D8D2C5] px-4 py-2 text-sm font-medium text-[#1A1A2E] transition-colors hover:border-teal-300 hover:text-teal-700"
          >
            Refresh later
          </a>
        </div>
      </div>
    );
  }

  const [nextBlock, ...remainingBlocks] = blocks;
  const totalMinutes = blocks.reduce(
    (sum, block) => sum + block.durationMinutes,
    0
  );
  const misconceptionBlocks = blocks.filter(
    (block) => block.reviewReason === "misconception"
  ).length;
  const examBlocks = blocks.filter(
    (block) => block.reviewReason === "exam_approaching"
  ).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.95),rgba(255,255,255,0.98))] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-teal-700">
              <span className="rounded-full bg-teal-100 px-2.5 py-1">
                Start here
              </span>
              <span>{blocks.length} blocks today</span>
              <span>{formatStudyMinutes(totalMinutes)} total</span>
            </div>

            <div>
              <p className="text-sm font-medium text-[#5C5950]">
                {nextBlock.topicName} · {getBlockTypeLabel(nextBlock.blockType)}{" "}
                · {nextBlock.durationMinutes}m
              </p>
              <h3 className="mt-1 font-[family-name:var(--font-serif)] text-2xl text-[#1A1A2E]">
                {nextBlock.actionTitle}
              </h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-white/80 p-4 ring-1 ring-[#D8D2C5]">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
                  Why now
                </p>
                <p className="mt-2 text-sm leading-6 text-[#3F3A32]">
                  {nextBlock.whyNow}
                </p>
              </div>
              <div className="rounded-xl bg-white/80 p-4 ring-1 ring-[#D8D2C5]">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
                  Why it matters
                </p>
                <p className="mt-2 text-sm leading-6 text-[#3F3A32]">
                  {nextBlock.impact}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-[#5C5950]">
              {misconceptionBlocks > 0 && (
                <span className="rounded-full bg-[#FAEAE5] px-3 py-1 text-[#D4654A]">
                  {misconceptionBlocks} misconception fix
                  {misconceptionBlocks === 1 ? "" : "es"}
                </span>
              )}
              {examBlocks > 0 && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                  {examBlocks} exam-priority block
                  {examBlocks === 1 ? "" : "s"}
                </span>
              )}
              <span className="rounded-full bg-white px-3 py-1 text-[#6B7280] ring-1 ring-[#D8D2C5]">
                Finish this first, then work down the rest of the queue
              </span>
            </div>
          </div>

          <a
            href={`/session/${nextBlock.id}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 lg:min-w-[160px]"
          >
            Start next block
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {remainingBlocks.length > 0 && (
        <div className="space-y-3">
          {remainingBlocks.map((block, index) => {
            const Icon = blockTypeIcons[block.blockType];
            return (
              <a
                key={block.id}
                href={`/session/${block.id}`}
                className={cn(
                  "block rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm",
                  "transition-colors hover:border-teal-300 hover:bg-teal-50/20"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
                      <span>{getQueuePositionLabel(index + 1)}</span>
                      <span>{getBlockTypeLabel(block.blockType)}</span>
                      <span>{block.durationMinutes}m</span>
                    </div>
                    <p className="mt-1 font-medium text-[#1A1A2E]">
                      {block.actionTitle}
                    </p>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      {block.topicName}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-teal-600">
                    Start
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-[#F8F6F1] p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
                      Why now
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#3F3A32]">
                      {block.whyNow}
                    </p>
                  </div>
                  <div className="rounded-lg bg-teal-50/60 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7A766B]">
                      Why it matters
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#3F3A32]">
                      {block.impact}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
