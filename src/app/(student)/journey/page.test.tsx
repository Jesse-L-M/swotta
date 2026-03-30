import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireStudentPageAuthMock,
  loadQualificationsMock,
  loadJourneyDataMock,
} = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
  loadQualificationsMock: vi.fn(),
  loadJourneyDataMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("@/components/dashboard/data", () => ({
  loadQualifications: loadQualificationsMock,
}));

vi.mock("@/components/journey/data", () => ({
  loadJourneyData: loadJourneyDataMock,
}));

import JourneyPage from "./page";

describe("JourneyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadQualificationsMock.mockResolvedValue([]);
    loadJourneyDataMock.mockResolvedValue({
      stats: {
        sessionsCompleted: 0,
        topicsMastered: 0,
        misconceptionsResolved: 0,
        longestStreak: 0,
      },
      milestones: [],
      misconceptions: [],
      recentSessions: [],
    });
  });

  it("uses the shared student guard for pending diagnostic gating", async () => {
    requireStudentPageAuthMock.mockResolvedValue({
      learner: {
        id: "learner-1",
        displayName: "Learner",
        yearGroup: 10,
      },
    });

    await JourneyPage();

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith("/journey");
  });
});
