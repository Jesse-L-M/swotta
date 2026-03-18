import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateQueueFunction } from "./update-queue";
import { asTestable } from "../test-helpers";
import type { AttemptOutcome, BlockId, TopicId } from "@/lib/types";

vi.mock("@/engine/mastery", () => ({
  processAttemptOutcome: vi.fn(),
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

import { processAttemptOutcome } from "@/engine/mastery";
import { db } from "@/lib/db";

const mockProcessAttemptOutcome = vi.mocked(processAttemptOutcome);
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
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ learnerId: "learner-1" }]),
        }),
      }),
    });

    // Mock processAttemptOutcome — returns Date, but Inngest step serializes to string
    mockProcessAttemptOutcome.mockResolvedValue({
      masteryUpdate: {
        topicId: "topic-1" as TopicId,
        before: 0.4,
        after: 0.6,
      },
      nextReviewAt,
      newEaseFactor: 2.6,
      misconceptionEvents: [],
      confidenceEvent: null,
      retentionEvent: null,
      memoryCandidatesUpdated: 0,
    });

    // Mock update (fulfill)
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Mock insert
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
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
      "process-attempt-outcome",
      "fulfill-review-queue",
      "insert-review-queue-entry",
    ]);

    expect(mockProcessAttemptOutcome).toHaveBeenCalledWith(attempt, mockDb);

    expect(result).toMatchObject({
      masteryUpdate: {
        topicId: "topic-1",
        before: 0.4,
        after: 0.6,
      },
    });
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
