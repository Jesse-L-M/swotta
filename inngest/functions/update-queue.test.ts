import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateQueueFunction } from "./update-queue";
import { asTestable } from "../test-helpers";
import type { AttemptOutcome, BlockId } from "@/lib/types";

vi.mock("@/engine/review-queue", () => ({
  syncScheduledReviewQueue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  structuredLog: vi.fn(),
}));

import { syncScheduledReviewQueue } from "@/engine/review-queue";
import { db } from "@/lib/db";

const mockSyncScheduledReviewQueue = vi.mocked(syncScheduledReviewQueue);
const mockDb = vi.mocked(db);
const testable = asTestable(updateQueueFunction);

function makeAttempt(overrides?: Partial<AttemptOutcome>): AttemptOutcome {
  return {
    blockId: "block-1" as BlockId,
    score: 85,
    confidenceBefore: 0.6,
    confidenceAfter: 0.8,
    helpRequested: false,
    helpTiming: null,
    misconceptions: [],
    retentionOutcome: "remembered",
    durationMinutes: 15,
    rawInteraction: null,
    ...overrides,
  };
}

describe("scheduling/update-queue function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct function config", () => {
    expect(testable.opts.id).toBe("scheduling/update-queue");
    expect(testable.opts.triggers).toEqual([
      { event: "attempt.completed" },
    ]);
    expect(testable.opts.retries).toBe(3);
  });

  it("processes attempt outcome and updates review queue", async () => {
    const attempt = makeAttempt();
    const nextReviewAt = new Date("2026-04-01T00:00:00Z");

    // Mock block lookup
    (mockDb.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { learnerId: "learner-1", topicId: "topic-1" },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ nextReviewAt }]),
          }),
        }),
      });

    mockSyncScheduledReviewQueue.mockResolvedValue({
      action: "inserted",
      dueAt: nextReviewAt,
      fulfilledCount: 2,
    });

    const stepRun = vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => {
      return fn();
    });

    const result = await testable.fn(
      {
        event: {
          data: attempt,
          name: "attempt.completed" as const,
        },
        step: { run: stepRun },
      },
      undefined,
    );

    // Verify steps were called in order
    const stepNames = stepRun.mock.calls.map((c: unknown[]) => c[0]);
    expect(stepNames).toEqual([
      "lookup-block",
      "lookup-topic-state",
      "sync-review-queue",
    ]);

    expect(mockSyncScheduledReviewQueue).toHaveBeenCalledWith(
      {
        learnerId: "learner-1",
        topicId: "topic-1",
        dueAt: nextReviewAt,
      },
      mockDb
    );

    expect(result).toMatchObject({
      learnerId: "learner-1",
      topicId: "topic-1",
      queueAction: "inserted",
      nextReviewAt: nextReviewAt.toISOString(),
    });
  });

  it("throws when no next review date has been written yet", async () => {
    const attempt = makeAttempt();

    (mockDb.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { learnerId: "learner-1", topicId: "topic-1" },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ nextReviewAt: null }]),
          }),
        }),
      });

    const stepRun = vi.fn().mockImplementation(
      (_name: string, fn: () => Promise<unknown>) => fn()
    );

    await expect(
      testable.fn(
        {
          event: {
            data: attempt,
            name: "attempt.completed" as const,
          },
          step: { run: stepRun },
        },
        undefined,
      ),
    ).rejects.toThrow(
      "No next review date found for learner learner-1, topic topic-1"
    );
  });

  it("throws when block is not found", async () => {
    const attempt = makeAttempt();

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    await expect(
      testable.fn(
        {
          event: {
            data: attempt,
            name: "attempt.completed" as const,
          },
          step: { run: stepRun },
        },
        undefined,
      ),
    ).rejects.toThrow("Study block not found: block-1");
  });
});
