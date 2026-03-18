import type { TechniqueMastery } from "@/engine/technique";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";

// --- Pure functions (exported for testing) ---

export function sortTechniquesByScore(
  techniques: TechniqueMastery[]
): TechniqueMastery[] {
  return [...techniques].sort((a, b) => {
    if (a.avgScore === null && b.avgScore === null) return 0;
    if (a.avgScore === null) return 1;
    if (b.avgScore === null) return -1;
    return a.avgScore - b.avgScore;
  });
}

export function getWeakestTechnique(
  techniques: TechniqueMastery[]
): TechniqueMastery | null {
  const scored = techniques.filter((t) => t.avgScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((weakest, t) =>
    t.avgScore! < weakest.avgScore! ? t : weakest
  );
}

export type ScoreLevel = "strong" | "attention" | "neutral";

export function getScoreLevel(score: number | null): ScoreLevel {
  if (score === null) return "neutral";
  if (score >= 70) return "strong";
  if (score < 40) return "attention";
  return "neutral";
}

export function formatTrendIndicator(
  trend: TechniqueMastery["trend"]
): { label: string; direction: "up" | "down" | "flat" | "none" } {
  switch (trend) {
    case "improving":
      return { label: "Improving", direction: "up" };
    case "declining":
      return { label: "Declining", direction: "down" };
    case "stable":
      return { label: "Stable", direction: "flat" };
    case "insufficient_data":
      return { label: "Not enough data", direction: "none" };
  }
}

export function getDepthLabel(depth: number): string {
  switch (depth) {
    case 1:
      return "Recall";
    case 2:
      return "Application";
    case 3:
      return "Analysis";
    case 4:
      return "Evaluation";
    default:
      return `Level ${depth}`;
  }
}

// --- Component ---

const SCORE_STYLES: Record<
  ScoreLevel,
  { bar: string; text: string; highlight: string }
> = {
  strong: {
    bar: "bg-[#2D7A6E]",
    text: "text-[#2D7A6E]",
    highlight: "",
  },
  attention: {
    bar: "bg-[#D4654A]",
    text: "text-[#D4654A]",
    highlight: "border-[#D4654A]/20 bg-[#FAEAE5]/30",
  },
  neutral: {
    bar: "bg-[#949085]",
    text: "text-[#5C5950]",
    highlight: "",
  },
};

const TREND_ICONS: Record<
  ReturnType<typeof formatTrendIndicator>["direction"],
  React.ElementType
> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
  none: HelpCircle,
};

interface TechniqueCardProps {
  techniques: TechniqueMastery[];
}

export function TechniqueCard({ techniques }: TechniqueCardProps) {
  if (techniques.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-medium text-[#6B7280]">Exam Technique</p>
        <p className="mt-2 text-sm text-[#949085]">
          Start practising to see your mastery of different command words and
          exam techniques.
        </p>
      </div>
    );
  }

  const weakest = getWeakestTechnique(techniques);
  const sorted = sortTechniquesByScore(techniques);

  return (
    <div className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#6B7280]">Exam Technique</p>
        {weakest && weakest.avgScore !== null && weakest.avgScore < 40 && (
          <span className="inline-flex items-center rounded-full bg-[#FAEAE5] px-2 py-0.5 text-xs font-medium text-[#D4654A]">
            Focus: {weakest.commandWord}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {sorted.map((technique) => (
          <TechniqueRow
            key={technique.commandWord}
            technique={technique}
            isWeakest={
              weakest !== null &&
              technique.commandWord === weakest.commandWord
            }
          />
        ))}
      </div>
    </div>
  );
}

function TechniqueRow({
  technique,
  isWeakest,
}: {
  technique: TechniqueMastery;
  isWeakest: boolean;
}) {
  const scoreLevel = getScoreLevel(technique.avgScore);
  const styles = SCORE_STYLES[scoreLevel];
  const trendInfo = formatTrendIndicator(technique.trend);
  const TrendIcon = TREND_ICONS[trendInfo.direction];
  const depthLabel = getDepthLabel(technique.expectedDepth);

  return (
    <div
      className={cn(
        "rounded-lg border border-transparent px-3 py-2 transition-colors",
        isWeakest && scoreLevel === "attention" && styles.highlight
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1917]">
            {technique.commandWord}
          </p>
          <p className="text-xs text-[#949085]">{depthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {technique.avgScore !== null && (
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-sm font-medium",
                styles.text
              )}
            >
              {Math.round(technique.avgScore)}%
            </span>
          )}
          <TrendIcon
            className={cn(
              "h-3.5 w-3.5",
              trendInfo.direction === "up"
                ? "text-[#2D7A6E]"
                : trendInfo.direction === "down"
                  ? "text-[#D4654A]"
                  : "text-[#949085]"
            )}
          />
        </div>
      </div>

      {technique.avgScore !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F0ECE4]">
          <div
            className={cn("h-full rounded-full transition-all", styles.bar)}
            style={{ width: `${Math.min(technique.avgScore, 100)}%` }}
          />
        </div>
      )}

      {technique.questionsAttempted > 0 && (
        <p className="mt-1 text-xs text-[#949085]">
          {technique.questionsAttempted} question
          {technique.questionsAttempted !== 1 ? "s" : ""} attempted
        </p>
      )}
    </div>
  );
}
