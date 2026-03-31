import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import type { Database } from "@/lib/db";
import {
  studySessions,
  studyBlocks,
  blockAttempts,
  topics,
  misconceptionEvents,
} from "@/db/schema";
import type { LearnerId, SessionId, TopicId, BlockType } from "@/lib/types";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";
import { calculateCalibration } from "@/engine/calibration";
import { structuredLog } from "@/lib/logger";
import {
  getPersistedAttemptMisconceptions,
  getPersistedExamSession,
} from "@/engine/session";

const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Types ---

export interface ReplaySummary {
  sessionId: string;
  learnerId: string;
  startedAt: Date;
  endedAt: Date | null;
  totalDurationMinutes: number | null;
  status: string;
  topicsCovered: Array<{ topicId: string; topicName: string }>;
  blockType: BlockType | null;
  blockTypeLabel: string | null;
  score: number | null;
  whatYouCovered: string[];
  whatYouNailed: string[];
  whatTrippedYouUp: string[];
  whatsNext: string[];
  calibrationFeedback: string | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  misconceptions: Array<{ description: string; severity: number }>;
  helpRequested: boolean;
  summary: string | null;
}

export interface SessionCard {
  sessionId: string;
  topicName: string;
  blockType: BlockType | null;
  blockTypeLabel: string | null;
  score: number | null;
  durationMinutes: number | null;
  status: string;
  startedAt: Date;
  summary: string | null;
}

interface AttemptReplayRow {
  id: string;
  score: string | null;
  confidenceBefore: string | null;
  confidenceAfter: string | null;
  helpRequested: boolean;
  misconceptionsDetected: number;
  rawInteraction: unknown;
  createdAt: Date;
}

async function findAttemptForSession(
  db: Database,
  blockId: string,
  sessionId: string,
  sessionStartedAt: Date
): Promise<AttemptReplayRow | null> {
  const [linkedAttempt] = await db
    .select({
      id: blockAttempts.id,
      score: blockAttempts.score,
      confidenceBefore: blockAttempts.confidenceBefore,
      confidenceAfter: blockAttempts.confidenceAfter,
      helpRequested: blockAttempts.helpRequested,
      misconceptionsDetected: blockAttempts.misconceptionsDetected,
      rawInteraction: blockAttempts.rawInteraction,
      createdAt: blockAttempts.createdAt,
    })
    .from(blockAttempts)
    .where(
      and(
        eq(blockAttempts.blockId, blockId),
        sql`${blockAttempts.rawInteraction} ->> 'sessionId' = ${sessionId}`
      )
    )
    .orderBy(desc(blockAttempts.createdAt))
    .limit(1);

  if (linkedAttempt) {
    return linkedAttempt;
  }

  const attemptRows = await db
    .select({
      id: blockAttempts.id,
      score: blockAttempts.score,
      confidenceBefore: blockAttempts.confidenceBefore,
      confidenceAfter: blockAttempts.confidenceAfter,
      helpRequested: blockAttempts.helpRequested,
      misconceptionsDetected: blockAttempts.misconceptionsDetected,
      rawInteraction: blockAttempts.rawInteraction,
      createdAt: blockAttempts.createdAt,
    })
    .from(blockAttempts)
    .where(eq(blockAttempts.blockId, blockId))
    .orderBy(desc(blockAttempts.createdAt));

  if (attemptRows.length === 0) {
    return null;
  }

  return attemptRows.reduce((closest, candidate) => {
    const closestDistance = Math.abs(
      closest.createdAt.getTime() - sessionStartedAt.getTime()
    );
    const candidateDistance = Math.abs(
      candidate.createdAt.getTime() - sessionStartedAt.getTime()
    );
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

// --- Share token functions ---

export function getShareSecret(): string {
  const secret = process.env.SESSION_SHARE_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SHARE_SECRET environment variable is required in production"
    );
  }
  return secret ?? "dev-share-secret";
}

export function generateShareToken(
  sessionId: string,
  secret?: string
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
  const effectiveSecret = secret ?? getShareSecret();
  const payload = `${sessionId}::${expiresAt.getTime()}`;
  const signature = createHmac("sha256", effectiveSecret)
    .update(payload)
    .digest("hex");
  const token = Buffer.from(`${payload}::${signature}`).toString("base64url");
  return { token, expiresAt };
}

export function verifyShareToken(
  token: string,
  secret?: string
): { sessionId: string; expiresAt: Date } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split("::");
    if (parts.length !== 3) return null;

    const [sessionId, expiresAtStr, signature] = parts;
    if (!sessionId || !expiresAtStr || !signature) return null;

    const effectiveSecret = secret ?? getShareSecret();
    const payload = `${sessionId}::${expiresAtStr}`;
    const expected = createHmac("sha256", effectiveSecret)
      .update(payload)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf-8");
    const expectedBuf = Buffer.from(expected, "utf-8");
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    )
      return null;

    const expiresAt = new Date(Number(expiresAtStr));
    if (isNaN(expiresAt.getTime())) return null;
    if (expiresAt.getTime() < Date.now()) return null;

    return { sessionId, expiresAt };
  } catch (error: unknown) {
    structuredLog("share_token_verify_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// --- Summary builder pure functions ---

export function buildWhatYouCovered(
  coveredTopics: Array<{ topicName: string }>,
  blockTypeLabel: string | null,
  durationMinutes: number | null
): string[] {
  const covered: string[] = [];

  if (coveredTopics.length > 0) {
    const names = coveredTopics.map((t) => t.topicName);
    covered.push(`Topics: ${names.join(", ")}`);
  }

  if (blockTypeLabel) {
    covered.push(`Activity type: ${blockTypeLabel}`);
  }

  if (durationMinutes !== null && durationMinutes > 0) {
    covered.push(
      `Duration: ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`
    );
  }

  return covered;
}

export function buildWhatYouNailed(
  score: number | null,
  helpRequested: boolean,
  misconceptionsDetected: number
): string[] {
  const nailed: string[] = [];

  if (score !== null) {
    if (score >= 90) {
      nailed.push(
        "Excellent performance — you clearly have a strong grasp of this material"
      );
    } else if (score >= 70) {
      nailed.push(
        "Good understanding — you handled most of the material well"
      );
    } else if (score >= 50) {
      nailed.push(
        "Solid effort — you're building a foundation on this topic"
      );
    }
  }

  if (!helpRequested && score !== null && score >= 60) {
    nailed.push("Worked independently without requesting hints");
  }

  if (misconceptionsDetected === 0 && score !== null && score >= 50) {
    nailed.push("No misconceptions detected — clean understanding");
  }

  return nailed;
}

export function buildWhatTrippedYouUp(
  misconceptions: Array<{ description: string; severity: number }>,
  score: number | null,
  helpRequested: boolean
): string[] {
  const tripped: string[] = [];

  for (const m of misconceptions) {
    tripped.push(m.description);
  }

  if (score !== null && score < 50) {
    tripped.push(
      "Score below 50% — this topic needs more focused practice"
    );
  }

  if (helpRequested) {
    tripped.push(
      "Needed help during the session — review the material before your next attempt"
    );
  }

  return tripped;
}

export function buildWhatsNext(
  score: number | null,
  misconceptionCount: number,
  status: string
): string[] {
  const next: string[] = [];

  if (status === "abandoned" || status === "timeout") {
    next.push(
      "This session wasn't completed — try again when you're ready"
    );
    return next;
  }

  if (score !== null && score < 50) {
    next.push("Review the material and attempt this topic again");
  } else if (score !== null && score < 70) {
    next.push(
      "Practice more on this topic to strengthen your understanding"
    );
  } else if (score !== null && score >= 90) {
    next.push("Move on to the next topic in your study plan");
  } else if (score !== null) {
    next.push("Keep practising — you're making good progress");
  }

  if (misconceptionCount > 0) {
    next.push(
      "A misconception review session will be scheduled to address the areas flagged above"
    );
  }

  if (next.length === 0) {
    next.push("Continue with your study plan");
  }

  return next;
}

function buildExamFocusSummary(rawInteraction: unknown): string | null {
  const examSession = getPersistedExamSession(rawInteraction);
  if (!examSession || examSession.source !== "past_paper") {
    return null;
  }

  const commandWords = examSession.commandWords
    .slice(0, 2)
    .map((commandWord) => commandWord.word);
  const markAllocations = examSession.marks.distinct
    .map((mark) => `${mark}-mark`)
    .join(", ");
  if (commandWords.length === 0) {
    return `Exam focus: practised real ${markAllocations} patterns from past papers.`;
  }

  return `Exam focus: ${commandWords.join(", ")} questions with real ${markAllocations} patterns.`;
}

function buildExamTechniqueNextStep(rawInteraction: unknown): string | null {
  const examSession = getPersistedExamSession(rawInteraction);
  if (!examSession || examSession.source !== "past_paper") {
    return null;
  }

  const primarySignal = examSession.examTechniqueSignals[0];
  if (!primarySignal) {
    return null;
  }

  return primarySignal.note ?? primarySignal.label;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// --- Engine functions ---

export async function generateReplaySummary(
  db: Database,
  sessionId: SessionId
): Promise<ReplaySummary | null> {
  const sessionRows = await db
    .select({
      id: studySessions.id,
      learnerId: studySessions.learnerId,
      blockId: studySessions.blockId,
      status: studySessions.status,
      startedAt: studySessions.startedAt,
      endedAt: studySessions.endedAt,
      summary: studySessions.summary,
      topicsCovered: studySessions.topicsCovered,
      totalDurationMinutes: studySessions.totalDurationMinutes,
    })
    .from(studySessions)
    .where(eq(studySessions.id, sessionId));

  if (sessionRows.length === 0) return null;

  const session = sessionRows[0];

  // Resolve topic names
  const topicsCoveredData: Array<{ topicId: string; topicName: string }> = [];
  if (session.topicsCovered && session.topicsCovered.length > 0) {
    const topicRows = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(inArray(topics.id, session.topicsCovered));

    for (const t of topicRows) {
      topicsCoveredData.push({ topicId: t.id, topicName: t.name });
    }
  }

  // Fetch block + attempt data
  let blockType: BlockType | null = null;
  let blockTypeLabel: string | null = null;
  let score: number | null = null;
  let confidenceBefore: number | null = null;
  let confidenceAfter: number | null = null;
  let helpRequested = false;
  let misconceptionsDetected = 0;
  let attemptId: string | null = null;
  let rawInteraction: unknown = null;

  if (session.blockId) {
    const blockRows = await db
      .select({ blockType: studyBlocks.blockType })
      .from(studyBlocks)
      .where(eq(studyBlocks.id, session.blockId));

    if (blockRows.length > 0) {
      blockType = blockRows[0].blockType as BlockType;
      blockTypeLabel = BLOCK_TYPE_LABELS[blockType] ?? blockType;
    }

    const attempt = await findAttemptForSession(
      db,
      session.blockId,
      session.id,
      session.startedAt
    );

    if (attempt) {
      attemptId = attempt.id;
      rawInteraction = attempt.rawInteraction;
      score = attempt.score ? Number(attempt.score) : null;
      confidenceBefore = attempt.confidenceBefore
        ? Number(attempt.confidenceBefore)
        : null;
      confidenceAfter = attempt.confidenceAfter
        ? Number(attempt.confidenceAfter)
        : null;
      helpRequested = attempt.helpRequested;
      misconceptionsDetected = attempt.misconceptionsDetected;
    }
  }

  // Fetch misconceptions linked to this session's attempt
  const misconceptions: Array<{ description: string; severity: number }> = [];
  if (attemptId) {
    const miscRows = await db
      .select({
        description: misconceptionEvents.description,
        severity: misconceptionEvents.severity,
      })
      .from(misconceptionEvents)
      .where(eq(misconceptionEvents.blockAttemptId, attemptId));

    for (const m of miscRows) {
      misconceptions.push({
        description: m.description,
        severity: m.severity,
      });
    }

    if (misconceptions.length === 0 && session.blockId) {
      const linkedAttempt = await findAttemptForSession(
        db,
        session.blockId,
        session.id,
        session.startedAt
      );

      if (linkedAttempt) {
        misconceptions.push(
          ...getPersistedAttemptMisconceptions(linkedAttempt.rawInteraction)
        );
      }
    }
  }

  // Calibration feedback from the confidence calibration engine
  let calibrationFeedback: string | null = null;
  if (session.topicsCovered && session.topicsCovered.length > 0) {
    const topicId = session.topicsCovered[0] as TopicId;
    const calibration = await calculateCalibration(
      db,
      session.learnerId as LearnerId,
      topicId
    );
    if (calibration.dataPoints > 0) {
      calibrationFeedback = calibration.message;
    }
  }

  const whatYouCovered = buildWhatYouCovered(
    topicsCoveredData,
    blockTypeLabel,
    session.totalDurationMinutes
  );
  const whatYouNailed = buildWhatYouNailed(
    score,
    helpRequested,
    misconceptionsDetected
  );
  const whatTrippedYouUp = buildWhatTrippedYouUp(
    misconceptions,
    score,
    helpRequested
  );
  const whatsNext = buildWhatsNext(
    score,
    misconceptions.length,
    session.status
  );
  const examFocus = buildExamFocusSummary(rawInteraction);
  if (examFocus) {
    whatYouCovered.push(examFocus);
  }
  const examTechniqueNext = buildExamTechniqueNextStep(rawInteraction);
  if (examTechniqueNext) {
    whatsNext.push(`Exam technique focus: ${examTechniqueNext}`);
  }

  return {
    sessionId: session.id,
    learnerId: session.learnerId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    totalDurationMinutes: session.totalDurationMinutes,
    status: session.status,
    topicsCovered: topicsCoveredData,
    blockType,
    blockTypeLabel,
    score,
    whatYouCovered,
    whatYouNailed,
    whatTrippedYouUp,
    whatsNext,
    calibrationFeedback,
    confidenceBefore,
    confidenceAfter,
    misconceptions,
    helpRequested,
    summary: session.summary,
  };
}

// N+1: runs 1-3 queries per session (topic, block type, score).
// Acceptable at limit=10 (~30 fast PK lookups). Refactor to JOINs if limit grows.
export async function getRecentSessionCards(
  db: Database,
  learnerId: LearnerId,
  limit = 10
): Promise<SessionCard[]> {
  const sessionRows = await db
    .select({
      id: studySessions.id,
      blockId: studySessions.blockId,
      status: studySessions.status,
      startedAt: studySessions.startedAt,
      summary: studySessions.summary,
      topicsCovered: studySessions.topicsCovered,
      totalDurationMinutes: studySessions.totalDurationMinutes,
    })
    .from(studySessions)
    .where(eq(studySessions.learnerId, learnerId))
    .orderBy(desc(studySessions.startedAt))
    .limit(limit);

  const cards: SessionCard[] = [];

  for (const session of sessionRows) {
    let topicName = "Unknown Topic";
    let blockType: BlockType | null = null;
    let blockTypeLabel: string | null = null;
    let sessionScore: number | null = null;

    if (session.topicsCovered && session.topicsCovered.length > 0) {
      const topicRows = await db
        .select({ name: topics.name })
        .from(topics)
        .where(eq(topics.id, session.topicsCovered[0]));

      if (topicRows.length > 0) {
        topicName = topicRows[0].name;
      }
    }

    if (session.blockId) {
      const blockRows = await db
        .select({ blockType: studyBlocks.blockType })
        .from(studyBlocks)
        .where(eq(studyBlocks.id, session.blockId));

      if (blockRows.length > 0) {
        blockType = blockRows[0].blockType as BlockType;
        blockTypeLabel = BLOCK_TYPE_LABELS[blockType] ?? blockType;
      }

      const linkedAttempt = await findAttemptForSession(
        db,
        session.blockId,
        session.id,
        session.startedAt
      );

      if (linkedAttempt?.score) {
        sessionScore = Number(linkedAttempt.score);
      }
    }

    cards.push({
      sessionId: session.id,
      topicName,
      blockType,
      blockTypeLabel,
      score: sessionScore,
      durationMinutes: session.totalDurationMinutes,
      status: session.status,
      startedAt: session.startedAt,
      summary: session.summary,
    });
  }

  return cards;
}

export async function getSharedReplay(
  db: Database,
  token: string,
  secret?: string
): Promise<ReplaySummary | null> {
  const verified = verifyShareToken(token, secret);
  if (!verified) return null;

  return generateReplaySummary(db, verified.sessionId as SessionId);
}
