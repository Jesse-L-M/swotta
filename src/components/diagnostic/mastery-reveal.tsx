"use client";

import type { DiagnosticResult } from "./types";
import {
  TopicResultBar,
  categorizeMastery,
  type MasteryCategory,
} from "./topic-result-bar";

interface MasteryRevealProps {
  results: DiagnosticResult[];
  qualificationName: string;
  onContinue: () => void;
}

interface CategoryGroup {
  category: MasteryCategory;
  label: string;
  description: string;
  results: DiagnosticResult[];
}

function groupByCategory(results: DiagnosticResult[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [
    {
      category: "strong",
      label: "Strong foundations",
      description: "You already know this well. We'll keep it sharp with spaced review.",
      results: [],
    },
    {
      category: "developing",
      label: "Building understanding",
      description: "Good start. We'll deepen your knowledge here.",
      results: [],
    },
    {
      category: "needs-work",
      label: "Focus areas",
      description: "These will get extra attention in your study plan.",
      results: [],
    },
    {
      category: "not-covered",
      label: "New territory",
      description: "We'll start from the basics on these topics.",
      results: [],
    },
  ];

  for (const result of results) {
    const category = categorizeMastery(result.score);
    const group = groups.find((g) => g.category === category);
    if (group) {
      group.results.push(result);
    }
  }

  return groups.filter((g) => g.results.length > 0);
}

function getCategoryAccent(category: MasteryCategory): {
  border: string;
  bg: string;
  text: string;
} {
  switch (category) {
    case "strong":
      return { border: "#2D7A6E", bg: "#E4F0ED", text: "#2D7A6E" };
    case "developing":
      return { border: "#949085", bg: "#F0ECE4", text: "#5C5950" };
    case "needs-work":
      return { border: "#D4654A", bg: "#FAEAE5", text: "#D4654A" };
    case "not-covered":
      return { border: "#949085", bg: "#F0ECE4", text: "#949085" };
  }
}

export function MasteryReveal({
  results,
  qualificationName,
  onContinue,
}: MasteryRevealProps) {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const groups = groupByCategory(sorted);

  const strongCount = results.filter((r) => r.score >= 0.7).length;
  const totalCount = results.length;
  const avgScore =
    totalCount > 0
      ? Math.round(
          (results.reduce((sum, r) => sum + r.score, 0) / totalCount) * 100
        )
      : 0;

  return (
    <div data-testid="mastery-reveal">
      {/* Header panel - teal surface gesture */}
      <div className="bg-[#D6EBE7] px-4 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1
            className="font-[family-name:var(--font-serif)] text-[2.5rem] leading-[1.2] tracking-[-0.01em] text-[#1A1917]"
            data-testid="reveal-title"
          >
            Your knowledge map
          </h1>
          <p className="mt-3 text-[1.125rem] leading-[1.7] text-[#5C5950]">
            Here&apos;s where you stand in {qualificationName}
          </p>

          {/* Summary stats */}
          <div
            className="mt-8 flex items-center justify-center gap-8"
            data-testid="summary-stats"
          >
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[1.75rem] font-medium tabular-nums text-[#2D7A6E]">
                {avgScore}%
              </div>
              <div className="mt-1 text-[0.75rem] text-[#5C5950]">
                Average mastery
              </div>
            </div>
            <div className="h-8 w-px bg-[#2D7A6E]/20" />
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[1.75rem] font-medium tabular-nums text-[#2D7A6E]">
                {strongCount}/{totalCount}
              </div>
              <div className="mt-1 text-[0.75rem] text-[#5C5950]">
                Topics strong
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Topic groups */}
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-8" data-testid="topic-groups">
          {groups.map((group) => {
            const accent = getCategoryAccent(group.category);
            return (
              <div key={group.category} data-testid={`group-${group.category}`}>
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: accent.border }}
                  />
                  <div>
                    <h3
                      className="text-[0.875rem] font-semibold text-[#1A1917]"
                      style={{ color: accent.text }}
                    >
                      {group.label}
                    </h3>
                    <p className="text-[0.75rem] text-[#949085]">
                      {group.description}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.results.map((result, i) => (
                    <TopicResultBar
                      key={result.topicId}
                      result={result}
                      animationDelay={i * 80}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Plan transition */}
        <div
          className="mt-12 rounded-[12px] border border-[#E5E0D6] bg-white p-8 text-center shadow-[0_2px_8px_rgba(26,25,23,0.08)]"
          data-testid="plan-transition"
        >
          <h2 className="font-[family-name:var(--font-serif)] text-[1.75rem] leading-[1.3] text-[#1A1917]">
            Here&apos;s your personalised plan
          </h2>
          <p className="mt-3 text-[1rem] leading-[1.6] text-[#5C5950]">
            Swotta has built a study plan tailored to your strengths and gaps.
            Your focus areas get extra attention, and your strong topics stay
            sharp with spaced review.
          </p>
          <button
            onClick={onContinue}
            className="mt-6 rounded-[8px] bg-[#2D7A6E] px-8 py-3 text-base font-medium text-white transition-colors duration-150 hover:bg-[#256b60]"
            data-testid="continue-btn"
          >
            Go to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
