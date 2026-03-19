import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studyBlocks, topics } from "@/db/schema";
import type { BlockType } from "@/lib/types";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
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

  const parsed = paramsSchema.safeParse(await context.params);
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
        eq(studyBlocks.id, parsed.data.id),
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

  return NextResponse.json({
    data: {
      id: block.id,
      topicName: block.topicName,
      blockType: block.blockType as BlockType,
      durationMinutes: block.durationMinutes,
      reason: "Scheduled study block",
    },
  });
}
