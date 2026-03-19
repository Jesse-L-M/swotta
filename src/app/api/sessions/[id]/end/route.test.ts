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
  ensureSessionRunnerConfiguredMock,
  MockAuthError,
} = vi.hoisted(() => {
  class HoistedAuthError extends Error {
    code: "UNAUTHENTICATED" | "FORBIDDEN";

    constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    requireLearnerMock: vi.fn(),
    endSessionMock: vi.fn(),
    ensureSessionRunnerConfiguredMock: vi.fn(),
    MockAuthError: HoistedAuthError,
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
          systemPrompt: "prompt",
          reason: "completed",
          confidence: { before: 0.4, after: 0.8 },
          messages: [{ role: "assistant", content: "Done" }],
        }),
      }),
      { params: Promise.resolve({ id: session.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureSessionRunnerConfiguredMock).toHaveBeenCalledTimes(1);
    expect(endSessionMock).toHaveBeenCalledWith(
      session.id,
      [{ role: "assistant", content: "Done" }],
      "prompt",
      "completed",
      { before: 0.4, after: 0.8 }
    );
    expect(body.data.summary).toBe("Wrapped up");
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
          systemPrompt: "prompt",
          reason: "abandoned",
          messages: [{ role: "assistant", content: "Done" }],
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
