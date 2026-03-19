import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studySessions } from "@/db/schema";
import { endSession } from "@/engine/session";
import { ensureSessionRunnerConfigured } from "@/app/api/sessions/_lib/session-runner";
import type { SessionId } from "@/lib/types";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const requestSchema = z.object({
  systemPrompt: z.string().min(1),
  reason: z.enum(["completed", "abandoned", "timeout"]),
  confidence: z
    .object({
      before: z.number().min(0).max(1).nullable(),
      after: z.number().min(0).max(1).nullable(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1),
});

export async function POST(
  request: Request,
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

  const [session] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.id, params.data.id),
        eq(studySessions.learnerId, ctx.learnerId)
      )
    )
    .limit(1);

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Study session not found",
        },
      },
      { status: 404 }
    );
  }

  ensureSessionRunnerConfigured();
  const result = await endSession(
    session.id as SessionId,
    parsed.data.messages,
    parsed.data.systemPrompt,
    parsed.data.reason,
    parsed.data.confidence
  );

  return NextResponse.json({ data: result });
}
