import { and, eq, gte } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { misconceptionEvents, misconceptionRules, topics } from "@/db/schema";
import type { LearnerId, TopicId } from "@/lib/types";

const NORMALIZATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmixes up\b/g, "confuses"],
  [/\bmixed up\b/g, "confuses"],
  [/\bmix up\b/g, "confuses"],
  [/\bmixes\b/g, "confuses"],
  [/\bmistakes\b/g, "confuses"],
  [/\bmistake\b/g, "confuses"],
  [/\bconfused\b/g, "confuses"],
  [/\bconfusing\b/g, "confuses"],
  [/\bversus\b/g, "vs"],
];

const GENERIC_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "being",
  "between",
  "both",
  "by",
  "call",
  "calls",
  "can",
  "cannot",
  "confuse",
  "confuses",
  "consider",
  "considers",
  "could",
  "describe",
  "describes",
  "does",
  "during",
  "each",
  "equates",
  "equate",
  "for",
  "from",
  "gets",
  "has",
  "have",
  "how",
  "if",
  "in",
  "incorrectly",
  "instead",
  "into",
  "is",
  "it",
  "its",
  "mistake",
  "mistakes",
  "mix",
  "not",
  "of",
  "on",
  "or",
  "same",
  "see",
  "sees",
  "than",
  "that",
  "the",
  "their",
  "them",
  "they",
  "thinks",
  "think",
  "this",
  "those",
  "to",
  "treat",
  "treats",
  "understand",
  "understands",
  "up",
  "use",
  "uses",
  "using",
  "vs",
  "when",
  "where",
  "which",
  "with",
]);

const STRATEGY_BASE_SCORE: Record<MisconceptionClusterStrategy, number> = {
  rule_lineage: 140,
  normalized_description: 110,
  shared_concept_pair: 80,
};

export interface MisconceptionClusterSourceEvent {
  eventId: string;
  topicId: TopicId;
  topicName: string;
  description: string;
  severity: number;
  createdAt: Date;
  misconceptionRuleId: string | null;
  ruleDescription: string | null;
  triggerPatterns: string[];
}

export type MisconceptionClusterStrategy =
  | "rule_lineage"
  | "normalized_description"
  | "shared_concept_pair";

export interface MisconceptionClusterTopic {
  topicId: TopicId;
  topicName: string;
  occurrences: number;
  maxSeverity: number;
}

export interface MisconceptionClusterDescription {
  description: string;
  occurrences: number;
  topicNames: string[];
}

export interface MisconceptionClusterSignal {
  totalEvents: number;
  distinctTopics: number;
  maxSeverity: number;
  averageSeverity: number;
  level: "low" | "medium" | "high";
}

export interface MisconceptionRootCauseCluster {
  clusterKey: string;
  strategy: MisconceptionClusterStrategy;
  rootCauseLabel: string;
  explanation: string;
  memberTopics: MisconceptionClusterTopic[];
  supportingDescriptions: MisconceptionClusterDescription[];
  signal: MisconceptionClusterSignal;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface MisconceptionClusterOptions {
  lookbackDays?: number;
  minEvents?: number;
  minTopics?: number;
  now?: Date;
}

interface PreparedClusterEvent extends MisconceptionClusterSourceEvent {
  normalizedDescription: string;
  normalizedRuleDescription: string | null;
  conceptPairKeys: string[];
}

interface CandidateGroup {
  clusterKey: string;
  keyValue: string;
  strategy: MisconceptionClusterStrategy;
  events: PreparedClusterEvent[];
  score: number;
}

export function clusterMisconceptionEvents(
  events: MisconceptionClusterSourceEvent[],
  options: MisconceptionClusterOptions = {},
): MisconceptionRootCauseCluster[] {
  const minEvents = options.minEvents ?? 2;
  const minTopics = options.minTopics ?? 2;

  if (events.length === 0) {
    return [];
  }

  const prepared = events.map(prepareEvent);
  const candidateGroups = [
    ...buildCandidateGroups(prepared, "rule_lineage", minEvents, minTopics),
    ...buildCandidateGroups(prepared, "normalized_description", minEvents, minTopics),
    ...buildCandidateGroups(prepared, "shared_concept_pair", minEvents, minTopics),
  ].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.clusterKey.localeCompare(b.clusterKey);
  });

  const assignedEventIds = new Set<string>();
  const clusters: MisconceptionRootCauseCluster[] = [];

  for (const candidate of candidateGroups) {
    const remainingEvents = candidate.events.filter(
      (event) => !assignedEventIds.has(event.eventId),
    );
    if (!qualifiesAsCluster(remainingEvents, minEvents, minTopics)) {
      continue;
    }

    const cluster = buildCluster(candidate, remainingEvents);
    clusters.push(cluster);
    for (const event of remainingEvents) {
      assignedEventIds.add(event.eventId);
    }
  }

  return clusters.sort((a, b) => {
    if (b.signal.level !== a.signal.level) {
      return signalRank(b.signal.level) - signalRank(a.signal.level);
    }
    if (b.signal.totalEvents !== a.signal.totalEvents) {
      return b.signal.totalEvents - a.signal.totalEvents;
    }
    return a.rootCauseLabel.localeCompare(b.rootCauseLabel);
  });
}

export async function findRecentMisconceptionClusters(
  database: Database,
  learnerId: LearnerId,
  options: MisconceptionClusterOptions = {},
): Promise<MisconceptionRootCauseCluster[]> {
  const lookbackDays = options.lookbackDays ?? 30;
  const now = options.now ?? new Date();
  const lookbackDate = new Date(
    now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
  );

  const rows = await database
    .select({
      eventId: misconceptionEvents.id,
      topicId: misconceptionEvents.topicId,
      topicName: topics.name,
      description: misconceptionEvents.description,
      severity: misconceptionEvents.severity,
      createdAt: misconceptionEvents.createdAt,
      misconceptionRuleId: misconceptionEvents.misconceptionRuleId,
      ruleDescription: misconceptionRules.description,
      triggerPatterns: misconceptionRules.triggerPatterns,
    })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .leftJoin(
      misconceptionRules,
      eq(misconceptionEvents.misconceptionRuleId, misconceptionRules.id),
    )
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        eq(misconceptionEvents.resolved, false),
        gte(misconceptionEvents.createdAt, lookbackDate),
      ),
    );

  return clusterMisconceptionEvents(
    rows.map((row) => ({
      eventId: row.eventId,
      topicId: row.topicId as TopicId,
      topicName: row.topicName,
      description: row.description,
      severity: row.severity,
      createdAt: row.createdAt,
      misconceptionRuleId: row.misconceptionRuleId,
      ruleDescription: row.ruleDescription,
      triggerPatterns: row.triggerPatterns ?? [],
    })),
    options,
  );
}

function prepareEvent(
  event: MisconceptionClusterSourceEvent,
): PreparedClusterEvent {
  const normalizedDescription = normalizeText(event.description);
  const normalizedRuleDescription = event.ruleDescription
    ? normalizeText(event.ruleDescription)
    : null;
  const conceptPairKeys = buildConceptPairKeys([
    event.description,
    event.ruleDescription,
    ...event.triggerPatterns,
  ]);

  return {
    ...event,
    normalizedDescription,
    normalizedRuleDescription,
    conceptPairKeys,
  };
}

function buildCandidateGroups(
  events: PreparedClusterEvent[],
  strategy: MisconceptionClusterStrategy,
  minEvents: number,
  minTopics: number,
): CandidateGroup[] {
  const buckets = new Map<string, PreparedClusterEvent[]>();

  for (const event of events) {
    const keys = getCandidateKeys(event, strategy);
    for (const key of keys) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(event);
      buckets.set(key, bucket);
    }
  }

  const groups: CandidateGroup[] = [];
  for (const [keyValue, bucketEvents] of buckets.entries()) {
    if (!qualifiesAsCluster(bucketEvents, minEvents, minTopics)) {
      continue;
    }

    groups.push({
      clusterKey: `${strategy}:${keyValue}`,
      keyValue,
      strategy,
      events: dedupeEvents(bucketEvents),
      score:
        STRATEGY_BASE_SCORE[strategy] +
        bucketEvents.length * 20 +
        countDistinctTopics(bucketEvents) * 10,
    });
  }

  return groups;
}

function getCandidateKeys(
  event: PreparedClusterEvent,
  strategy: MisconceptionClusterStrategy,
): string[] {
  switch (strategy) {
    case "rule_lineage":
      return event.normalizedRuleDescription
        ? [event.normalizedRuleDescription]
        : [];
    case "normalized_description":
      return event.normalizedDescription ? [event.normalizedDescription] : [];
    case "shared_concept_pair":
      return event.conceptPairKeys;
  }
}

function qualifiesAsCluster(
  events: PreparedClusterEvent[],
  minEvents: number,
  minTopics: number,
): boolean {
  return (
    dedupeEvents(events).length >= minEvents &&
    countDistinctTopics(events) >= minTopics
  );
}

function buildCluster(
  candidate: CandidateGroup,
  events: PreparedClusterEvent[],
): MisconceptionRootCauseCluster {
  const distinctTopics = countDistinctTopics(events);
  const totalEvents = events.length;
  const maxSeverity = Math.max(...events.map((event) => event.severity));
  const totalSeverity = events.reduce(
    (sum, event) => sum + event.severity,
    0,
  );
  const averageSeverity = Math.round((totalSeverity / totalEvents) * 100) / 100;
  const firstSeenAt = new Date(
    Math.min(...events.map((event) => event.createdAt.getTime())),
  );
  const lastSeenAt = new Date(
    Math.max(...events.map((event) => event.createdAt.getTime())),
  );

  return {
    clusterKey: candidate.clusterKey,
    strategy: candidate.strategy,
    rootCauseLabel: buildRootCauseLabel(candidate, events),
    explanation: explainStrategy(candidate.strategy),
    memberTopics: buildMemberTopics(events),
    supportingDescriptions: buildSupportingDescriptions(events),
    signal: {
      totalEvents,
      distinctTopics,
      maxSeverity,
      averageSeverity,
      level: deriveSignalLevel(totalEvents, distinctTopics, maxSeverity),
    },
    firstSeenAt,
    lastSeenAt,
  };
}

function buildMemberTopics(
  events: PreparedClusterEvent[],
): MisconceptionClusterTopic[] {
  const grouped = new Map<
    string,
    { topicId: TopicId; topicName: string; occurrences: number; maxSeverity: number }
  >();

  for (const event of events) {
    const existing = grouped.get(event.topicId);
    if (existing) {
      existing.occurrences += 1;
      existing.maxSeverity = Math.max(existing.maxSeverity, event.severity);
      continue;
    }
    grouped.set(event.topicId, {
      topicId: event.topicId,
      topicName: event.topicName,
      occurrences: 1,
      maxSeverity: event.severity,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.topicName.localeCompare(b.topicName);
  });
}

function buildSupportingDescriptions(
  events: PreparedClusterEvent[],
): MisconceptionClusterDescription[] {
  const grouped = new Map<
    string,
    { description: string; occurrences: number; topicNames: Set<string> }
  >();

  for (const event of events) {
    const existing = grouped.get(event.description);
    if (existing) {
      existing.occurrences += 1;
      existing.topicNames.add(event.topicName);
      continue;
    }
    grouped.set(event.description, {
      description: event.description,
      occurrences: 1,
      topicNames: new Set([event.topicName]),
    });
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      description: entry.description,
      occurrences: entry.occurrences,
      topicNames: Array.from(entry.topicNames).sort(),
    }))
    .sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.description.localeCompare(b.description);
    });
}

function buildRootCauseLabel(
  candidate: CandidateGroup,
  events: PreparedClusterEvent[],
): string {
  if (candidate.strategy === "shared_concept_pair") {
    const [left, right] = candidate.keyValue.split("::");
    if (left && right) {
      return `Confusion around ${formatToken(left)} and ${formatToken(right)}`;
    }
  }

  const labels =
    candidate.strategy === "rule_lineage"
      ? events
          .map((event) => event.ruleDescription)
          .filter((label): label is string => Boolean(label))
      : events.map((event) => event.description);

  return sentenceCase(selectRepresentativeLabel(labels));
}

function selectRepresentativeLabel(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const normalized = label.trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (a[0].length !== b[0].length) return a[0].length - b[0].length;
      return a[0].localeCompare(b[0]);
    })[0]?.[0] ?? "Related misconception pattern";
}

function buildConceptPairKeys(texts: Array<string | null>): string[] {
  const tokens = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    for (const token of normalizeText(text).split(" ")) {
      const normalizedToken = normalizeToken(token);
      if (!normalizedToken || normalizedToken.length < 3) continue;
      if (GENERIC_TOKENS.has(normalizedToken)) continue;
      if (/^\d+$/.test(normalizedToken)) continue;
      tokens.add(normalizedToken);
    }
  }

  const tokenList = Array.from(tokens).sort();
  const keys: string[] = [];
  for (let i = 0; i < tokenList.length; i += 1) {
    for (let j = i + 1; j < tokenList.length; j += 1) {
      keys.push(`${tokenList[i]}::${tokenList[j]}`);
    }
  }
  return keys;
}

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  for (const [pattern, replacement] of NORMALIZATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token: string): string {
  if (
    token.endsWith("s") &&
    token.length > 4 &&
    !token.endsWith("is") &&
    !token.endsWith("ss") &&
    !token.endsWith("us")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

function explainStrategy(strategy: MisconceptionClusterStrategy): string {
  switch (strategy) {
    case "rule_lineage":
      return "Matched via the same misconception rule description across topics.";
    case "normalized_description":
      return "Matched via the same normalized misconception wording across topics.";
    case "shared_concept_pair":
      return "Matched via the same pair of key concepts appearing in misconception descriptions.";
  }
}

function deriveSignalLevel(
  totalEvents: number,
  distinctTopics: number,
  maxSeverity: number,
): "low" | "medium" | "high" {
  if (totalEvents >= 5 || (distinctTopics >= 3 && maxSeverity >= 2)) {
    return "high";
  }
  if (totalEvents >= 3 || maxSeverity >= 3) {
    return "medium";
  }
  return "low";
}

function countDistinctTopics(events: PreparedClusterEvent[]): number {
  return new Set(events.map((event) => event.topicId)).size;
}

function dedupeEvents(events: PreparedClusterEvent[]): PreparedClusterEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
}

function signalRank(level: "low" | "medium" | "high"): number {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function sentenceCase(text: string): string {
  if (text.length === 0) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function formatToken(token: string): string {
  return token.toUpperCase() === token ? token : token;
}
