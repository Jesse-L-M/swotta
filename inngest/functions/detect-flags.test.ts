import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectFlagsCron } from "./detect-flags";
import { asTestable } from "../test-helpers";

const {
  selectDistinctWhereMock,
  detectFlagsMock,
  mapFlagTypeToEnumMock,
  upsertUnresolvedSafetyFlagMock,
} = vi.hoisted(() => ({
  selectDistinctWhereMock: vi.fn(),
  detectFlagsMock: vi.fn(),
  mapFlagTypeToEnumMock: vi.fn((type: string) => type),
  upsertUnresolvedSafetyFlagMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({
        where: selectDistinctWhereMock,
      })),
    })),
  },
}));

vi.mock("@/engine/reporting", () => ({
  detectFlags: detectFlagsMock,
  mapFlagTypeToEnum: mapFlagTypeToEnumMock,
}));

vi.mock("@/engine/safety-flags", () => ({
  upsertUnresolvedSafetyFlag: upsertUnresolvedSafetyFlagMock,
}));

const testable = asTestable(detectFlagsCron);

describe("reporting/detect-flags function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapFlagTypeToEnumMock.mockImplementation((type: string) => type);
  });

  it("has correct function config", () => {
    expect(testable.opts.id).toBe("reporting/detect-flags");
    expect(testable.opts.triggers).toEqual([{ cron: "0 6 * * *" }]);
  });

  it("returns early when there are no active learners", async () => {
    selectDistinctWhereMock.mockResolvedValue([]);

    const stepRun = vi.fn().mockImplementation(
      (_name: string, fn: () => Promise<unknown>) => fn()
    );

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined
    );

    expect(result).toEqual({
      learnersScanned: 0,
      flagsCreated: 0,
      flagsUpdated: 0,
    });
    expect(detectFlagsMock).not.toHaveBeenCalled();
  });

  it("updates existing unresolved flags instead of inserting duplicates", async () => {
    selectDistinctWhereMock.mockResolvedValue([{ learnerId: "learner-1" }]);
    detectFlagsMock.mockResolvedValue([
      {
        type: "avoidance",
        severity: "high",
        description: "Persistent avoidance detected.",
        evidence: { topics: ["topic-1"] },
      },
      {
        type: "disengagement",
        severity: "medium",
        description: "Engagement is declining.",
        evidence: { gapTrend: 4 },
      },
    ]);
    upsertUnresolvedSafetyFlagMock
      .mockResolvedValueOnce({ id: "flag-1", action: "updated" })
      .mockResolvedValueOnce({ id: "flag-2", action: "created" });

    const stepRun = vi.fn().mockImplementation(
      (_name: string, fn: () => Promise<unknown>) => fn()
    );

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined
    );

    expect(upsertUnresolvedSafetyFlagMock).toHaveBeenCalledTimes(2);
    expect(upsertUnresolvedSafetyFlagMock).toHaveBeenLastCalledWith(
      expect.anything(),
      {
      learnerId: "learner-1",
      flagType: "disengagement",
      severity: "medium",
      description: "Engagement is declining.",
      evidence: { gapTrend: 4 },
      }
    );
    expect(result).toEqual({
      learnersScanned: 1,
      flagsCreated: 1,
      flagsUpdated: 1,
    });
  });
});
