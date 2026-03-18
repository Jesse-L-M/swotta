import { describe, it, expect, vi, beforeEach } from "vitest";
import { rebuildPlansFunction } from "./rebuild-plans";
import { asTestable } from "../test-helpers";

vi.mock("@/engine/scheduler", () => ({
  buildWeeklyPlan: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    selectDistinct: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  structuredLog: vi.fn(),
}));

import { buildWeeklyPlan } from "@/engine/scheduler";
import { db } from "@/lib/db";

const mockBuildWeeklyPlan = vi.mocked(buildWeeklyPlan);
const mockDb = vi.mocked(db);
const testable = asTestable(rebuildPlansFunction);

describe("scheduling/rebuild-plans function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct function config", () => {
    expect(testable.opts.id).toBe("scheduling/rebuild-plans");
    expect(testable.opts.triggers).toEqual([
      { cron: "0 0 * * 1" },
    ]);
  });

  it("returns early when no active learners", async () => {
    (mockDb.selectDistinct as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined,
    );

    expect(result).toEqual({ processed: 0, plans: [] });
    expect(mockBuildWeeklyPlan).not.toHaveBeenCalled();
  });

  it("builds weekly plans for all active learners", async () => {
    (mockDb.selectDistinct as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { learnerId: "learner-1" },
          { learnerId: "learner-2" },
        ]),
      }),
    });

    mockBuildWeeklyPlan
      .mockResolvedValueOnce({ planId: "plan-1", blocks: [{ id: "b1" }, { id: "b2" }] as never[] })
      .mockResolvedValueOnce({ planId: "plan-2", blocks: [{ id: "b3" }] as never[] });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined,
    );

    expect(result).toEqual({
      processed: 2,
      plans: [
        { learnerId: "learner-1", planId: "plan-1", blockCount: 2 },
        { learnerId: "learner-2", planId: "plan-2", blockCount: 1 },
      ],
    });

    expect(mockBuildWeeklyPlan).toHaveBeenCalledTimes(2);

    const stepNames = stepRun.mock.calls.map((c: unknown[]) => c[0]);
    expect(stepNames).toEqual([
      "get-active-learners",
      "rebuild-plan-learner-1",
      "rebuild-plan-learner-2",
    ]);
  });
});
