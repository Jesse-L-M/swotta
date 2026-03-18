import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { studySessions } from "@/db/schema";
import {
  generateShareToken,
  getSharedReplay,
  generateReplaySummary,
} from "@/engine/replay";
import type { SessionId, LearnerId } from "@/lib/types";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_TOKEN",
          message: "Share token is required as a query parameter",
        },
      },
      { status: 400 }
    );
  }

  const replay = await getSharedReplay(db, token);

  if (!replay) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_OR_EXPIRED",
          message: "Share link is invalid or has expired",
        },
      },
      { status: 404 }
    );
  }

  // Verify the token's session ID matches the URL parameter
  if (replay.sessionId !== sessionId) {
    return NextResponse.json(
      {
        error: {
          code: "SESSION_MISMATCH",
          message: "Share token does not match this session",
        },
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ data: replay });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

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

  // Verify the learner owns this session
  const sessionRows = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.id, sessionId),
        eq(studySessions.learnerId, ctx.learnerId)
      )
    );

  if (sessionRows.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Session not found or you do not have access",
        },
      },
      { status: 404 }
    );
  }

  const { token, expiresAt } = generateShareToken(sessionId);

  const origin = request.nextUrl.origin;
  const shareUrl = `${origin}/api/session/${sessionId}/share?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    data: {
      token,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
    },
  });
}
