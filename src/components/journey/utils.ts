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
  return `You conquered "${description}" in ${topicName}!`;
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
