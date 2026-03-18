import type { ExamPhaseName } from "@/engine/proximity";
import type { StudyBlock, BlockType } from "@/lib/types";
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
  Play,
  Flame,
} from "lucide-react";

// --- Pure functions (exported for testing) ---

export const PHASE_ORDER: ExamPhaseName[] = [
  "exploration",
  "consolidation",
  "revision",
  "confidence",
];

export function getPhaseLabel(phase: ExamPhaseName): string {
  switch (phase) {
    case "exploration":
      return "Exploration";
    case "consolidation":
      return "Consolidation";
    case "revision":
      return "Revision";
    case "confidence":
      return "Confidence";
  }
}

export function getPhaseDescription(phase: ExamPhaseName): string {
  switch (phase) {
    case "exploration":
      return "Building strong foundations. New topics, deep understanding.";
    case "consolidation":
      return "Strengthening weak areas. Filling gaps, increasing drills.";
    case "revision":
      return "Retrieval and testing. Every session counts.";
    case "confidence":
      return "Trust what you know. Light revision, positive focus.";
  }
}

export function getPhaseIndex(phase: ExamPhaseName): number {
  return PHASE_ORDER.indexOf(phase);
}

export function formatStreakText(
  streak: number,
  daysToExam: number | null
): string {
  const parts: string[] = [];

  if (streak > 0) {
    parts.push(
      `${streak} day${streak !== 1 ? "s" : ""} in a row`
    );
  }

  if (daysToExam !== null && daysToExam >= 0) {
    parts.push(
      `${daysToExam} day${daysToExam !== 1 ? "s" : ""} to exam`
    );
  }

  return parts.join(". ") + (parts.length > 0 ? "." : "");
}

export function getBlockTypeIcon(type: BlockType): React.ElementType {
  const icons: Record<BlockType, React.ElementType> = {
    retrieval_drill: Brain,
    explanation: Lightbulb,
    worked_example: ClipboardList,
    timed_problems: Clock,
    essay_planning: Pencil,
    source_analysis: FileText,
    mistake_review: RotateCcw,
    reentry: BookOpen,
  };
  return icons[type];
}

export function getBlockTypeLabel(type: BlockType): string {
  const labels: Record<BlockType, string> = {
    retrieval_drill: "Retrieval Drill",
    explanation: "Explanation",
    worked_example: "Worked Example",
    timed_problems: "Timed Problems",
    essay_planning: "Essay Planning",
    source_analysis: "Source Analysis",
    mistake_review: "Mistake Review",
    reentry: "Re-entry",
  };
  return labels[type];
}

// --- Components ---

// 1. PhaseIndicator

interface PhaseIndicatorProps {
  phase: ExamPhaseName;
  weeksToExam: number;
  daysToExam: number;
}

export function PhaseIndicator({
  phase,
  weeksToExam,
  daysToExam,
}: PhaseIndicatorProps) {
  const currentIndex = getPhaseIndex(phase);

  return (
    <div className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#6B7280]">Exam Phase</p>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[#949085]">
          {weeksToExam}w {daysToExam % 7}d
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1">
        {PHASE_ORDER.map((p, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex;

          return (
            <div key={p} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn("h-1.5 w-full rounded-full transition-colors", {
                  "bg-[#2D7A6E]": isActive,
                  "bg-[#D6EBE7]": isPast,
                  "bg-[#F0ECE4]": !isActive && !isPast,
                })}
              />
              <span
                className={cn("text-[10px] leading-tight", {
                  "font-medium text-[#2D7A6E]": isActive,
                  "text-[#5C5950]": isPast,
                  "text-[#949085]": !isActive && !isPast,
                })}
              >
                {getPhaseLabel(p)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-[#5C5950]">
        {getPhaseDescription(phase)}
      </p>
    </div>
  );
}

// 2. StudyNowCard

interface StudyNowCardProps {
  block: StudyBlock | null;
}

export function StudyNowCard({ block }: StudyNowCardProps) {
  if (!block) {
    return (
      <div className="rounded-xl border border-[#E8E4DB] bg-[#F0ECE4] px-6 py-5 text-center">
        <p className="text-sm text-[#5C5950]">
          No sessions recommended right now. Check back later.
        </p>
      </div>
    );
  }

  const Icon = getBlockTypeIcon(block.blockType);

  return (
    <a
      href={`/session/${block.id}`}
      className={cn(
        "group block rounded-xl border-2 border-[#2D7A6E] bg-[#E4F0ED] px-6 py-5",
        "transition-all hover:border-[#2D7A6E] hover:bg-[#D6EBE7] hover:shadow-md"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[#2D7A6E]">
        What should I study?
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 text-[#2D7A6E]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-serif)] text-lg text-[#1A1917]">
            {block.topicName}
          </p>
          <p className="text-sm text-[#5C5950]">
            {getBlockTypeLabel(block.blockType)} &middot;{" "}
            {block.durationMinutes}m
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#2D7A6E] px-4 py-2.5 text-sm font-medium text-white transition-colors group-hover:bg-[#256B60]">
        <Play className="h-4 w-4" />
        Start studying
      </div>
    </a>
  );
}

// 3. StreakCounter

interface StreakCounterProps {
  streak: number;
  daysToExam: number | null;
}

export function StreakCounter({ streak, daysToExam }: StreakCounterProps) {
  const text = formatStreakText(streak, daysToExam);

  if (!text) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#E8E4DB] bg-white px-5 py-3 shadow-sm">
      {streak > 0 && <Flame className="h-4 w-4 text-[#D4654A]" />}
      <p className="font-[family-name:var(--font-mono)] text-sm text-[#1A1917]">
        {text}
      </p>
    </div>
  );
}
