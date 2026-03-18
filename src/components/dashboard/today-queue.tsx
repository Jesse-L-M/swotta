"use client";

import type { StudyBlock } from "@/lib/types";
import { getBlockTypeLabel } from "./utils";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Brain,
  ClipboardList,
  Clock,
  FileText,
  Lightbulb,
  Pencil,
  RotateCcw,
} from "lucide-react";
import type { BlockType } from "@/lib/types";

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
  blocks: StudyBlock[];
}

export function TodayQueue({ blocks }: TodayQueueProps) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DB] bg-white p-6 text-center">
        <p className="text-[#6B7280]">
          No study blocks scheduled for today. Check back tomorrow or start a
          new session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const Icon = blockTypeIcons[block.blockType];
        return (
          <a
            key={block.id}
            href={`/session/${block.id}`}
            className={cn(
              "flex items-center gap-4 rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm",
              "transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[#1A1A2E]">{block.topicName}</p>
              <p className="text-sm text-[#6B7280]">
                {getBlockTypeLabel(block.blockType)} &middot;{" "}
                {block.durationMinutes}m &middot; {block.reason}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-teal-600">
              Start
            </span>
          </a>
        );
      })}
    </div>
  );
}
