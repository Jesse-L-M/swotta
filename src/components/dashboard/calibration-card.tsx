import type { CalibrationResult, TopicCalibration } from "@/engine/calibration";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

// --- Pure functions (exported for testing) ---

export type CalibrationAccent = "teal" | "coral" | "neutral";

export function getCalibrationAccent(
  result: CalibrationResult
): CalibrationAccent {
  if (result.dataPoints === 0) return "neutral";
  if (result.underconfident) return "teal";
  if (result.overconfident) return "coral";
  return "neutral";
}

export function getTrendLabel(
  trend: CalibrationResult["trend"]
): string {
  switch (trend) {
    case "improving":
      return "Calibration improving";
    case "declining":
      return "Calibration declining";
    case "stable":
      return "Calibration stable";
  }
}

export function findHighlightedTopic(
  topics: TopicCalibration[]
): TopicCalibration | null {
  if (topics.length === 0) return null;

  const withEnoughData = topics.filter((t) => t.dataPoints >= 2);
  if (withEnoughData.length === 0) return null;

  const miscalibrated = withEnoughData.filter(
    (t) => t.overconfident || t.underconfident
  );

  if (miscalibrated.length === 0) return null;

  return miscalibrated.reduce((best, t) =>
    Math.abs(t.calibrationScore) > Math.abs(best.calibrationScore) ? t : best
  );
}

// --- Component ---

const ACCENT_STYLES: Record<
  CalibrationAccent,
  { border: string; bg: string; text: string; badge: string }
> = {
  teal: {
    border: "border-l-[#2D7A6E]",
    bg: "bg-[#E4F0ED]",
    text: "text-[#2D7A6E]",
    badge: "bg-[#E4F0ED] text-[#2D7A6E]",
  },
  coral: {
    border: "border-l-[#D4654A]",
    bg: "bg-[#FAEAE5]",
    text: "text-[#D4654A]",
    badge: "bg-[#FAEAE5] text-[#D4654A]",
  },
  neutral: {
    border: "border-l-[#949085]",
    bg: "bg-[#F0ECE4]",
    text: "text-[#5C5950]",
    badge: "bg-[#F0ECE4] text-[#5C5950]",
  },
};

interface CalibrationCardProps {
  calibration: CalibrationResult;
}

export function CalibrationCard({ calibration }: CalibrationCardProps) {
  const accent = getCalibrationAccent(calibration);
  const styles = ACCENT_STYLES[accent];
  const highlighted = findHighlightedTopic(calibration.topicCalibrations);

  if (calibration.dataPoints === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-medium text-[#6B7280]">
          Confidence Calibration
        </p>
        <p className="mt-2 text-sm text-[#949085]">
          Complete a few study sessions to see how well your self-assessments
          match your actual performance.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[#E8E4DB] border-l-[3px] bg-white px-5 py-4 shadow-sm",
        styles.border
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#6B7280]">
          Confidence Calibration
        </p>
        <TrendBadge trend={calibration.trend} accent={accent} />
      </div>

      <p className="mt-2 font-[family-name:var(--font-serif)] text-lg leading-snug text-[#1A1917]">
        {calibration.message}
      </p>

      {highlighted && (
        <p className="mt-2 text-sm text-[#5C5950]">{highlighted.message}</p>
      )}

      <p className="mt-3 font-[family-name:var(--font-mono)] text-xs text-[#949085]">
        Based on {calibration.dataPoints} session
        {calibration.dataPoints !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function TrendBadge({
  trend,
  accent,
}: {
  trend: CalibrationResult["trend"];
  accent: CalibrationAccent;
}) {
  const styles = ACCENT_STYLES[accent];
  const label = getTrendLabel(trend);
  const Icon =
    trend === "improving"
      ? TrendingUp
      : trend === "declining"
        ? TrendingDown
        : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        styles.badge
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
