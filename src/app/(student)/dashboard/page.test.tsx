import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireStudentPageAuthMock,
  loadQualificationsMock,
  loadDashboardStatsMock,
  loadMasteryTopicsMock,
  loadTodayQueueMock,
} = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
  loadQualificationsMock: vi.fn(),
  loadDashboardStatsMock: vi.fn(),
  loadMasteryTopicsMock: vi.fn(),
  loadTodayQueueMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("@/components/dashboard/data", () => ({
  loadQualifications: loadQualificationsMock,
  loadDashboardStats: loadDashboardStatsMock,
  loadMasteryTopics: loadMasteryTopicsMock,
  loadTodayQueue: loadTodayQueueMock,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadQualificationsMock.mockResolvedValue([]);
    loadDashboardStatsMock.mockResolvedValue({
      totalSessions: 0,
      totalStudyMinutes: 0,
      averageMastery: 0,
      topicsStudied: 0,
      topicsTotal: 0,
      currentStreak: 0,
    });
    loadMasteryTopicsMock.mockResolvedValue([]);
    loadTodayQueueMock.mockResolvedValue([]);
  });

  it("uses the shared student guard for pending diagnostic gating", async () => {
    requireStudentPageAuthMock.mockResolvedValue({
      learner: {
        id: "learner-1",
        displayName: "Learner",
        yearGroup: 10,
      },
    });

    await DashboardPage();

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith("/dashboard");
  });
});
