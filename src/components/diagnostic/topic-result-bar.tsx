"use client";

import type { DiagnosticResult } from "./types";

interface TopicResultBarProps {
  result: DiagnosticResult;
  animationDelay?: number;
}

export type MasteryCategory = "strong" | "developing" | "needs-work" | "not-covered";

export function categorizeMastery(score: number): MasteryCategory {
  if (score >= 0.7) return "strong";
  if (score >= 0.4) return "developing";
  if (score > 0) return "needs-work";
  return "not-covered";
}

export function getMasteryLabel(category: MasteryCategory): string {
  switch (category) {
    case "strong":
      return "Strong";
    case "developing":
      return "Developing";
    case "needs-work":
      return "Needs work";
    case "not-covered":
      return "Not covered";
  }
}

export function getMasteryColor(category: MasteryCategory): string {
  switch (category) {
    case "strong":
      return "#2D7A6E";
    case "developing":
      return "#949085";
    case "needs-work":
      return "#D4654A";
    case "not-covered":
      return "#F0ECE4";
  }
}

export function getMasteryLabelColor(category: MasteryCategory): string {
  if (category === "not-covered") return "#949085";
  return getMasteryColor(category);
}

export function TopicResultBar({
  result,
  animationDelay = 0,
}: TopicResultBarProps) {
  const percent = Math.round(result.score * 100);
  const category = categorizeMastery(result.score);
  const barColor = getMasteryColor(category);
  const label = getMasteryLabel(category);
  const labelColor = getMasteryLabelColor(category);

  return (
    <div
      className="rounded-[12px] bg-white p-4 shadow-[0_1px_3px_rgba(26,25,23,0.05)]"
      style={{
        animation: `fadeSlideIn 400ms ease-out ${animationDelay}ms both`,
      }}
      data-testid="topic-result-bar"
      data-category={category}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.875rem] font-medium text-[#1A1917]">
          {result.topicName}
        </span>
        <span
          className="text-[0.75rem] font-medium"
          style={{ color: labelColor }}
          data-testid="mastery-label"
        >
          {label}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(percent, 2)}%`,
            backgroundColor: barColor,
            transitionDelay: `${animationDelay + 200}ms`,
          }}
          data-testid="mastery-bar"
        />
      </div>
      <div className="mt-1 text-right font-[family-name:var(--font-mono)] text-[0.75rem] tabular-nums text-[#949085]">
        {percent}%
      </div>
    </div>
  );
}
