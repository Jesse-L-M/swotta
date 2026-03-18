import { eq, and, asc } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { confidenceEvents, topics } from "@/db/schema";
import type { LearnerId, TopicId } from "@/lib/types";

const OVERCONFIDENCE_THRESHOLD = 0.1;
const UNDERCONFIDENCE_THRESHOLD = -0.1;
const TREND_CHANGE_THRESHOLD = 0.05;
const MIN_EVENTS_FOR_TREND = 4;

export interface TopicCalibration {
  topicId: TopicId;
  topicName: string;
  calibrationScore: number;
  overconfident: boolean;
  underconfident: boolean;
  dataPoints: number;
  message: string;
}

export interface CalibrationResult {
  overconfident: boolean;
  underconfident: boolean;
  calibrationScore: number;
  trend: "improving" | "stable" | "declining";
  message: string;
  topicCalibrations: TopicCalibration[];
  dataPoints: number;
}

interface ConfidenceEventRow {
  topicId: string;
  topicName: string;
  selfRated: string;
  actual: string;
  delta: string;
  createdAt: Date;
}

export function computeCalibrationScore(deltas: number[]): number {
  if (deltas.length === 0) return 0;
  const sum = deltas.reduce((acc, d) => acc + d, 0);
  return Math.round((sum / deltas.length) * 1000) / 1000;
}

export function classifyCalibration(score: number): {
  overconfident: boolean;
  underconfident: boolean;
} {
  return {
    overconfident: score > OVERCONFIDENCE_THRESHOLD,
    underconfident: score < UNDERCONFIDENCE_THRESHOLD,
  };
}

export function computeTrend(
  events: Array<{ delta: number; createdAt: Date }>
): "improving" | "stable" | "declining" {
  if (events.length < MIN_EVENTS_FOR_TREND) return "stable";

  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const mid = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, mid);
  const recent = sorted.slice(mid);

  const earlierAbsAvg = averageAbsDelta(earlier.map((e) => e.delta));
  const recentAbsAvg = averageAbsDelta(recent.map((e) => e.delta));

  const change = recentAbsAvg - earlierAbsAvg;
  if (change < -TREND_CHANGE_THRESHOLD) return "improving";
  if (change > TREND_CHANGE_THRESHOLD) return "declining";
  return "stable";
}

function averageAbsDelta(deltas: number[]): number {
  if (deltas.length === 0) return 0;
  const sum = deltas.reduce((acc, d) => acc + Math.abs(d), 0);
  return sum / deltas.length;
}

export function generateOverallMessage(
  score: number,
  trend: "improving" | "stable" | "declining",
  dataPoints: number,
  avgSelfRated?: number
): string {
  if (dataPoints === 0) {
    return "Not enough data yet to assess your confidence calibration.";
  }

  const { overconfident, underconfident } = classifyCalibration(score);

  let base: string;
  if (underconfident) {
    const selfRating = Math.round((avgSelfRated ?? 0.5) * 5);
    const clampedRating = Math.max(1, Math.min(5, selfRating));
    base = `You tend to underestimate yourself — you rated yourself around ${clampedRating}/5 but your actual scores are consistently higher. You know more than you think!`;
  } else if (overconfident) {
    base =
      "You tend to overestimate your understanding before sessions. Try reviewing the material more carefully before rating yourself highly.";
  } else {
    base =
      "Your self-assessments are well calibrated — you have a good sense of what you know and don't know.";
  }

  const trendSuffix =
    trend === "improving"
      ? " Your calibration is improving over time."
      : trend === "declining"
        ? " Your calibration accuracy has been declining recently."
        : "";

  return base + trendSuffix;
}

export function generateTopicMessage(
  topicName: string,
  score: number,
  dataPoints: number
): string {
  if (dataPoints < 2) {
    return `Only ${dataPoints} session${dataPoints === 1 ? "" : "s"} on ${topicName} — need more data for calibration.`;
  }

  const { overconfident, underconfident } = classifyCalibration(score);

  if (underconfident) {
    return `Underconfident on ${topicName} — your scores are consistently higher than your self-rating.`;
  }
  if (overconfident) {
    return `Overconfident on ${topicName} — your actual performance is below your self-assessment.`;
  }
  return `Well calibrated on ${topicName} — your self-assessment matches your performance.`;
}

export async function calculateCalibration(
  db: Database,
  learnerId: LearnerId,
  topicId?: TopicId
): Promise<CalibrationResult> {
  const conditions = [eq(confidenceEvents.learnerId, learnerId)];
  if (topicId) {
    conditions.push(eq(confidenceEvents.topicId, topicId));
  }

  const rows: ConfidenceEventRow[] = await db
    .select({
      topicId: confidenceEvents.topicId,
      topicName: topics.name,
      selfRated: confidenceEvents.selfRated,
      actual: confidenceEvents.actual,
      delta: confidenceEvents.delta,
      createdAt: confidenceEvents.createdAt,
    })
    .from(confidenceEvents)
    .innerJoin(topics, eq(confidenceEvents.topicId, topics.id))
    .where(and(...conditions))
    .orderBy(asc(confidenceEvents.createdAt));

  if (rows.length === 0) {
    return {
      overconfident: false,
      underconfident: false,
      calibrationScore: 0,
      trend: "stable",
      message: "Not enough data yet to assess your confidence calibration.",
      topicCalibrations: [],
      dataPoints: 0,
    };
  }

  const allDeltas = rows.map((r) => Number(r.delta));
  const calibrationScore = computeCalibrationScore(allDeltas);
  const { overconfident, underconfident } = classifyCalibration(calibrationScore);

  const trendEvents = rows.map((r) => ({
    delta: Number(r.delta),
    createdAt: r.createdAt,
  }));
  const trend = computeTrend(trendEvents);

  const topicMap = new Map<
    string,
    { topicName: string; deltas: number[]; dataPoints: number }
  >();
  for (const row of rows) {
    const existing = topicMap.get(row.topicId);
    if (existing) {
      existing.deltas.push(Number(row.delta));
      existing.dataPoints++;
    } else {
      topicMap.set(row.topicId, {
        topicName: row.topicName,
        deltas: [Number(row.delta)],
        dataPoints: 1,
      });
    }
  }

  const topicCalibrations: TopicCalibration[] = [];
  for (const [tid, data] of topicMap) {
    const topicScore = computeCalibrationScore(data.deltas);
    const topicClass = classifyCalibration(topicScore);
    topicCalibrations.push({
      topicId: tid as TopicId,
      topicName: data.topicName,
      calibrationScore: topicScore,
      overconfident: topicClass.overconfident,
      underconfident: topicClass.underconfident,
      dataPoints: data.dataPoints,
      message: generateTopicMessage(data.topicName, topicScore, data.dataPoints),
    });
  }

  const avgSelfRated =
    rows.reduce((acc, r) => acc + Number(r.selfRated), 0) / rows.length;
  const message = generateOverallMessage(calibrationScore, trend, rows.length, avgSelfRated);

  return {
    overconfident,
    underconfident,
    calibrationScore,
    trend,
    message,
    topicCalibrations,
    dataPoints: rows.length,
  };
}
