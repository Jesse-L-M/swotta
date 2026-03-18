import type { BlockType } from "@/lib/types";
import type { MasteryTopic } from "./types";

export type MasteryState = "strong" | "developing" | "needs-work";

export function getMasteryState(level: number): MasteryState {
  if (level >= 0.7) return "strong";
  if (level >= 0.3) return "developing";
  return "needs-work";
}

export const MASTERY_STATE_LABEL: Record<MasteryState, string> = {
  strong: "Strong",
  developing: "Developing",
  "needs-work": "Needs work",
};

export const MASTERY_STYLES: Record<
  MasteryState,
  { text: string; bg: string; ring: string; fill: string }
> = {
  strong: {
    text: "text-teal-700",
    bg: "bg-teal-50",
    ring: "ring-teal-200",
    fill: "fill-teal-500",
  },
  developing: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    fill: "fill-amber-500",
  },
  "needs-work": {
    text: "text-[#F97066]",
    bg: "bg-red-50",
    ring: "ring-red-200",
    fill: "fill-[#F97066]",
  },
};

export function formatStudyMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function daysUntil(examDate: string | null, now?: Date): number | null {
  if (!examDate) return null;
  const ref = now ?? new Date();
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const target = new Date(examDate + "T00:00:00");
  return Math.ceil(
    (target.getTime() - refDay.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function formatExamCountdown(
  examDate: string | null,
  now?: Date
): string | null {
  const days = daysUntil(examDate, now);
  if (days === null) return null;
  if (days < 0) return "Exam passed";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  if (weeks < 2) return `${days} days`;
  return `${days} days (${weeks} weeks)`;
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

export function getBlockTypeDescription(type: BlockType): string {
  const descriptions: Record<BlockType, string> = {
    retrieval_drill: "Quick-fire recall questions",
    explanation: "Learn or re-learn a concept",
    worked_example: "Walk through solved problems",
    timed_problems: "Exam-condition practice",
    essay_planning: "Structure an extended response",
    source_analysis: "Work with provided materials",
    mistake_review: "Revisit misconceptions",
    reentry: "Gentle warm-up after a gap",
  };
  return descriptions[type];
}

export function getGreeting(name: string, hour?: number): string {
  const h = hour ?? new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export function calculateAverageMastery(levels: number[]): number {
  if (levels.length === 0) return 0;
  const sum = levels.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / levels.length) * 1000) / 1000;
}

export function groupMasteryByState(
  topics: MasteryTopic[]
): Record<MasteryState, number> {
  const result: Record<MasteryState, number> = {
    strong: 0,
    developing: 0,
    "needs-work": 0,
  };
  for (const t of topics) {
    result[getMasteryState(t.masteryLevel)]++;
  }
  return result;
}

export function masteryPercent(level: number): number {
  return Math.round(level * 100);
}

export function nextExam(
  qualifications: Array<{ examDate: string | null }>,
  now?: Date
): { examDate: string; daysLeft: number } | null {
  let closest: { examDate: string; daysLeft: number } | null = null;
  for (const q of qualifications) {
    const days = daysUntil(q.examDate, now);
    if (days === null || days < 0) continue;
    if (closest === null || days < closest.daysLeft) {
      closest = { examDate: q.examDate!, daysLeft: days };
    }
  }
  return closest;
}
