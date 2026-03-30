import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLearner, createTestOrg, createTestQualification } from "@/test/fixtures";

const { getAuthContextMock, redirectMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/db", async () => {
  const { getTestDb } = await import("@/test/setup");
  return { db: getTestDb() };
});

vi.mock("@/lib/auth", () => ({
  getAuthContext: getAuthContextMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { completeOnboarding } from "./actions";

describe("completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects learners to the first pending diagnostic after enrollment", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();

    getAuthContextMock.mockResolvedValue({
      user: { id: learner.userId },
      roles: [{ orgId: org.id, role: "learner" }],
    });

    await expect(
      completeOnboarding([
        {
          qualificationVersionId: qualification.qualificationVersionId,
          targetGrade: "7",
          examDate: "2026-06-15",
        },
      ])
    ).rejects.toThrow(
      `REDIRECT:/diagnostic?qualificationVersionId=${qualification.qualificationVersionId}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `/diagnostic?qualificationVersionId=${qualification.qualificationVersionId}`
    );
  });
});
