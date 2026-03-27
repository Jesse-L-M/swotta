import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studySessions } from "@/db/schema";
import {
  endSession,
  getStoredSessionTranscript,
  SessionConflictError,
} from "@/engine/session";
import { ensureSessionRunnerConfigured } from "@/app/api/sessions/_lib/session-runner";
import { queueAttemptCompleted } from "@/lib/background-events";
import { structuredLog } from "@/lib/logger";
import type { SessionId } from "@/lib/types";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const requestSchema = z.object({
  reason: z.enum(["completed", "abandoned", "timeout"]),
  confidence: z
    .object({
      before: z.number().min(0).max(1).nullable(),
      after: z.number().min(0).max(1).nullable(),
    })
    .optional(),
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
    .select({ id: studySessions.id, status: studySessions.status })
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

  if (session.status !== "active") {
    return NextResponse.json(
      {
        error: {
          code: "SESSION_NOT_ACTIVE",
          message: "Study session is not active",
        },
      },
      { status: 409 }
    );
  }

  const transcript = await getStoredSessionTranscript(
    db,
    session.id as SessionId
  );
  if (!transcript) {
    return NextResponse.json(
      {
        error: {
          code: "SESSION_TRANSCRIPT_MISSING",
          message: "Stored session transcript is unavailable",
        },
      },
      { status: 409 }
    );
  }

  ensureSessionRunnerConfigured();
  let result;
  try {
    result = await endSession(
      session.id as SessionId,
      transcript.messages,
      transcript.systemPrompt,
      parsed.data.reason,
      parsed.data.confidence
    );
  } catch (error: unknown) {
    if (error instanceof SessionConflictError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 409 }
      );
    }
    throw error;
  }

  if (result.masteryUpdated) {
    try {
      await queueAttemptCompleted(result.outcome);
    } catch (error) {
      structuredLog("session.queue_attempt_error", {
        sessionId: session.id,
        blockId: result.outcome.blockId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    data: {
      outcome: result.outcome,
      summary: result.summary,
    },
  });
}
