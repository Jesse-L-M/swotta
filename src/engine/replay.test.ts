import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import {
  studySessions,
  studyBlocks,
  blockAttempts,
  confidenceEvents,
  misconceptionEvents,
  learnerTopicState,
} from "@/db/schema";
import type { LearnerId, SessionId, TopicId } from "@/lib/types";
import {
  getShareSecret,
  generateShareToken,
  verifyShareToken,
  buildWhatYouCovered,
  buildWhatYouNailed,
  buildWhatTrippedYouUp,
  buildWhatsNext,
  formatRelativeTime,
  generateReplaySummary,
  getRecentSessionCards,
  getSharedReplay,
} from "./replay";

beforeEach(() => {
  resetFixtureCounter();
});

const TEST_SECRET = "test-secret-for-replay";

// --- Pure function tests: Share secret ---

describe("getShareSecret", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the env var when set", () => {
    process.env = { ...originalEnv, SESSION_SHARE_SECRET: "my-secret" };
    expect(getShareSecret()).toBe("my-secret");
  });

  it("returns dev fallback when env var is not set and not production", () => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.SESSION_SHARE_SECRET;
    expect(getShareSecret()).toBe("dev-share-secret");
  });

  it("throws in production when env var is not set", () => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    delete process.env.SESSION_SHARE_SECRET;
    expect(() => getShareSecret()).toThrow("SESSION_SHARE_SECRET");
  });
});

// --- Pure function tests: Share tokens ---

describe("generateShareToken", () => {
  it("returns a token and expiration date", () => {
    const result = generateShareToken("session-123", TEST_SECRET);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("sets expiration ~30 days in the future", () => {
    const before = Date.now();
    const result = generateShareToken("session-123", TEST_SECRET);
    const after = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + thirtyDaysMs
    );
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
      after + thirtyDaysMs
    );
  });

  it("produces different tokens for different session IDs", () => {
    const a = generateShareToken("session-a", TEST_SECRET);
    const b = generateShareToken("session-b", TEST_SECRET);
    expect(a.token).not.toBe(b.token);
  });

  it("produces base64url-safe tokens", () => {
    const result = generateShareToken("session-123", TEST_SECRET);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("verifyShareToken", () => {
  it("round-trips: generate then verify", () => {
    const { token } = generateShareToken("session-123", TEST_SECRET);
    const result = verifyShareToken(token, TEST_SECRET);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("session-123");
    expect(result!.expiresAt).toBeInstanceOf(Date);
  });

  it("returns null for empty string", () => {
    expect(verifyShareToken("", TEST_SECRET)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(verifyShareToken("not-a-real-token", TEST_SECRET)).toBeNull();
  });

  it("returns null for tampered token", () => {
    const { token } = generateShareToken("session-123", TEST_SECRET);
    const tampered = token.slice(0, -4) + "XXXX";
    expect(verifyShareToken(tampered, TEST_SECRET)).toBeNull();
  });

  it("returns null for wrong secret", () => {
    const { token } = generateShareToken("session-123", TEST_SECRET);
    expect(verifyShareToken(token, "wrong-secret")).toBeNull();
  });

  it("returns null for expired token", () => {
    // Manually craft an expired token
    const { createHmac } = require("crypto") as typeof import("crypto");
    const pastMs = Date.now() - 1000;
    const payload = `session-123::${pastMs}`;
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("hex");
    const token = Buffer.from(`${payload}::${sig}`).toString("base64url");
    expect(verifyShareToken(token, TEST_SECRET)).toBeNull();
  });

  it("returns null for malformed payload (missing parts)", () => {
    const token = Buffer.from("only-one-part").toString("base64url");
    expect(verifyShareToken(token, TEST_SECRET)).toBeNull();
  });

  it("returns null for non-numeric timestamp", () => {
    const { createHmac } = require("crypto") as typeof import("crypto");
    const payload = "session-123::not-a-number";
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("hex");
    const token = Buffer.from(`${payload}::${sig}`).toString("base64url");
    expect(verifyShareToken(token, TEST_SECRET)).toBeNull();
  });
});

// --- Pure function tests: Summary builders ---

describe("buildWhatYouCovered", () => {
  it("includes topic names", () => {
    const result = buildWhatYouCovered(
      [{ topicName: "Cell Biology" }, { topicName: "Genetics" }],
      null,
      null
    );
    expect(result).toContainEqual("Topics: Cell Biology, Genetics");
  });

  it("includes block type label", () => {
    const result = buildWhatYouCovered([], "Retrieval Drill", null);
    expect(result).toContainEqual("Activity type: Retrieval Drill");
  });

  it("includes duration", () => {
    const result = buildWhatYouCovered([], null, 15);
    expect(result).toContainEqual("Duration: 15 minutes");
  });

  it("handles singular minute", () => {
    const result = buildWhatYouCovered([], null, 1);
    expect(result).toContainEqual("Duration: 1 minute");
  });

  it("returns empty array when no data", () => {
    const result = buildWhatYouCovered([], null, null);
    expect(result).toHaveLength(0);
  });

  it("skips zero duration", () => {
    const result = buildWhatYouCovered([], null, 0);
    expect(result).toHaveLength(0);
  });

  it("includes all three when all provided", () => {
    const result = buildWhatYouCovered(
      [{ topicName: "Ecology" }],
      "Explanation",
      20
    );
    expect(result).toHaveLength(3);
  });
});

describe("buildWhatYouNailed", () => {
  it("returns excellent message for score >= 90", () => {
    const result = buildWhatYouNailed(95, false, 0);
    expect(result.some((s) => s.includes("Excellent"))).toBe(true);
  });

  it("returns good message for score >= 70", () => {
    const result = buildWhatYouNailed(75, false, 0);
    expect(result.some((s) => s.includes("Good understanding"))).toBe(true);
  });

  it("returns solid effort for score >= 50", () => {
    const result = buildWhatYouNailed(55, false, 0);
    expect(result.some((s) => s.includes("Solid effort"))).toBe(true);
  });

  it("returns empty for score < 50", () => {
    const result = buildWhatYouNailed(30, false, 0);
    expect(result).toHaveLength(0);
  });

  it("returns empty for null score", () => {
    const result = buildWhatYouNailed(null, false, 0);
    expect(result).toHaveLength(0);
  });

  it("includes independent work when no help and score >= 60", () => {
    const result = buildWhatYouNailed(65, false, 0);
    expect(result.some((s) => s.includes("independently"))).toBe(true);
  });

  it("excludes independent work when help was requested", () => {
    const result = buildWhatYouNailed(80, true, 0);
    expect(result.some((s) => s.includes("independently"))).toBe(false);
  });

  it("includes clean understanding when no misconceptions and score >= 50", () => {
    const result = buildWhatYouNailed(60, false, 0);
    expect(result.some((s) => s.includes("No misconceptions"))).toBe(true);
  });

  it("excludes clean understanding when misconceptions detected", () => {
    const result = buildWhatYouNailed(80, false, 2);
    expect(result.some((s) => s.includes("No misconceptions"))).toBe(false);
  });
});

describe("buildWhatTrippedYouUp", () => {
  it("includes misconception descriptions", () => {
    const result = buildWhatTrippedYouUp(
      [{ description: "Confuses osmosis with diffusion", severity: 2 }],
      80,
      false
    );
    expect(result).toContainEqual("Confuses osmosis with diffusion");
  });

  it("includes low score message when score < 50", () => {
    const result = buildWhatTrippedYouUp([], 40, false);
    expect(result.some((s) => s.includes("below 50%"))).toBe(true);
  });

  it("excludes low score message when score >= 50", () => {
    const result = buildWhatTrippedYouUp([], 60, false);
    expect(result.some((s) => s.includes("below 50%"))).toBe(false);
  });

  it("includes help message when help was requested", () => {
    const result = buildWhatTrippedYouUp([], 70, true);
    expect(result.some((s) => s.includes("Needed help"))).toBe(true);
  });

  it("returns empty when nothing tripped up", () => {
    const result = buildWhatTrippedYouUp([], 80, false);
    expect(result).toHaveLength(0);
  });

  it("includes multiple misconceptions", () => {
    const result = buildWhatTrippedYouUp(
      [
        { description: "Error A", severity: 1 },
        { description: "Error B", severity: 3 },
      ],
      80,
      false
    );
    expect(result).toContainEqual("Error A");
    expect(result).toContainEqual("Error B");
  });
});

describe("buildWhatsNext", () => {
  it("suggests review for low score", () => {
    const result = buildWhatsNext(30, 0, "completed");
    expect(result.some((s) => s.includes("Review the material"))).toBe(true);
  });

  it("suggests more practice for mid score", () => {
    const result = buildWhatsNext(60, 0, "completed");
    expect(result.some((s) => s.includes("Practice more"))).toBe(true);
  });

  it("suggests moving on for high score", () => {
    const result = buildWhatsNext(95, 0, "completed");
    expect(result.some((s) => s.includes("Move on"))).toBe(true);
  });

  it("suggests keeping going for score 70-89", () => {
    const result = buildWhatsNext(80, 0, "completed");
    expect(result.some((s) => s.includes("good progress"))).toBe(true);
  });

  it("mentions misconception review when misconceptions present", () => {
    const result = buildWhatsNext(70, 2, "completed");
    expect(result.some((s) => s.includes("misconception review"))).toBe(true);
  });

  it("returns try again for abandoned sessions", () => {
    const result = buildWhatsNext(null, 0, "abandoned");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("wasn't completed");
  });

  it("returns try again for timed-out sessions", () => {
    const result = buildWhatsNext(null, 0, "timeout");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("wasn't completed");
  });

  it("returns fallback for completed session with null score", () => {
    const result = buildWhatsNext(null, 0, "completed");
    expect(result).toContainEqual("Continue with your study plan");
  });
});

describe("formatRelativeTime", () => {
  it("returns 'Just now' for very recent dates", () => {
    expect(formatRelativeTime(new Date())).toBe("Just now");
  });

  it("returns minutes for < 1 hour", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(formatRelativeTime(thirtyMinAgo)).toBe("30m ago");
  });

  it("returns hours for < 24 hours", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(formatRelativeTime(fiveHoursAgo)).toBe("5h ago");
  });

  it("returns days for < 7 days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("returns formatted date for >= 7 days", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(tenDaysAgo);
    // Should contain day number and short month
    expect(result).toMatch(/\d{1,2}\s\w{3}/);
  });
});

// --- Integration tests ---

describe("generateReplaySummary", () => {
  async function setupTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );

    const topicA = qual.topics[1]; // Topic 1.1

    // Create learner topic state
    await db
      .insert(learnerTopicState)
      .values({ learnerId: learner.id, topicId: topicA.id });

    return { db, learner, qual, topicA };
  }

  async function createSessionWithBlock(
    db: ReturnType<typeof getTestDb>,
    learnerId: string,
    topicId: string,
    overrides?: {
      status?: string;
      summary?: string;
      totalDurationMinutes?: number;
      score?: string;
      helpRequested?: boolean;
      misconceptionsDetected?: number;
      confidenceBefore?: string;
      confidenceAfter?: string;
    }
  ) {
    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId,
        topicId,
        blockType: "retrieval_drill",
        durationMinutes: 15,
      })
      .returning();

    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId,
        blockId: block.id,
        status: (overrides?.status ?? "completed") as
          | "active"
          | "completed"
          | "abandoned"
          | "timeout",
        summary: overrides?.summary ?? "Session went well",
        topicsCovered: [topicId],
        totalDurationMinutes: overrides?.totalDurationMinutes ?? 12,
      })
      .returning();

    const [attempt] = await db
      .insert(blockAttempts)
      .values({
        blockId: block.id,
        completedAt: new Date(),
        score: overrides?.score ?? "85.00",
        helpRequested: overrides?.helpRequested ?? false,
        misconceptionsDetected: overrides?.misconceptionsDetected ?? 0,
        confidenceBefore: overrides?.confidenceBefore ?? null,
        confidenceAfter: overrides?.confidenceAfter ?? null,
      })
      .returning();

    return { block, session, attempt };
  }

  it("returns null for non-existent session", async () => {
    const db = getTestDb();
    const result = await generateReplaySummary(
      db,
      "00000000-0000-0000-0000-000000000000" as SessionId
    );
    expect(result).toBeNull();
  });

  it("returns summary for a completed session", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(session.id);
    expect(result!.learnerId).toBe(learner.id);
    expect(result!.status).toBe("completed");
    expect(result!.score).toBe(85);
    expect(result!.blockType).toBe("retrieval_drill");
    expect(result!.blockTypeLabel).toBe("Retrieval Drill");
    expect(result!.summary).toBe("Session went well");
    expect(result!.topicsCovered).toHaveLength(1);
    expect(result!.topicsCovered[0].topicName).toBe("Topic 1.1");
    expect(result!.totalDurationMinutes).toBe(12);
  });

  it("populates whatYouCovered section", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.whatYouCovered.length).toBeGreaterThan(0);
    expect(result!.whatYouCovered.some((s) => s.includes("Topic 1.1"))).toBe(
      true
    );
    expect(
      result!.whatYouCovered.some((s) => s.includes("Retrieval Drill"))
    ).toBe(true);
  });

  it("populates whatYouNailed for high score", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id,
      { score: "92.00" }
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.whatYouNailed.some((s) => s.includes("Excellent"))).toBe(
      true
    );
  });

  it("populates whatTrippedYouUp with misconceptions", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session, attempt } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id,
      { misconceptionsDetected: 1 }
    );

    await db.insert(misconceptionEvents).values({
      learnerId: learner.id,
      topicId: topicA.id,
      blockAttemptId: attempt.id,
      description: "Confuses mitosis with meiosis",
      severity: 2,
    });

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.misconceptions).toHaveLength(1);
    expect(result!.misconceptions[0].description).toBe(
      "Confuses mitosis with meiosis"
    );
    expect(
      result!.whatTrippedYouUp.some((s) =>
        s.includes("Confuses mitosis with meiosis")
      )
    ).toBe(true);
  });

  it("populates whatsNext for abandoned session", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id,
      { status: "abandoned", score: null as unknown as string }
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(
      result!.whatsNext.some((s) => s.includes("wasn't completed"))
    ).toBe(true);
  });

  it("includes calibration feedback when confidence events exist", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id
    );

    // Insert confidence events to trigger calibration feedback
    await db.insert(confidenceEvents).values({
      learnerId: learner.id,
      topicId: topicA.id,
      selfRated: "0.300",
      actual: "0.800",
      delta: "-0.500",
    });

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.calibrationFeedback).not.toBeNull();
    expect(result!.calibrationFeedback).toContain("underestimate");
  });

  it("returns null calibrationFeedback when no confidence events", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.calibrationFeedback).toBeNull();
  });

  it("handles session without a block (ad-hoc)", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: null,
        status: "completed",
        topicsCovered: [topicA.id],
        totalDurationMinutes: 10,
      })
      .returning();

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result).not.toBeNull();
    expect(result!.blockType).toBeNull();
    expect(result!.blockTypeLabel).toBeNull();
    expect(result!.score).toBeNull();
  });

  it("handles session with no topics covered", async () => {
    const { db, learner } = await setupTestData();

    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        status: "completed",
        topicsCovered: [],
        totalDurationMinutes: 5,
      })
      .returning();

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result).not.toBeNull();
    expect(result!.topicsCovered).toHaveLength(0);
    expect(result!.calibrationFeedback).toBeNull();
  });

  it("reads confidenceBefore and confidenceAfter from attempt", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id,
      { confidenceBefore: "0.400", confidenceAfter: "0.800" }
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.confidenceBefore).toBe(0.4);
    expect(result!.confidenceAfter).toBe(0.8);
  });

  it("reads helpRequested from attempt", async () => {
    const { db, learner, topicA } = await setupTestData();
    const { session } = await createSessionWithBlock(
      db,
      learner.id,
      topicA.id,
      { helpRequested: true }
    );

    const result = await generateReplaySummary(
      db,
      session.id as SessionId
    );

    expect(result!.helpRequested).toBe(true);
    expect(
      result!.whatTrippedYouUp.some((s) => s.includes("Needed help"))
    ).toBe(true);
  });

  it("uses the attempt linked to the requested session when a block is retried", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
      })
      .returning();

    const firstStartedAt = new Date("2026-03-19T10:00:00.000Z");
    const secondStartedAt = new Date("2026-03-20T10:00:00.000Z");

    const [firstSession] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        startedAt: firstStartedAt,
        topicsCovered: [topicA.id],
        totalDurationMinutes: 12,
      })
      .returning();

    const [secondSession] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        startedAt: secondStartedAt,
        topicsCovered: [topicA.id],
        totalDurationMinutes: 8,
      })
      .returning();

    await db.insert(blockAttempts).values({
      blockId: block.id,
      startedAt: firstStartedAt,
      completedAt: new Date("2026-03-19T10:12:00.000Z"),
      score: "45.00",
      rawInteraction: {
        sessionId: firstSession.id,
        extractedOutcome: {
          misconceptions: [
            {
              description: "Confuses osmosis with diffusion",
              severity: 2,
            },
          ],
        },
      },
    });

    await db.insert(blockAttempts).values({
      blockId: block.id,
      startedAt: secondStartedAt,
      completedAt: new Date("2026-03-20T10:08:00.000Z"),
      score: "91.00",
      rawInteraction: {
        sessionId: secondSession.id,
      },
    });

    const firstReplay = await generateReplaySummary(
      db,
      firstSession.id as SessionId
    );
    const secondReplay = await generateReplaySummary(
      db,
      secondSession.id as SessionId
    );

    expect(firstReplay!.score).toBe(45);
    expect(firstReplay!.misconceptions).toEqual([
      {
        description: "Confuses osmosis with diffusion",
        severity: 2,
      },
    ]);
    expect(secondReplay!.score).toBe(91);
  });
});

describe("getRecentSessionCards", () => {
  async function setupTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    const topicA = qual.topics[1];

    return { db, learner, qual, topicA };
  }

  it("returns empty array when no sessions exist", async () => {
    const { db, learner } = await setupTestData();

    const cards = await getRecentSessionCards(
      db,
      learner.id as LearnerId
    );

    expect(cards).toHaveLength(0);
  });

  it("returns session cards ordered by most recent first", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [block1] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
      })
      .returning();

    const [block2] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "explanation",
        durationMinutes: 15,
      })
      .returning();

    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const later = new Date(Date.now() - 1 * 60 * 60 * 1000);

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: block1.id,
      status: "completed",
      startedAt: earlier,
      topicsCovered: [topicA.id],
      totalDurationMinutes: 10,
    });

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: block2.id,
      status: "completed",
      startedAt: later,
      topicsCovered: [topicA.id],
      totalDurationMinutes: 15,
    });

    const cards = await getRecentSessionCards(
      db,
      learner.id as LearnerId
    );

    expect(cards).toHaveLength(2);
    // Most recent first
    expect(cards[0].startedAt.getTime()).toBeGreaterThan(
      cards[1].startedAt.getTime()
    );
  });

  it("respects the limit parameter", async () => {
    const { db, learner, topicA } = await setupTestData();

    for (let i = 0; i < 5; i++) {
      const [block] = await db
        .insert(studyBlocks)
        .values({
          learnerId: learner.id,
          topicId: topicA.id,
          blockType: "retrieval_drill",
          durationMinutes: 10,
        })
        .returning();

      await db.insert(studySessions).values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        topicsCovered: [topicA.id],
        totalDurationMinutes: 10,
      });
    }

    const cards = await getRecentSessionCards(
      db,
      learner.id as LearnerId,
      3
    );

    expect(cards).toHaveLength(3);
  });

  it("populates topic name and block type", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "explanation",
        durationMinutes: 15,
      })
      .returning();

    await db.insert(blockAttempts).values({
      blockId: block.id,
      score: "78.50",
    });

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: block.id,
      status: "completed",
      topicsCovered: [topicA.id],
      totalDurationMinutes: 15,
      summary: "Good work on this topic",
    });

    const cards = await getRecentSessionCards(
      db,
      learner.id as LearnerId
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].topicName).toBe("Topic 1.1");
    expect(cards[0].blockType).toBe("explanation");
    expect(cards[0].blockTypeLabel).toBe("Explanation");
    expect(cards[0].score).toBe(78.5);
    expect(cards[0].summary).toBe("Good work on this topic");
  });

  it("does not return sessions from other learners", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicA = qual.topics[1];

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learnerA.id,
        topicId: topicA.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
      })
      .returning();

    await db.insert(studySessions).values({
      learnerId: learnerA.id,
      blockId: block.id,
      status: "completed",
      topicsCovered: [topicA.id],
    });

    const cards = await getRecentSessionCards(
      db,
      learnerB.id as LearnerId
    );

    expect(cards).toHaveLength(0);
  });

  it("handles session with no block (ad-hoc)", async () => {
    const { db, learner, topicA } = await setupTestData();

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: null,
      status: "completed",
      topicsCovered: [topicA.id],
      totalDurationMinutes: 8,
    });

    const cards = await getRecentSessionCards(
      db,
      learner.id as LearnerId
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].blockType).toBeNull();
    expect(cards[0].blockTypeLabel).toBeNull();
    expect(cards[0].score).toBeNull();
    expect(cards[0].topicName).toBe("Topic 1.1");
  });

  it("uses the attempt linked to each session when the same block is retried", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
      })
      .returning();

    const firstStartedAt = new Date("2026-03-18T09:00:00.000Z");
    const secondStartedAt = new Date("2026-03-19T09:00:00.000Z");

    const [firstSession] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        startedAt: firstStartedAt,
        topicsCovered: [topicA.id],
      })
      .returning();

    const [secondSession] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        startedAt: secondStartedAt,
        topicsCovered: [topicA.id],
      })
      .returning();

    await db.insert(blockAttempts).values({
      blockId: block.id,
      startedAt: firstStartedAt,
      score: "58.00",
      rawInteraction: {
        sessionId: firstSession.id,
      },
    });

    await db.insert(blockAttempts).values({
      blockId: block.id,
      startedAt: secondStartedAt,
      score: "87.00",
      rawInteraction: {
        sessionId: secondSession.id,
      },
    });

    const cards = await getRecentSessionCards(db, learner.id as LearnerId);

    expect(cards).toHaveLength(2);
    expect(cards[0].sessionId).toBe(secondSession.id);
    expect(cards[0].score).toBe(87);
    expect(cards[1].sessionId).toBe(firstSession.id);
    expect(cards[1].score).toBe(58);
  });
});

describe("getSharedReplay", () => {
  async function setupTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    const topicA = qual.topics[1];

    await db
      .insert(learnerTopicState)
      .values({ learnerId: learner.id, topicId: topicA.id });

    return { db, learner, qual, topicA };
  }

  it("returns replay summary for valid token", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topicA.id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
      })
      .returning();

    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        topicsCovered: [topicA.id],
        totalDurationMinutes: 12,
        summary: "Great session",
      })
      .returning();

    await db.insert(blockAttempts).values({
      blockId: block.id,
      score: "80.00",
    });

    const { token } = generateShareToken(session.id, TEST_SECRET);

    const result = await getSharedReplay(db, token, TEST_SECRET);

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(session.id);
    expect(result!.score).toBe(80);
  });

  it("returns null for invalid token", async () => {
    const { db } = await setupTestData();
    const result = await getSharedReplay(db, "invalid-token", TEST_SECRET);
    expect(result).toBeNull();
  });

  it("returns null for expired token", async () => {
    const { db, learner, topicA } = await setupTestData();

    const [session] = await db
      .insert(studySessions)
      .values({
        learnerId: learner.id,
        status: "completed",
        topicsCovered: [topicA.id],
      })
      .returning();

    // Craft expired token
    const { createHmac } = require("crypto") as typeof import("crypto");
    const pastMs = Date.now() - 1000;
    const payload = `${session.id}::${pastMs}`;
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("hex");
    const token = Buffer.from(`${payload}::${sig}`).toString("base64url");

    const result = await getSharedReplay(db, token, TEST_SECRET);
    expect(result).toBeNull();
  });

  it("returns null when session does not exist", async () => {
    const { db } = await setupTestData();
    const fakeSessionId = "00000000-0000-0000-0000-000000000000";
    const { token } = generateShareToken(fakeSessionId, TEST_SECRET);

    const result = await getSharedReplay(db, token, TEST_SECRET);
    expect(result).toBeNull();
  });
});
