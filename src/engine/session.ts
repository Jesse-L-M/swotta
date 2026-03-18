import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "@/lib/db";
import { studySessions, blockAttempts, studyBlocks, topics } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildSystemPrompt,
  parseSessionStatus,
  buildOutcomeExtractionPrompt,
  type LearnerContext,
} from "@/ai/study-modes";
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
  systemPrompt: string
): Promise<ContinueSessionResult> {
  const { anthropic } = getDeps();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const rawReply =
    response.content[0].type === "text" ? response.content[0].text : "";

  const { isComplete, cleanReply } = parseSessionStatus(rawReply);

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
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
  reason: "completed" | "abandoned" | "timeout"
): Promise<EndSessionResult> {
  const { db, anthropic } = getDeps();

  const sessionRows = await db
    .select({
      id: studySessions.id,
      blockId: studySessions.blockId,
      startedAt: studySessions.startedAt,
      topicsCovered: studySessions.topicsCovered,
    })
    .from(studySessions)
    .where(eq(studySessions.id, sessionId));

  if (sessionRows.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionRows[0];

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
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "Failed to parse outcome JSON",
        sessionId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
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

  await db.transaction(async (tx) => {
    await tx
      .update(studySessions)
      .set({
        status: reason === "completed" ? "completed" : reason,
        endedAt,
        summary: extracted.summary,
        totalDurationMinutes: durationMinutes,
      })
      .where(eq(studySessions.id, sessionId));

    if (blockId) {
      const existingAttempts = await tx
        .select({ id: blockAttempts.id })
        .from(blockAttempts)
        .where(eq(blockAttempts.blockId, blockId));

      if (existingAttempts.length > 0) {
        await tx
          .update(blockAttempts)
          .set({
            completedAt: endedAt,
            score: extracted.score?.toString() ?? null,
            confidenceBefore: null,
            confidenceAfter: null,
            helpRequested: extracted.helpRequested,
            helpTiming: extracted.helpTiming,
            misconceptionsDetected: extracted.misconceptions.length,
            notes: extracted.summary,
            rawInteraction: { messages },
          })
          .where(eq(blockAttempts.id, existingAttempts[0].id));
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
    confidenceBefore: null,
    confidenceAfter: null,
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

  return {
    outcome,
    summary: extracted.summary,
  };
}
