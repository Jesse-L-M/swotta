import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studyBlocks, topics } from "@/db/schema";
import { getBlockSessionRecoveryState } from "@/engine/session";
import type { BlockId, BlockType, LearnerId } from "@/lib/types";

const paramsSchema = z.object({
  blockId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ blockId: string }> }
) {
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

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: params.error.issues[0].message,
        },
      },
      { status: 400 }
    );
  }

  const [block] = await db
    .select({
      id: studyBlocks.id,
      topicName: topics.name,
      blockType: studyBlocks.blockType,
      durationMinutes: studyBlocks.durationMinutes,
    })
    .from(studyBlocks)
    .innerJoin(topics, eq(topics.id, studyBlocks.topicId))
    .where(
      and(
        eq(studyBlocks.id, params.data.blockId),
        eq(studyBlocks.learnerId, ctx.learnerId)
      )
    )
    .limit(1);

  if (!block) {
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

  const recovery = await getBlockSessionRecoveryState(
    db,
    ctx.learnerId as LearnerId,
    block.id as BlockId
  );

  return NextResponse.json({
    data: {
      block: {
        id: block.id,
        topicName: block.topicName,
        blockType: block.blockType as BlockType,
        durationMinutes: block.durationMinutes,
        reason: "Scheduled study block",
      },
      recovery: serializeRecoveryState(recovery),
    },
  });
}

function serializeRecoveryState(
  recovery: Awaited<ReturnType<typeof getBlockSessionRecoveryState>>
) {
  switch (recovery.mode) {
    case "fresh":
      return recovery;
    case "resume":
      return {
        ...recovery,
        startedAt: recovery.startedAt.toISOString(),
      };
    case "restart":
      return {
        ...recovery,
        startedAt: recovery.startedAt?.toISOString() ?? null,
        endedAt: recovery.endedAt?.toISOString() ?? null,
      };
    case "completed":
      return {
        ...recovery,
        startedAt: recovery.startedAt.toISOString(),
        endedAt: recovery.endedAt?.toISOString() ?? null,
      };
  }
}
