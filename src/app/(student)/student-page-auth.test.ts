import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLearner,
  createTestMembership,
  createTestOrg,
  createTestQualification,
  createTestUser,
  enrollLearnerInQualification,
  resetFixtureCounter,
} from "@/test/fixtures";

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

import { requireStudentPageAuth } from "./student-page-auth";

describe("requireStudentPageAuth", () => {
  beforeEach(() => {
    resetFixtureCounter();
    getAuthContextMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects unauthenticated users back to login with their original target", async () => {
    getAuthContextMock.mockResolvedValue(null);

    await expect(
      requireStudentPageAuth("/session/test-block")
    ).rejects.toThrow("REDIRECT:/login?redirect=%2Fsession%2Ftest-block");

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?redirect=%2Fsession%2Ftest-block"
    );
  });

  it("allows learners with a learner profile through", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    getAuthContextMock.mockResolvedValue({
      user: { id: learner.userId },
      roles: [{ orgId: org.id, role: "learner" }],
    });

    await expect(
      requireStudentPageAuth("/diagnostic?qualificationVersionId=test", {
        allowPendingDiagnostic: true,
      })
    ).resolves.toMatchObject({
      learner: {
        id: learner.id,
        displayName: learner.displayName,
      },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects learners with a pending diagnostic to the next diagnostic route", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qualification.qualificationVersionId
    );

    getAuthContextMock.mockResolvedValue({
      user: { id: learner.userId },
      roles: [{ orgId: org.id, role: "learner" }],
    });

    await expect(requireStudentPageAuth("/settings")).rejects.toThrow(
      `REDIRECT:/diagnostic?qualificationVersionId=${qualification.qualificationVersionId}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `/diagnostic?qualificationVersionId=${qualification.qualificationVersionId}`
    );
  });

  it("allows the diagnostic page itself to bypass the pending redirect", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qualification.qualificationVersionId
    );

    getAuthContextMock.mockResolvedValue({
      user: { id: learner.userId },
      roles: [{ orgId: org.id, role: "learner" }],
    });

    await expect(
      requireStudentPageAuth(
        `/diagnostic?qualificationVersionId=${qualification.qualificationVersionId}`,
        { allowPendingDiagnostic: true }
      )
    ).resolves.toMatchObject({
      learner: {
        id: learner.id,
      },
    });

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects guardian accounts away from learner-only pages", async () => {
    const org = await createTestOrg();
    const guardian = await createTestUser();
    await createTestMembership(guardian.id, org.id, "guardian");

    getAuthContextMock.mockResolvedValue({
      user: { id: guardian.id },
      roles: [{ orgId: org.id, role: "guardian" }],
    });

    await expect(requireStudentPageAuth("/session/test-block")).rejects.toThrow(
      "REDIRECT:/parent/dashboard"
    );

    expect(redirectMock).toHaveBeenCalledWith("/parent/dashboard");
  });
});
