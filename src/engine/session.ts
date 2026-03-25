import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "@/lib/db";
import { studySessions, blockAttempts, studyBlocks, topics } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  buildSystemPrompt,
  parseSessionStatus,
  buildOutcomeExtractionPrompt,
  type LearnerContext,
} from "@/ai/study-modes";
import { processAttemptOutcome } from "@/engine/mastery";
import type {
  StudyBlock,
  SessionId,
  AttemptOutcome,
  RetrievalResult,
  LearnerId,
  TopicId,
  ScopeType,
  BlockId,
  BlockType,
} from "@/lib/types";

export type RetrieveChunksFn = (
  learnerId: LearnerId,
  query: string,
  options?: {
    topicIds?: TopicId[];
    limit?: number;
    minConfidence?: number;
    scopes?: ScopeType[];
  }
) => Promise<RetrievalResult[]>;

export interface SessionRunnerDeps {
  db: Database;
  anthropic: Anthropic;
  retrieveChunks: RetrieveChunksFn;
}

let _deps: SessionRunnerDeps | null = null;

export function configureSessionRunner(deps: SessionRunnerDeps): void {
  _deps = deps;
}

export function resetSessionRunner(): void {
  _deps = null;
}

function getDeps(): SessionRunnerDeps {
  if (!_deps) {
    throw new Error(
      "Session runner not configured. Call configureSessionRunner() first."
    );
  }
  return _deps;
}

export interface StartSessionResult {
  sessionId: SessionId;
  systemPrompt: string;
  initialMessage: string;
  sourceChunks: RetrievalResult[];
}

export interface ContinueSessionResult {
  reply: string;
  isComplete: boolean;
  partialOutcome?: Partial<AttemptOutcome>;
}

export interface EndSessionResult {
  outcome: AttemptOutcome;
  summary: string;
}

export type SessionMessage = { role: "user" | "assistant"; content: string };

export class SessionConflictError extends Error {
  code:
    | "SESSION_NOT_ACTIVE"
    | "SESSION_TRANSCRIPT_MISSING"
    | "SESSION_TRANSCRIPT_MISMATCH";

  constructor(
    code:
      | "SESSION_NOT_ACTIVE"
      | "SESSION_TRANSCRIPT_MISSING"
      | "SESSION_TRANSCRIPT_MISMATCH",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

interface StoredAttemptOutcome {
  score: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  helpRequested: boolean;
  helpTiming: "before_attempt" | "after_attempt" | null;
  retentionOutcome: "remembered" | "partial" | "forgotten" | null;
  misconceptions: Array<{
    description: string;
    severity: 1 | 2 | 3;
  }>;
  summary: string;
}

interface StoredSessionTranscript {
  attemptId: string;
  systemPrompt: string;
  messages: SessionMessage[];
}

function buildAttemptRawInteraction(
  sessionId: SessionId,
  options: {
    messages?: SessionMessage[];
    systemPrompt?: string;
    extractedOutcome?: StoredAttemptOutcome;
  } = {}
): Record<string, unknown> {
  const rawInteraction: Record<string, unknown> = {
    sessionId,
    messages: options.messages ?? [],
  };

  if (options.systemPrompt) {
    rawInteraction.systemPrompt = options.systemPrompt;
  }

  if (options.extractedOutcome) {
    rawInteraction.extractedOutcome = options.extractedOutcome;
  }

  return rawInteraction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAttemptSessionId(rawInteraction: unknown): string | null {
  if (!isRecord(rawInteraction)) {
    return null;
  }

  return typeof rawInteraction.sessionId === "string"
    ? rawInteraction.sessionId
    : null;
}

export function getPersistedAttemptMisconceptions(
  rawInteraction: unknown
): Array<{ description: string; severity: number }> {
  if (!isRecord(rawInteraction) || !isRecord(rawInteraction.extractedOutcome)) {
    return [];
  }

  const { misconceptions } = rawInteraction.extractedOutcome;
  if (!Array.isArray(misconceptions)) {
    return [];
  }

  return misconceptions.flatMap((item) => {
    if (!isRecord(item) || typeof item.description !== "string") {
      return [];
    }

    const severity = Number(item.severity);
    return [
      {
        description: item.description,
        severity: Number.isFinite(severity) ? severity : 2,
      },
    ];
  });
}

export function getStoredAttemptMessages(
  rawInteraction: unknown
): SessionMessage[] {
  if (!isRecord(rawInteraction) || !Array.isArray(rawInteraction.messages)) {
    return [];
  }

  return rawInteraction.messages.flatMap((message) => {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return [];
    }

    return [
      {
        role: message.role,
        content: message.content,
      },
    ];
  });
}

export function getStoredAttemptSystemPrompt(
  rawInteraction: unknown
): string | null {
  if (!isRecord(rawInteraction) || typeof rawInteraction.systemPrompt !== "string") {
    return null;
  }

  return rawInteraction.systemPrompt;
}

function areSessionMessagesEqual(
  left: SessionMessage[],
  right: SessionMessage[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (message, index) =>
        message.role === right[index]?.role &&
        message.content === right[index]?.content
    )
  );
}

export async function getStoredSessionTranscript(
  dbLike: { select: Database["select"] },
  sessionId: SessionId
): Promise<StoredSessionTranscript | null> {
  const [attempt] = await dbLike
    .select({
      id: blockAttempts.id,
      rawInteraction: blockAttempts.rawInteraction,
    })
    .from(blockAttempts)
    .where(sql`${blockAttempts.rawInteraction} ->> 'sessionId' = ${sessionId}`)
    .orderBy(desc(blockAttempts.createdAt))
    .limit(1);

  if (!attempt) {
    return null;
  }

  const systemPrompt = getStoredAttemptSystemPrompt(attempt.rawInteraction);
  const messages = getStoredAttemptMessages(attempt.rawInteraction);
  if (!systemPrompt || messages.length === 0) {
    return null;
  }

  return {
    attemptId: attempt.id,
    systemPrompt,
    messages,
  };
}

async function findAttemptIdForSession(
  dbLike: { select: Database["select"] },
  blockId: BlockId,
  sessionId: SessionId
): Promise<string | null> {
  const [linkedAttempt] = await dbLike
    .select({ id: blockAttempts.id })
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
    return linkedAttempt.id;
  }

  const [incompleteAttempt] = await dbLike
    .select({ id: blockAttempts.id })
    .from(blockAttempts)
    .where(
      and(
        eq(blockAttempts.blockId, blockId),
        sql`${blockAttempts.completedAt} IS NULL`
      )
    )
    .orderBy(desc(blockAttempts.createdAt))
    .limit(1);

  if (incompleteAttempt) {
    return incompleteAttempt.id;
  }

  const [latestAttempt] = await dbLike
    .select({ id: blockAttempts.id })
    .from(blockAttempts)
    .where(eq(blockAttempts.blockId, blockId))
    .orderBy(desc(blockAttempts.createdAt))
    .limit(1);

  return latestAttempt?.id ?? null;
}

export async function startSession(
  block: StudyBlock,
  learnerContext: LearnerContext
): Promise<StartSessionResult> {
  const { db, anthropic, retrieveChunks } = getDeps();

  const sourceChunks = await retrieveChunks(block.learnerId, block.topicName, {
    topicIds: [block.topicId],
    limit: 5,
  });

  const systemPrompt = await buildSystemPrompt(
    block,
    learnerContext,
    sourceChunks
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: "I'm ready to start this study session. Let's begin.",
      },
    ],
  });

  const initialMessage =
    response.content[0].type === "text" ? response.content[0].text : "";

  const session = await db.transaction(async (tx) => {
    const [sess] = await tx
      .insert(studySessions)
      .values({
        learnerId: block.learnerId,
        blockId: block.id,
        status: "active",
        topicsCovered: [block.topicId],
      })
      .returning();

    await tx
      .insert(blockAttempts)
      .values({
        blockId: block.id,
        rawInteraction: buildAttemptRawInteraction(sess.id as SessionId, {
          systemPrompt,
          messages: [
            {
              role: "assistant",
              content: initialMessage,
            },
          ],
        }),
      });

    await tx
      .update(studyBlocks)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(studyBlocks.id, block.id));

    return sess;
  });

  return {
    sessionId: session.id as SessionId,
    systemPrompt,
    initialMessage,
    sourceChunks,
  };
}

export async function continueSession(
  sessionId: SessionId,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  _systemPrompt: string
): Promise<ContinueSessionResult> {
  const { db, anthropic } = getDeps();
  const [session] = await db
    .select({ status: studySessions.status })
    .from(studySessions)
    .where(eq(studySessions.id, sessionId))
    .limit(1);

  if (!session || session.status !== "active") {
    throw new SessionConflictError(
      "SESSION_NOT_ACTIVE",
      "Study session is not active"
    );
  }

  const transcript = await getStoredSessionTranscript(db, sessionId);
  if (!transcript) {
    throw new SessionConflictError(
      "SESSION_TRANSCRIPT_MISSING",
      "Stored session transcript is unavailable"
    );
  }

  if (messages.length !== transcript.messages.length + 1) {
    throw new SessionConflictError(
      "SESSION_TRANSCRIPT_MISMATCH",
      "Submitted messages do not match the stored session transcript"
    );
  }

  const nextUserMessage = messages[messages.length - 1];
  const submittedHistory = messages.slice(0, -1);
  if (
    !nextUserMessage ||
    nextUserMessage.role !== "user" ||
    !areSessionMessagesEqual(submittedHistory, transcript.messages)
  ) {
    throw new SessionConflictError(
      "SESSION_TRANSCRIPT_MISMATCH",
      "Submitted messages do not match the stored session transcript"
    );
  }

  const fullMessages = [...transcript.messages, nextUserMessage];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: transcript.systemPrompt,
    messages: fullMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const rawReply =
    response.content[0].type === "text" ? response.content[0].text : "";

  const { isComplete, cleanReply } = parseSessionStatus(rawReply);

  const [activeSession] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.id, sessionId),
        eq(studySessions.status, "active")
      )
    )
    .limit(1);

  if (!activeSession) {
    throw new SessionConflictError(
      "SESSION_NOT_ACTIVE",
      "Study session is not active"
    );
  }

  await db
    .update(blockAttempts)
    .set({
      rawInteraction: buildAttemptRawInteraction(sessionId, {
        systemPrompt: transcript.systemPrompt,
        messages: [
          ...fullMessages,
          {
            role: "assistant",
            content: cleanReply,
          },
        ],
      }),
    })
    .where(eq(blockAttempts.id, transcript.attemptId));

  return {
    reply: cleanReply,
    isComplete,
  };
}

interface OutcomeExtractionResult {
  score: number | null;
  misconceptions: Array<{
    description: string;
    severity: 1 | 2 | 3;
  }>;
  helpRequested: boolean;
  helpTiming: "before_attempt" | "after_attempt" | null;
  retentionOutcome: "remembered" | "partial" | "forgotten" | null;
  summary: string;
}

function parseOutcomeJson(text: string): OutcomeExtractionResult {
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return {
    score: typeof parsed.score === "number" ? parsed.score : null,
    misconceptions: Array.isArray(parsed.misconceptions)
      ? parsed.misconceptions.map(
          (m: Record<string, unknown>) => ({
            description: String(m.description ?? ""),
            severity: ([1, 2, 3].includes(Number(m.severity))
              ? Number(m.severity)
              : 2) as 1 | 2 | 3,
          })
        )
      : [],
    helpRequested: Boolean(parsed.helpRequested),
    helpTiming:
      parsed.helpTiming === "before_attempt" ||
      parsed.helpTiming === "after_attempt"
        ? parsed.helpTiming
        : null,
    retentionOutcome:
      parsed.retentionOutcome === "remembered" ||
      parsed.retentionOutcome === "partial" ||
      parsed.retentionOutcome === "forgotten"
        ? parsed.retentionOutcome
        : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

export async function endSession(
  sessionId: SessionId,
  messages: SessionMessage[],
  systemPrompt: string,
  reason: "completed" | "abandoned" | "timeout",
  confidence?: {
    before: number | null;
    after: number | null;
  }
): Promise<EndSessionResult> {
  const { db, anthropic } = getDeps();

  const sessionRows = await db
    .select({
      id: studySessions.id,
      blockId: studySessions.blockId,
      status: studySessions.status,
      startedAt: studySessions.startedAt,
      topicsCovered: studySessions.topicsCovered,
    })
    .from(studySessions)
    .where(eq(studySessions.id, sessionId));

  if (sessionRows.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionRows[0];
  if (session.status !== "active") {
    throw new SessionConflictError(
      "SESSION_NOT_ACTIVE",
      "Study session is not active"
    );
  }

  let topicName = "Unknown Topic";
  let blockType: BlockType = "retrieval_drill";
  if (session.blockId) {
    const blockRows = await db
      .select({
        topicId: studyBlocks.topicId,
        blockType: studyBlocks.blockType,
      })
      .from(studyBlocks)
      .where(eq(studyBlocks.id, session.blockId));

    if (blockRows.length > 0) {
      blockType = blockRows[0].blockType as BlockType;
      const topicRows = await db
        .select({ name: topics.name })
        .from(topics)
        .where(eq(topics.id, blockRows[0].topicId));
      if (topicRows.length > 0) {
        topicName = topicRows[0].name;
      }
    }
  }

  const extractionPrompt = await buildOutcomeExtractionPrompt(blockType, topicName);

  const extractionMessages = [
    ...messages,
    {
      role: "user" as const,
      content: `[SYSTEM] The study session has ended (reason: ${reason}). Please analyse the conversation above and extract the structured outcome.`,
    },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: extractionPrompt,
    messages: extractionMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  let extracted: OutcomeExtractionResult;
  try {
    extracted = parseOutcomeJson(responseText);
  } catch (error: unknown) {
    process.stderr.write(
      JSON.stringify({
        level: "warn",
        msg: "Failed to parse outcome JSON",
        sessionId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      }) + "\n"
    );
    extracted = {
      score: null,
      misconceptions: [],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: null,
      summary: `Session ${reason}. Unable to extract structured outcome.`,
    };
  }

  const endedAt = new Date();
  const startedAt = new Date(session.startedAt);
  const durationMinutes = Math.round(
    (endedAt.getTime() - startedAt.getTime()) / 60000
  );

  const blockId = session.blockId as BlockId | null;
  const confidenceBefore = confidence?.before ?? null;
  const confidenceAfter = confidence?.after ?? null;

  await db.transaction(async (tx) => {
    const [updatedSession] = await tx
      .update(studySessions)
      .set({
        status: reason === "completed" ? "completed" : reason,
        endedAt,
        summary: extracted.summary,
        totalDurationMinutes: durationMinutes,
      })
      .where(
        and(
          eq(studySessions.id, sessionId),
          eq(studySessions.status, "active")
        )
      )
      .returning({ id: studySessions.id });

    if (!updatedSession) {
      throw new SessionConflictError(
        "SESSION_NOT_ACTIVE",
        "Study session is not active"
      );
    }

    if (blockId) {
      const attemptId = await findAttemptIdForSession(tx, blockId, sessionId);

      if (attemptId) {
        await tx
          .update(blockAttempts)
          .set({
            completedAt: endedAt,
            score: extracted.score?.toString() ?? null,
            confidenceBefore:
              confidenceBefore !== null ? confidenceBefore.toFixed(3) : null,
            confidenceAfter:
              confidenceAfter !== null ? confidenceAfter.toFixed(3) : null,
            helpRequested: extracted.helpRequested,
            helpTiming: extracted.helpTiming,
            misconceptionsDetected: extracted.misconceptions.length,
            notes: extracted.summary,
            rawInteraction: buildAttemptRawInteraction(sessionId, {
              messages,
              systemPrompt,
              extractedOutcome: {
                score: extracted.score,
                confidenceBefore,
                confidenceAfter,
                helpRequested: extracted.helpRequested,
                helpTiming: extracted.helpTiming,
                retentionOutcome: extracted.retentionOutcome,
                misconceptions: extracted.misconceptions,
                summary: extracted.summary,
              },
            }),
          })
          .where(eq(blockAttempts.id, attemptId));
      }

      const blockStatus = reason === "completed" ? "completed" : "pending";
      await tx
        .update(studyBlocks)
        .set({ status: blockStatus, updatedAt: new Date() })
        .where(eq(studyBlocks.id, blockId));
    }
  });

  const outcome: AttemptOutcome = {
    blockId: blockId ?? ("" as BlockId),
    score: extracted.score,
    confidenceBefore,
    confidenceAfter,
    helpRequested: extracted.helpRequested,
    helpTiming: extracted.helpTiming,
    misconceptions: extracted.misconceptions.map((m) => ({
      topicId: (session.topicsCovered?.[0] ?? "") as TopicId,
      ruleId: null,
      description: m.description,
      severity: m.severity,
    })),
    retentionOutcome: extracted.retentionOutcome,
    durationMinutes,
    rawInteraction: { messages },
  };

  // Wire mastery update: update spaced repetition state after session ends.
  // Best-effort — the Inngest update-queue function also processes this as a background job.
  if (outcome.blockId && outcome.score !== null) {
    try {
      await processAttemptOutcome(outcome, db);
    } catch (masteryError: unknown) {
      const msg = masteryError instanceof Error ? masteryError.message : String(masteryError);
      process.stderr.write(
        JSON.stringify({
          event: "session.mastery-update-failed",
          sessionId,
          blockId: outcome.blockId,
          error: msg,
          ts: new Date().toISOString(),
        }) + "\n"
      );
    }
  }

  return {
    outcome,
    summary: extracted.summary,
  };
}
