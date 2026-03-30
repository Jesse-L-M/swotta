import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthContextMock, loadLearnerByUserIdMock, getNextPendingDiagnosticPathMock, redirectMock } =
  vi.hoisted(() => ({
    getAuthContextMock: vi.fn(),
    loadLearnerByUserIdMock: vi.fn(),
    getNextPendingDiagnosticPathMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
  }));

vi.mock("@/lib/auth", () => ({
  getAuthContext: getAuthContextMock,
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/components/dashboard/data", () => ({
  loadLearnerByUserId: loadLearnerByUserIdMock,
  loadQualifications: vi.fn(),
  loadDashboardStats: vi.fn(),
  loadMasteryTopics: vi.fn(),
  loadTodayQueue: vi.fn(),
}));

vi.mock("@/lib/pending-diagnostics", () => ({
  getNextPendingDiagnosticPath: getNextPendingDiagnosticPathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects learners to their next pending diagnostic before loading the dashboard", async () => {
    getAuthContextMock.mockResolvedValue({
      user: { id: "user-1" },
      roles: [{ orgId: "org-1", role: "learner" }],
    });
    loadLearnerByUserIdMock.mockResolvedValue({
      id: "learner-1",
      displayName: "Learner",
      yearGroup: 10,
    });
    getNextPendingDiagnosticPathMock.mockResolvedValue(
      "/diagnostic?qualificationVersionId=qual-1"
    );

    await expect(DashboardPage()).rejects.toThrow(
      "REDIRECT:/diagnostic?qualificationVersionId=qual-1"
    );

    expect(redirectMock).toHaveBeenCalledWith(
      "/diagnostic?qualificationVersionId=qual-1"
    );
  });
});
