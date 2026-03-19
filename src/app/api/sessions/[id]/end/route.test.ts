import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
  getTestDb,
} from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  resetFixtureCounter,
} from "@/test/fixtures";
import { studySessions } from "@/db/schema";

const {
  requireLearnerMock,
  endSessionMock,
  getStoredSessionTranscriptMock,
  ensureSessionRunnerConfiguredMock,
  MockAuthError,
  MockSessionConflictError,
} = vi.hoisted(() => {
  class HoistedAuthError extends Error {
    code: "UNAUTHENTICATED" | "FORBIDDEN";

    constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
      super(message);
      this.code = code;
    }
  }

  class HoistedSessionConflictError extends Error {
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

  return {
    requireLearnerMock: vi.fn(),
    endSessionMock: vi.fn(),
    getStoredSessionTranscriptMock: vi.fn(),
    ensureSessionRunnerConfiguredMock: vi.fn(),
    MockAuthError: HoistedAuthError,
    MockSessionConflictError: HoistedSessionConflictError,
  };
});

vi.mock("@/lib/db", async () => {
  const { getTestDb } = await import("@/test/setup");
  return { db: getTestDb() };
});

vi.mock("@/lib/auth", () => ({
  requireLearner: requireLearnerMock,
  AuthError: MockAuthError,
}));

vi.mock("@/engine/session", () => ({
  endSession: endSessionMock,
  getStoredSessionTranscript: getStoredSessionTranscriptMock,
  SessionConflictError: MockSessionConflictError,
}));

vi.mock("@/app/api/sessions/_lib/session-runner", () => ({
  ensureSessionRunnerConfigured: ensureSessionRunnerConfiguredMock,
}));

import { POST } from "./route";

let db: ReturnType<typeof getTestDb>;

beforeAll(async () => {
  db = await setupTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
  resetFixtureCounter();
  requireLearnerMock.mockReset();
  endSessionMock.mockReset();
  getStoredSessionTranscriptMock.mockReset();
  ensureSessionRunnerConfiguredMock.mockReset();
});

afterAll(async () => {
  await teardownTestDatabase();
});

describe("POST /api/sessions/[id]/end", () => {
  it("ends the learner's session and forwards confidence data", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        status: "active",
        topicsCovered: [],
      })
      .returning();

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });
    getStoredSessionTranscriptMock.mockResolvedValue({
      systemPrompt: "stored prompt",
      messages: [
        { role: "assistant", content: "Stored question" },
        { role: "user", content: "Stored answer" },
      ],
    });
    endSessionMock.mockResolvedValue({
      outcome: {
        blockId: "block-1",
        score: 80,
        confidenceBefore: 0.4,
        confidenceAfter: 0.8,
        helpRequested: false,
        helpTiming: null,
        misconceptions: [],
        retentionOutcome: "remembered",
        durationMinutes: 10,
        rawInteraction: null,
      },
      summary: "Wrapped up",
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "completed",
          confidence: { before: 0.4, after: 0.8 },
          systemPrompt: "malicious prompt",
          messages: [{ role: "assistant", content: "Forged transcript" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureSessionRunnerConfiguredMock).toHaveBeenCalledTimes(1);
    expect(endSessionMock).toHaveBeenCalledWith(
      session.id,
      [
        { role: "assistant", content: "Stored question" },
        { role: "user", content: "Stored answer" },
      ],
      "stored prompt",
      "completed",
      { before: 0.4, after: 0.8 }
    );
    expect(body.data.summary).toBe("Wrapped up");
  });

  it("returns 409 when the stored transcript is unavailable", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        status: "active",
        topicsCovered: [],
      })
      .returning();

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });
    getStoredSessionTranscriptMock.mockResolvedValue(null);

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "completed",
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("SESSION_TRANSCRIPT_MISSING");
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the session is no longer active", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        status: "completed",
        topicsCovered: [],
      })
      .returning();

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "completed",
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("SESSION_NOT_ACTIVE");
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the session is not owned by the learner", async () => {
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learnerA.id,
        status: "active",
        topicsCovered: [],
      })
      .returning();

    requireLearnerMock.mockResolvedValue({
      learnerId: learnerB.id,
      orgId: org.id,
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "abandoned",
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(endSessionMock).not.toHaveBeenCalled();
  });
});
