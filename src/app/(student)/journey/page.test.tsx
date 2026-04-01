import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireStudentPageAuthMock,
  loadQualificationsMock,
  loadJourneyDataMock,
  loadTodayQueueMock,
} = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
  loadQualificationsMock: vi.fn(),
  loadJourneyDataMock: vi.fn(),
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
  loadTodayQueue: loadTodayQueueMock,
}));

vi.mock("@/components/journey/data", () => ({
  loadJourneyData: loadJourneyDataMock,
}));

import JourneyPage from "./page";

describe("JourneyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadQualificationsMock.mockResolvedValue([]);
    loadTodayQueueMock.mockResolvedValue([]);
    loadJourneyDataMock.mockResolvedValue({
      stats: {
        sessionsCompleted: 0,
        totalStudyMinutes: 0,
        sessionsThisWeek: 0,
        studyMinutesThisWeek: 0,
        lastSessionAt: null,
        misconceptionsTotal: 0,
        misconceptionsConquered: 0,
        specCoveragePercent: 0,
        topicsCovered: 0,
        totalTopics: 0,
      },
      milestones: [],
      conquered: [],
      active: [],
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
