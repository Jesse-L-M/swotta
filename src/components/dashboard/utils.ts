import type { BlockType, ReviewReason } from "@/lib/types";
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

export function getQueueActionTitle(
  blockType: BlockType,
  topicName: string
): string {
  const labels: Record<BlockType, string> = {
    retrieval_drill: `Pull ${topicName} out of memory`,
    explanation: `Rebuild the key idea in ${topicName}`,
    worked_example: `See the full method for ${topicName}`,
    timed_problems: `Test ${topicName} under exam time`,
    essay_planning: `Plan a strong ${topicName} answer`,
    source_analysis: `Apply ${topicName} to source material`,
    mistake_review: `Correct the slip in ${topicName}`,
    reentry: `Restart gently with ${topicName}`,
  };

  return labels[blockType];
}

export function getQueueImpact(blockType: BlockType): string {
  const impact: Record<BlockType, string> = {
    retrieval_drill:
      "Pulling answers from memory now makes later questions faster and less fragile.",
    explanation:
      "A clearer explanation now makes the harder practice that follows much easier.",
    worked_example:
      "Seeing each step laid out helps you copy the right method when you try it alone.",
    timed_problems:
      "Practising under time pressure turns knowledge into exam-ready performance.",
    essay_planning:
      "Planning first helps you win marks for structure instead of losing them to hesitation.",
    source_analysis:
      "Using source material now helps you apply the topic the way exam questions expect.",
    mistake_review:
      "Revisiting the slip now lowers the chance of repeating it in the next session or exam.",
    reentry:
      "A gentle restart lowers the friction of getting back into study and rebuilds momentum quickly.",
  };

  return impact[blockType];
}

export function getQueuePositionLabel(index: number): string {
  if (index === 0) return "Start here";
  if (index === 1) return "Then";
  if (index === 2) return "Keep going";
  return "If you still have time";
}

export function buildQueueWhyNow({
  topicName,
  reviewReason,
  masteryLevel,
  confidence,
  reviewCount,
  nextReviewAt,
  examDate,
  activeMisconceptionCount = 0,
  activeMisconceptionDescription,
  now,
}: {
  topicName: string;
  reviewReason: ReviewReason | null;
  masteryLevel: number | null;
  confidence: number | null;
  reviewCount: number;
  nextReviewAt: Date | null;
  examDate: string | null;
  activeMisconceptionCount?: number;
  activeMisconceptionDescription?: string | null;
  now?: Date;
}): string {
  const daysToExam = daysUntil(examDate, now);
  const isDueNow = nextReviewAt ? nextReviewAt.getTime() <= (now ?? new Date()).getTime() : false;

  if (reviewReason === "misconception" || activeMisconceptionCount > 0) {
    if (activeMisconceptionDescription) {
      return `You recently got stuck on "${activeMisconceptionDescription}" here, so this block is about fixing it before the same mistake repeats.`;
    }

    return activeMisconceptionCount > 1
      ? `This topic still has ${activeMisconceptionCount} live misconceptions attached to it, so it is worth tightening now before they pile up.`
      : `This topic still has a live misconception attached to it, so it is worth correcting now before it settles in.`;
  }

  if (reviewReason === "exam_approaching" || (daysToExam !== null && daysToExam <= 21)) {
    return `Your exam on this subject is getting close, so keeping ${topicName} active now should pay off when questions come under pressure.`;
  }

  if (reviewReason === "decay" || isDueNow) {
    return `This topic is due for review now. Revisiting it today is easier than letting it fade and having to rebuild it later.`;
  }

  if (reviewCount === 0 || masteryLevel === null || masteryLevel < 0.25) {
    return `You are still building the first layer of understanding here, so this gives you something solid to build on.`;
  }

  if (confidence !== null && masteryLevel !== null && confidence - masteryLevel >= 0.2) {
    return `This can feel stronger than it really is, so a quick check now keeps confidence and performance aligned.`;
  }

  if (masteryLevel !== null && masteryLevel < 0.6) {
    return `You know parts of this already, but it is not sticking reliably yet. Another pass now should make it steadier.`;
  }

  return `It is the right next step to keep ${topicName} warm while the progress you have made is still easy to build on.`;
}
