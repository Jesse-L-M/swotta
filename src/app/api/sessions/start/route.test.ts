import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import { studyBlocks, studyPlans } from "@/db/schema";

const {
  requireLearnerMock,
  assembleLearnerContextMock,
  startSessionMock,
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
    assembleLearnerContextMock: vi.fn(),
    startSessionMock: vi.fn(),
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

vi.mock("@/engine/memory", () => ({
  assembleLearnerContext: assembleLearnerContextMock,
}));

vi.mock("@/engine/session", () => ({
  startSession: startSessionMock,
}));

vi.mock("@/app/api/sessions/_lib/session-runner", () => ({
  ensureSessionRunnerConfigured: ensureSessionRunnerConfiguredMock,
}));

import { POST } from "./route";

const db = getTestDb();

async function createBlock(learnerId: string, topicId: string) {
  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId,
      planType: "weekly",
      startDate: "2026-03-16",
      endDate: "2026-03-22",
      status: "active",
    })
    .returning();

  const [block] = await db
    .insert(studyBlocks)
    .values({
      planId: plan.id,
      learnerId,
      topicId,
      blockType: "retrieval_drill",
      durationMinutes: 15,
      priority: 4,
      status: "pending",
    })
    .returning();

  return block;
}

beforeEach(async () => {
  resetFixtureCounter();
  requireLearnerMock.mockReset();
  assembleLearnerContextMock.mockReset();
  startSessionMock.mockReset();
  ensureSessionRunnerConfiguredMock.mockReset();
});

describe("POST /api/sessions/start", () => {
  it("starts a session for the learner's block", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const block = await createBlock(learner.id, qual.topics[1].id);

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });
    assembleLearnerContextMock.mockResolvedValue({
      masteryLevel: 0.5,
      knownMisconceptions: [],
      confirmedMemory: [],
      preferences: {},
      policies: [],
    });
    startSessionMock.mockResolvedValue({
      sessionId: "session-1",
      systemPrompt: "prompt",
      initialMessage: "Welcome",
    });

    const response = await POST(
      new Request("http://localhost/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.id }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureSessionRunnerConfiguredMock).toHaveBeenCalledTimes(1);
    expect(assembleLearnerContextMock).toHaveBeenCalledWith(
      db,
      learner.id,
      qual.topics[1].id
    );
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: block.id,
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        topicName: "Topic 1.1",
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 4,
        reason: "Scheduled study block",
      }),
      expect.objectContaining({ masteryLevel: 0.5 })
    );
    expect(body).toEqual({
      data: {
        sessionId: "session-1",
        systemPrompt: "prompt",
        initialMessage: "Welcome",
      },
    });
  });

  it("returns 404 when the block is not owned by the learner", async () => {
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const block = await createBlock(learnerA.id, qual.topics[1].id);

    requireLearnerMock.mockResolvedValue({
      learnerId: learnerB.id,
      orgId: org.id,
    });

    const response = await POST(
      new Request("http://localhost/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.id }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(startSessionMock).not.toHaveBeenCalled();
  });
});
