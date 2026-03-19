import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studyBlocks, topics } from "@/db/schema";
import { assembleLearnerContext } from "@/engine/memory";
import { startSession } from "@/engine/session";
import { ensureSessionRunnerConfigured } from "@/app/api/sessions/_lib/session-runner";
import type {
  BlockId,
  BlockType,
  LearnerId,
  StudyBlock,
  TopicId,
} from "@/lib/types";

const requestSchema = z.object({
  blockId: z.string().uuid(),
});

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireLearner>>;
  try {
    ctx = await requireLearner();
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status }
      );
    }
    throw error;
  }

  const body: unknown = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0].message,
        },
      },
      { status: 400 }
    );
  }

  const [blockRow] = await db
    .select({
      id: studyBlocks.id,
      learnerId: studyBlocks.learnerId,
      topicId: studyBlocks.topicId,
      topicName: topics.name,
      blockType: studyBlocks.blockType,
      durationMinutes: studyBlocks.durationMinutes,
      priority: studyBlocks.priority,
    })
    .from(studyBlocks)
    .innerJoin(topics, eq(topics.id, studyBlocks.topicId))
    .where(
      and(
        eq(studyBlocks.id, parsed.data.blockId),
        eq(studyBlocks.learnerId, ctx.learnerId)
      )
    )
    .limit(1);

  if (!blockRow) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Study block not found",
        },
      },
      { status: 404 }
    );
  }

  const learnerId = blockRow.learnerId as LearnerId;
  const topicId = blockRow.topicId as TopicId;

  const block: StudyBlock = {
    id: blockRow.id as BlockId,
    learnerId,
    topicId,
    topicName: blockRow.topicName,
    blockType: blockRow.blockType as BlockType,
    durationMinutes: blockRow.durationMinutes,
    priority: blockRow.priority,
    reason: "Scheduled study block",
  };

  const learnerContext = await assembleLearnerContext(db, learnerId, topicId);

  ensureSessionRunnerConfigured();
  const result = await startSession(block, learnerContext);

  return NextResponse.json({
    data: {
      sessionId: result.sessionId,
      systemPrompt: result.systemPrompt,
      initialMessage: result.initialMessage,
    },
  });
}
