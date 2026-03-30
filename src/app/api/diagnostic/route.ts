import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner, AuthError } from "@/lib/auth";
import { structuredLog } from "@/lib/logger";
import {
  DIAGNOSTIC_START_MESSAGE,
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
  createDiagnosticSessionState,
  generateDiagnosticSessionToken,
  verifyDiagnosticSessionToken,
  getDiagnosticSessionCookieName,
  extendsDiagnosticTranscript,
  matchesDiagnosticTranscript,
  type DiagnosticMessage,
} from "@/engine/diagnostic";
import {
  getNextPendingDiagnosticPath,
  getQualificationDiagnosticStatus,
  DiagnosticStatusTransitionError,
} from "@/lib/pending-diagnostics";
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

  const diagnosticStatus = await getQualificationDiagnosticStatus(
    db,
    learnerId,
    qualificationVersionId
  );
  if (diagnosticStatus !== "pending") {
    return NextResponse.json(
      {
        error: {
          code: "DIAGNOSTIC_ALREADY_RESOLVED",
          message:
            "Diagnostic has already been resolved for this qualification.",
        },
      },
      { status: 409 }
    );
  }

  switch (parsed.data.action) {
    case "start":
      return handleStart(learnerId, qualificationVersionId);
    case "message":
      return handleMessage(
        request,
        learnerId,
        qualificationVersionId,
        parsed.data.messages
      );
    case "complete":
      return handleComplete(
        request,
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

  const initialMessages: DiagnosticMessage[] = [
    { role: "user", content: DIAGNOSTIC_START_MESSAGE },
  ];
  const reply = await sendDiagnosticMessage(systemPrompt, initialMessages);
  const cleanReply = cleanDiagnosticReply(reply);
  const isComplete = isDiagnosticComplete(reply);

  const progress = parseDiagnosticProgress(reply);
  progress.total = diagnosticTopics.length;
  progress.isComplete = isComplete;

  const sessionState = createDiagnosticSessionState(
    learnerId,
    qualificationVersionId,
    [...initialMessages, { role: "assistant", content: cleanReply }],
    isComplete
  );

  structuredLog("diagnostic.started", {
    learnerId,
    qualificationVersionId,
    topicCount: diagnosticTopics.length,
  });

  const response = NextResponse.json({
    data: {
      systemPrompt,
      reply: cleanReply,
      topics: diagnosticTopics,
      progress,
      qualificationName: qualName,
    },
  });

  setDiagnosticSessionCookie(
    response,
    qualificationVersionId,
    generateDiagnosticSessionToken(sessionState),
    sessionState.expiresAt
  );

  return response;
}

async function handleMessage(
  request: NextRequest,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  messages: DiagnosticMessage[]
) {
  const sessionState = readDiagnosticSessionState(
    request,
    qualificationVersionId
  );
  if (
    !sessionState ||
    sessionState.learnerId !== learnerId ||
    sessionState.qualificationVersionId !== qualificationVersionId
  ) {
    structuredLog("diagnostic.message.invalid_state", {
      learnerId,
      qualificationVersionId,
      reason: sessionState ? "mismatch" : "missing_or_invalid",
    });
    return buildDiagnosticStateError(
      qualificationVersionId,
      "INVALID_DIAGNOSTIC_STATE",
      "Diagnostic session is invalid or has expired. Please restart the diagnostic."
    );
  }

  if (sessionState.isComplete) {
    structuredLog("diagnostic.message.after_complete", {
      learnerId,
      qualificationVersionId,
      messageCount: sessionState.messageCount,
    });
    return NextResponse.json(
      {
        error: {
          code: "DIAGNOSTIC_COMPLETE",
          message: "Diagnostic is already complete. View your results or restart the diagnostic.",
        },
      },
      { status: 409 }
    );
  }

  if (!extendsDiagnosticTranscript(messages, sessionState)) {
    structuredLog("diagnostic.message.transcript_mismatch", {
      learnerId,
      qualificationVersionId,
      expectedMessageCount: sessionState.messageCount + 1,
      receivedMessageCount: messages.length,
    });
    return buildDiagnosticStateError(
      qualificationVersionId,
      "INVALID_DIAGNOSTIC_STATE",
      "Diagnostic session is invalid or has expired. Please restart the diagnostic."
    );
  }

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
  const reply = await sendDiagnosticMessage(systemPrompt, messages);
  const progress = parseDiagnosticProgress(reply);
  const isComplete = isDiagnosticComplete(reply);
  const cleanReply = cleanDiagnosticReply(reply);
  progress.isComplete = isComplete;

  const nextMessages: DiagnosticMessage[] = [
    ...messages,
    { role: "assistant", content: cleanReply },
  ];
  const nextState = createDiagnosticSessionState(
    learnerId,
    qualificationVersionId,
    nextMessages,
    isComplete
  );

  const response = NextResponse.json({
    data: {
      reply: cleanReply,
      progress,
      isComplete,
    },
  });

  setDiagnosticSessionCookie(
    response,
    qualificationVersionId,
    generateDiagnosticSessionToken(nextState),
    nextState.expiresAt
  );

  return response;
}

async function handleComplete(
  request: NextRequest,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  messages: DiagnosticMessage[]
) {
  const sessionState = readDiagnosticSessionState(
    request,
    qualificationVersionId
  );
  if (
    !sessionState ||
    sessionState.learnerId !== learnerId ||
    sessionState.qualificationVersionId !== qualificationVersionId
  ) {
    structuredLog("diagnostic.complete.invalid_state", {
      learnerId,
      qualificationVersionId,
      reason: sessionState ? "mismatch" : "missing_or_invalid",
    });
    return buildDiagnosticStateError(
      qualificationVersionId,
      "INVALID_DIAGNOSTIC_STATE",
      "Diagnostic session is invalid or has expired. Please restart the diagnostic."
    );
  }

  if (!sessionState.isComplete) {
    return NextResponse.json(
      {
        error: {
          code: "DIAGNOSTIC_INCOMPLETE",
          message: "Diagnostic is not complete yet.",
        },
      },
      { status: 409 }
    );
  }

  if (!matchesDiagnosticTranscript(messages, sessionState)) {
    structuredLog("diagnostic.complete.transcript_mismatch", {
      learnerId,
      qualificationVersionId,
      expectedMessageCount: sessionState.messageCount,
      receivedMessageCount: messages.length,
    });
    return buildDiagnosticStateError(
      qualificationVersionId,
      "INVALID_DIAGNOSTIC_STATE",
      "Diagnostic session is invalid or has expired. Please restart the diagnostic."
    );
  }

  const [diagnosticTopics, qualName] = await Promise.all([
    getDiagnosticTopics(db, qualificationVersionId),
    getQualificationName(db, qualificationVersionId),
  ]);

  const results = await analyseDiagnosticConversation(
    messages,
    diagnosticTopics,
    qualName ?? "Unknown qualification"
  );

  let topicsUpdated: number;
  try {
    ({ topicsUpdated } = await completeDiagnostic(
      db,
      learnerId,
      qualificationVersionId,
      results
    ));
  } catch (error: unknown) {
    if (error instanceof DiagnosticStatusTransitionError) {
      return NextResponse.json(
        {
          error: {
            code: "DIAGNOSTIC_ALREADY_RESOLVED",
            message:
              "Diagnostic has already been resolved for this qualification.",
          },
        },
        { status: 409 }
      );
    }
    throw error;
  }
  const nextPath =
    (await getNextPendingDiagnosticPath(db, learnerId)) ?? "/dashboard";

  structuredLog("diagnostic.completed", {
    learnerId,
    qualificationVersionId,
    topicsAnalysed: results.length,
    topicsUpdated,
    nextPath,
  });

  const response = NextResponse.json({
    data: { results, topicsUpdated, nextPath },
  });

  clearDiagnosticSessionCookie(response, qualificationVersionId);

  return response;
}

async function handleSkip(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
) {
  let topicsInitialised: number;
  try {
    ({ topicsInitialised } = await skipDiagnostic(
      db,
      learnerId,
      qualificationVersionId
    ));
  } catch (error: unknown) {
    if (error instanceof DiagnosticStatusTransitionError) {
      return NextResponse.json(
        {
          error: {
            code: "DIAGNOSTIC_ALREADY_RESOLVED",
            message:
              "Diagnostic has already been resolved for this qualification.",
          },
        },
        { status: 409 }
      );
    }
    throw error;
  }
  const nextPath =
    (await getNextPendingDiagnosticPath(db, learnerId)) ?? "/dashboard";

  structuredLog("diagnostic.skipped", {
    learnerId,
    qualificationVersionId,
    topicsInitialised,
    nextPath,
  });

  const response = NextResponse.json({
    data: { topicsInitialised, nextPath },
  });

  clearDiagnosticSessionCookie(response, qualificationVersionId);

  return response;
}

function readDiagnosticSessionState(
  request: NextRequest,
  qualificationVersionId: QualificationVersionId
) {
  const token = request.cookies.get(
    getDiagnosticSessionCookieName(qualificationVersionId)
  )?.value;
  if (!token) {
    return null;
  }

  return verifyDiagnosticSessionToken(token);
}

function setDiagnosticSessionCookie(
  response: NextResponse,
  qualificationVersionId: QualificationVersionId,
  token: string,
  expiresAt: number
) {
  response.cookies.set({
    name: getDiagnosticSessionCookieName(qualificationVersionId),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/diagnostic",
    expires: new Date(expiresAt),
  });
}

function clearDiagnosticSessionCookie(
  response: NextResponse,
  qualificationVersionId: QualificationVersionId
) {
  response.cookies.set({
    name: getDiagnosticSessionCookieName(qualificationVersionId),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/diagnostic",
    expires: new Date(0),
  });
}

function buildDiagnosticStateError(
  qualificationVersionId: QualificationVersionId,
  code: string,
  message: string
) {
  const response = NextResponse.json(
    {
      error: { code, message },
    },
    { status: 409 }
  );
  clearDiagnosticSessionCookie(response, qualificationVersionId);
  return response;
}
