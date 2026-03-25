import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTestDatabase, getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  resetFixtureCounter,
} from "@/test/fixtures";
import { studySessions } from "@/db/schema";

const {
  requireLearnerMock,
  continueSessionMock,
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
    continueSessionMock: vi.fn(),
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
  continueSession: continueSessionMock,
  SessionConflictError: MockSessionConflictError,
}));

vi.mock("@/app/api/sessions/_lib/session-runner", () => ({
  ensureSessionRunnerConfigured: ensureSessionRunnerConfiguredMock,
}));

import { POST } from "./route";

const db = getTestDb();

beforeEach(async () => {
  await cleanupTestDatabase();
  resetFixtureCounter();
  requireLearnerMock.mockReset();
  continueSessionMock.mockReset();
  ensureSessionRunnerConfiguredMock.mockReset();
});

describe("POST /api/sessions/[id]/message", () => {
  it("streams the next assistant reply for the learner's session", async () => {
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
    continueSessionMock.mockResolvedValue({
      reply: "Next question",
      isComplete: false,
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "prompt",
          messages: [{ role: "user", content: "answer" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Next question");
    expect(ensureSessionRunnerConfiguredMock).toHaveBeenCalledTimes(1);
    expect(continueSessionMock).toHaveBeenCalledWith(
      session.id,
      [{ role: "user", content: "answer" }],
      "prompt"
    );
  });

  it("re-attaches the completion marker for the client flow", async () => {
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
    continueSessionMock.mockResolvedValue({
      reply: "Done",
      isComplete: true,
    });

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "prompt",
          messages: [{ role: "user", content: "answer" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Done<session_status>complete</session_status>"
    );
  });

  it("returns 409 for transcript conflicts", async () => {
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
    continueSessionMock.mockRejectedValue(
      new MockSessionConflictError(
        "SESSION_TRANSCRIPT_MISMATCH",
        "Submitted messages do not match the stored session transcript"
      )
    );

    const response = await POST(
      new Request(`http://localhost/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "prompt",
          messages: [{ role: "user", content: "answer" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("SESSION_TRANSCRIPT_MISMATCH");
  });

  it("returns 404 when the session does not belong to the learner", async () => {
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
      new Request(`http://localhost/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "prompt",
          messages: [{ role: "user", content: "answer" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(continueSessionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the session is not active", async () => {
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
      new Request(`http://localhost/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "prompt",
          messages: [{ role: "user", content: "answer" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("SESSION_NOT_ACTIVE");
    expect(continueSessionMock).not.toHaveBeenCalled();
  });
});
