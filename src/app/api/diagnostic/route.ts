import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { structuredLog } from "@/lib/logger";
import {
  getDiagnosticTopics,
  getQualificationName,
  isLearnerEnrolled,
  buildDiagnosticSystemPrompt,
  sendDiagnosticMessage,
  analyseDiagnosticConversation,
  completeDiagnostic,
  skipDiagnostic,
  parseDiagnosticProgress,
  cleanDiagnosticReply,
  isDiagnosticComplete,
} from "@/engine/diagnostic";
import type { LearnerId, QualificationVersionId } from "@/lib/types";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    qualificationVersionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("message"),
    qualificationVersionId: z.string().uuid(),
    systemPrompt: z.string().min(1),
    messages: z.array(messageSchema).min(1),
  }),
  z.object({
    action: z.literal("complete"),
    qualificationVersionId: z.string().uuid(),
    messages: z.array(messageSchema).min(1),
  }),
  z.object({
    action: z.literal("skip"),
    qualificationVersionId: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
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

  const learnerId = ctx.learnerId as LearnerId;
  const qualificationVersionId =
    parsed.data.qualificationVersionId as QualificationVersionId;

  const enrolled = await isLearnerEnrolled(
    db,
    learnerId,
    qualificationVersionId
  );
  if (!enrolled) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_ENROLLED",
          message: "Learner is not enrolled in this qualification",
        },
      },
      { status: 403 }
    );
  }

  switch (parsed.data.action) {
    case "start":
      return handleStart(learnerId, qualificationVersionId);
    case "message":
      return handleMessage(
        parsed.data.systemPrompt,
        parsed.data.messages
      );
    case "complete":
      return handleComplete(
        learnerId,
        qualificationVersionId,
        parsed.data.messages
      );
    case "skip":
      return handleSkip(learnerId, qualificationVersionId);
  }
}

async function handleStart(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
) {
  const [qualName, diagnosticTopics] = await Promise.all([
    getQualificationName(db, qualificationVersionId),
    getDiagnosticTopics(db, qualificationVersionId),
  ]);

  if (!qualName) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Qualification not found",
        },
      },
      { status: 404 }
    );
  }

  if (diagnosticTopics.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "NO_TOPICS",
          message: "No topics found for this qualification",
        },
      },
      { status: 404 }
    );
  }

  const systemPrompt = await buildDiagnosticSystemPrompt(
    qualName,
    diagnosticTopics
  );

  const reply = await sendDiagnosticMessage(systemPrompt, [
    { role: "user", content: "I'm ready to start the diagnostic." },
  ]);

  const progress = parseDiagnosticProgress(reply);
  progress.total = diagnosticTopics.length;

  structuredLog("diagnostic.started", {
    learnerId,
    qualificationVersionId,
    topicCount: diagnosticTopics.length,
  });

  return NextResponse.json({
    data: {
      systemPrompt,
      reply: cleanDiagnosticReply(reply),
      topics: diagnosticTopics,
      progress,
      qualificationName: qualName,
    },
  });
}

async function handleMessage(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
) {
  const reply = await sendDiagnosticMessage(systemPrompt, messages);
  const progress = parseDiagnosticProgress(reply);
  const isComplete = isDiagnosticComplete(reply);

  return NextResponse.json({
    data: {
      reply: cleanDiagnosticReply(reply),
      progress,
      isComplete,
    },
  });
}

async function handleComplete(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  messages: Array<{ role: "user" | "assistant"; content: string }>
) {
  const [diagnosticTopics, qualName] = await Promise.all([
    getDiagnosticTopics(db, qualificationVersionId),
    getQualificationName(db, qualificationVersionId),
  ]);

  const results = await analyseDiagnosticConversation(
    messages,
    diagnosticTopics,
    qualName ?? "Unknown qualification"
  );

  const { topicsUpdated } = await completeDiagnostic(
    db,
    learnerId,
    qualificationVersionId,
    results
  );

  structuredLog("diagnostic.completed", {
    learnerId,
    qualificationVersionId,
    topicsAnalysed: results.length,
    topicsUpdated,
  });

  return NextResponse.json({
    data: { results, topicsUpdated },
  });
}

async function handleSkip(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
) {
  const { topicsInitialised } = await skipDiagnostic(
    db,
    learnerId,
    qualificationVersionId
  );

  structuredLog("diagnostic.skipped", {
    learnerId,
    qualificationVersionId,
    topicsInitialised,
  });

  return NextResponse.json({
    data: { topicsInitialised },
  });
}
