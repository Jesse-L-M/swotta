import type { DashboardQueueBlock } from "@/components/dashboard/types";
import type { MisconceptionThread, JourneyMilestone } from "./types";

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function buildMilestoneMessage(
  description: string,
  topicName: string
): string {
  return `You turned "${description}" into a strength in ${topicName}.`;
}

export function extractMilestones(
  threads: MisconceptionThread[]
): JourneyMilestone[] {
  return threads
    .filter((t): t is MisconceptionThread & { resolvedAt: Date } =>
      t.resolved && t.resolvedAt !== null
    )
    .map((t) => ({
      id: t.id,
      description: t.description,
      topicName: t.topicName,
      resolvedAt: t.resolvedAt,
      occurrenceCount: t.occurrenceCount,
    }))
    .sort((a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime());
}

export function severityLabel(severity: number): string {
  if (severity >= 3) return "Critical";
  if (severity >= 2) return "Moderate";
  return "Minor";
}

export function conqueredPercent(
  conquered: number,
  total: number
): number {
  if (total === 0) return 0;
  return Math.round((conquered / total) * 100);
}

export function buildMomentumSummary({
  nextBlock,
  queueCount: _queueCount,
  activeMisconceptions,
}: {
  nextBlock: DashboardQueueBlock | null;
  queueCount: number;
  activeMisconceptions: number;
}): {
  title: string;
  detail: string;
  ctaHref: string;
  ctaLabel: string;
} {
  if (nextBlock) {
    return {
      title: "Keep today's momentum going",
      detail: `Next up: ${nextBlock.actionTitle}. ${nextBlock.whyNow}`,
      ctaHref: `/session/${nextBlock.id}`,
      ctaLabel: "Start next block",
    };
  }

  if (activeMisconceptions > 0) {
    return {
      title: "Your queue is clear right now",
      detail: `You still have ${activeMisconceptions} active misconception${activeMisconceptions === 1 ? "" : "s"} being tracked, but nothing new is scheduled yet. Check the dashboard again later for the next block.`,
      ctaHref: "/dashboard",
      ctaLabel: "Back to dashboard",
    };
  }

  return {
    title: "Your queue is clear right now",
    detail:
      "Nothing is scheduled right now. Use this page to see what is getting stronger, then come back when the next study block appears.",
    ctaHref: "/dashboard",
    ctaLabel: "Back to dashboard",
  };
}
