import { describe, it, expect, vi, beforeEach } from "vitest";
import { decayCheckFunction } from "./decay-check";
import { asTestable } from "../test-helpers";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  structuredLog: vi.fn(),
}));

import { db } from "@/lib/db";

const mockDb = vi.mocked(db);
const testable = asTestable(decayCheckFunction);

describe("mastery/decay-check function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct function config", () => {
    expect(testable.opts.id).toBe("mastery/decay-check");
    expect(testable.opts.triggers).toEqual([
      { cron: "0 0 * * *" },
    ]);
  });

  it("returns early when no overdue topics", async () => {
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined,
    );

    expect(result).toEqual({ overdueCount: 0, queueEntriesCreated: 0 });
    expect(stepRun).toHaveBeenCalledTimes(1);
    expect(stepRun).toHaveBeenCalledWith("scan-overdue-topics", expect.any(Function));
  });

  it("inserts decay queue entries for overdue topics", async () => {
    const yesterday = new Date("2026-03-17T00:00:00Z");

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            learnerId: "learner-1",
            topicId: "topic-1",
            nextReviewAt: yesterday,
            masteryLevel: "0.300",
          },
          {
            learnerId: "learner-1",
            topicId: "topic-2",
            nextReviewAt: yesterday,
            masteryLevel: "0.700",
          },
          {
            learnerId: "learner-2",
            topicId: "topic-3",
            nextReviewAt: yesterday,
            masteryLevel: "0.000",
          },
        ]),
      }),
    });

    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    const result = await testable.fn(
      { step: { run: stepRun } },
      undefined,
    );

    expect(result).toEqual({ overdueCount: 3, queueEntriesCreated: 3 });

    const stepNames = stepRun.mock.calls.map((c: unknown[]) => c[0]);
    expect(stepNames).toEqual([
      "scan-overdue-topics",
      "insert-decay-queue-entries",
    ]);
  });

  it("calculates priority inversely to mastery level", async () => {
    const yesterday = new Date("2026-03-17T00:00:00Z");

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            learnerId: "learner-1",
            topicId: "topic-high-mastery",
            nextReviewAt: yesterday,
            masteryLevel: "0.900",
          },
          {
            learnerId: "learner-1",
            topicId: "topic-low-mastery",
            nextReviewAt: yesterday,
            masteryLevel: "0.100",
          },
        ]),
      }),
    });

    let insertedValues: Array<{ priority: number; topicId: string }> = [];
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockImplementation((vals: Array<{ priority: number; topicId: string }>) => {
        insertedValues = vals;
        return Promise.resolve();
      }),
    });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    await testable.fn(
      { step: { run: stepRun } },
      undefined,
    );

    const highMastery = insertedValues.find((v) => v.topicId === "topic-high-mastery");
    const lowMastery = insertedValues.find((v) => v.topicId === "topic-low-mastery");

    // Lower mastery = higher priority (lower number)
    expect(highMastery?.priority).toBe(1); // 10 - 0.9*10 = 1
    expect(lowMastery?.priority).toBe(9); // 10 - 0.1*10 = 9
  });
});
