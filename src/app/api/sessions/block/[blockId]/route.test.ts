import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestLearner,
  createTestOrg,
  createTestQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import { studyBlocks, studyPlans } from "@/db/schema";

const {
  requireLearnerMock,
  getBlockSessionRecoveryStateMock,
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
    getBlockSessionRecoveryStateMock: vi.fn(),
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
  getBlockSessionRecoveryState: getBlockSessionRecoveryStateMock,
}));

import { GET } from "./route";

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

beforeEach(() => {
  resetFixtureCounter();
  requireLearnerMock.mockReset();
  getBlockSessionRecoveryStateMock.mockReset();
  getBlockSessionRecoveryStateMock.mockResolvedValue({ mode: "fresh" });
});

describe("GET /api/sessions/block/[blockId]", () => {
  it("returns the block with serialized resume recovery data", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const block = await createBlock(learner.id, qual.topics[1].id);

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });
    getBlockSessionRecoveryStateMock.mockResolvedValue({
      mode: "resume",
      sessionId: "session-1",
      startedAt: new Date("2026-04-01T10:00:00.000Z"),
      systemPrompt: "prompt",
      messages: [{ role: "assistant", content: "Resume me" }],
      completionPending: false,
    });

    const response = await GET(
      new Request(`http://localhost/api/sessions/block/${block.id}`),
      { params: Promise.resolve({ blockId: block.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.block.id).toBe(block.id);
    expect(body.data.recovery).toEqual({
      mode: "resume",
      sessionId: "session-1",
      startedAt: "2026-04-01T10:00:00.000Z",
      systemPrompt: "prompt",
      messages: [{ role: "assistant", content: "Resume me" }],
      completionPending: false,
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

    const response = await GET(
      new Request(`http://localhost/api/sessions/block/${block.id}`),
      { params: Promise.resolve({ blockId: block.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(getBlockSessionRecoveryStateMock).not.toHaveBeenCalled();
  });
});
