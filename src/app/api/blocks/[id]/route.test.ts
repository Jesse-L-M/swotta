import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import { studyBlocks, studyPlans } from "@/db/schema";

const { requireLearnerMock, MockAuthError } = vi.hoisted(() => {
  class HoistedAuthError extends Error {
    code: "UNAUTHENTICATED" | "FORBIDDEN";

    constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    requireLearnerMock: vi.fn(),
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
      priority: 3,
      status: "pending",
    })
    .returning();

  return block;
}

beforeEach(async () => {
  resetFixtureCounter();
  requireLearnerMock.mockReset();
});

describe("GET /api/blocks/[id]", () => {
  it("returns the learner's block details", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const block = await createBlock(learner.id, qual.topics[1].id);

    requireLearnerMock.mockResolvedValue({
      learnerId: learner.id,
      orgId: org.id,
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: block.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        id: block.id,
        topicName: "Topic 1.1",
        blockType: "retrieval_drill",
        durationMinutes: 15,
        reason: "Scheduled study block",
      },
    });
  });

  it("returns 404 for a block owned by another learner", async () => {
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const block = await createBlock(learnerA.id, qual.topics[1].id);

    requireLearnerMock.mockResolvedValue({
      learnerId: learnerB.id,
      orgId: org.id,
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: block.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
