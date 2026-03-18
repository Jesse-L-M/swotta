import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestUser,
  createTestLearner,
  createTestMembership,
  createTestGuardianLink,
  createTestQualification,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import {
  studySessions,
  learnerTopicState,
  misconceptionEvents,
  weeklyReports,
  safetyFlags,
  notificationEvents,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { LearnerId, UserId, TopicId } from "@/lib/types";
import {
  generateWeeklyReport,
  detectFlags,
  sendWeeklyReport,
  generateTeacherInsight,
  type ReportingDeps,
  type DetectedFlag,
} from "./reporting";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mockAiSummarize(response: string) {
  return vi.fn().mockResolvedValue(response);
}

function mockSendEmail() {
  return vi.fn().mockResolvedValue({ id: "email-123" });
}

function baseDeps(overrides?: Partial<ReportingDeps>): Partial<ReportingDeps> {
  return {
    db: getTestDb(),
    aiSummarize: mockAiSummarize("A great week of study."),
    sendEmailFn: mockSendEmail(),
    ...overrides,
  };
}

async function createStudySession(
  learnerId: string,
  options: {
    status?: string;
    startedAt?: Date;
    endedAt?: Date;
    topicsCovered?: string[];
    totalDurationMinutes?: number;
    blocksCompleted?: number;
  } = {},
) {
  const db = getTestDb();
  const [session] = await db
    .insert(studySessions)
    .values({
      learnerId,
      status: (options.status as "active" | "completed" | "abandoned" | "timeout") ?? "completed",
      startedAt: options.startedAt ?? new Date(),
      endedAt: options.endedAt ?? new Date(),
      topicsCovered: options.topicsCovered ?? [],
      blocksCompleted: options.blocksCompleted ?? 1,
      totalDurationMinutes: options.totalDurationMinutes ?? 30,
    })
    .returning();
  return session;
}

async function createLearnerTopicState(
  learnerId: string,
  topicId: string,
  overrides: {
    masteryLevel?: string;
    confidence?: string;
    nextReviewAt?: Date | null;
    streak?: number;
    reviewCount?: number;
  } = {},
) {
  const db = getTestDb();
  const [state] = await db
    .insert(learnerTopicState)
    .values({
      learnerId,
      topicId,
      masteryLevel: overrides.masteryLevel ?? "0.500",
      confidence: overrides.confidence ?? "0.500",
      nextReviewAt: overrides.nextReviewAt ?? null,
      streak: overrides.streak ?? 0,
      reviewCount: overrides.reviewCount ?? 0,
    })
    .returning();
  return state;
}

async function createMisconceptionEvent(
  learnerId: string,
  topicId: string,
  overrides: {
    description?: string;
    severity?: number;
    resolved?: boolean;
    createdAt?: Date;
  } = {},
) {
  const db = getTestDb();
  const [event] = await db
    .insert(misconceptionEvents)
    .values({
      learnerId,
      topicId,
      description: overrides.description ?? "Test misconception",
      severity: overrides.severity ?? 2,
      resolved: overrides.resolved ?? false,
      createdAt: overrides.createdAt ?? new Date(),
    })
    .returning();
  return event;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateWeeklyReport", () => {
  it("generates a report for a learner with sessions", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const topic = qual.topics[1]; // Topic 1.1
    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-10T10:00:00Z"),
      endedAt: new Date("2026-03-10T10:30:00Z"),
      topicsCovered: [topic.id],
      totalDurationMinutes: 30,
    });
    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-12T14:00:00Z"),
      endedAt: new Date("2026-03-12T14:45:00Z"),
      topicsCovered: [topic.id],
      totalDurationMinutes: 45,
    });

    await createLearnerTopicState(learner.id, topic.id, {
      masteryLevel: "0.650",
    });

    const aiMock = mockAiSummarize("Great progress this week!");
    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      { ...baseDeps(), aiSummarize: aiMock },
    );

    expect(result.sessionsCompleted).toBe(2);
    expect(result.totalStudyMinutes).toBe(75);
    expect(result.topicsReviewed).toBe(1);
    expect(result.summary).toBe("Great progress this week!");
    expect(result.reportId).toBeDefined();
    expect(aiMock).toHaveBeenCalledOnce();
  });

  it("handles a learner with no sessions in the period", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      baseDeps(),
    );

    expect(result.sessionsCompleted).toBe(0);
    expect(result.totalStudyMinutes).toBe(0);
    expect(result.topicsReviewed).toBe(0);
    expect(result.masteryChanges).toEqual([]);
  });

  it("stores the report in the database", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      baseDeps(),
    );

    const [stored] = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.id, result.reportId));

    expect(stored).toBeDefined();
    expect(stored.learnerId).toBe(learner.id);
    expect(stored.sessionsCompleted).toBe(0);
    expect(stored.summary).toBe("A great week of study.");
  });

  it("uses mastery data from previous report as baseline", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    const topic = qual.topics[1];

    // Insert a previous report with mastery data
    await db.insert(weeklyReports).values({
      learnerId: learner.id,
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      summary: "Previous week",
      masteryChanges: [
        { topicId: topic.id, topicName: "Topic 1.1", before: 0, after: 0.4, delta: 0.4 },
      ] as unknown as Record<string, unknown>,
      sessionsCompleted: 3,
      totalStudyMinutes: 90,
      topicsReviewed: 1,
    });

    // Current mastery is higher
    await createLearnerTopicState(learner.id, topic.id, {
      masteryLevel: "0.700",
    });

    // Session in the current period covering this topic
    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-10T10:00:00Z"),
      topicsCovered: [topic.id],
      totalDurationMinutes: 30,
    });

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-15T23:59:59Z"),
      baseDeps(),
    );

    const change = result.masteryChanges.find((m) => m.topicId === topic.id);
    expect(change).toBeDefined();
    expect(change!.before).toBe(0.4);
    expect(change!.after).toBe(0.7);
    expect(change!.delta).toBeCloseTo(0.3, 2);
  });

  it("defaults baseline to 0 when no previous report exists", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    const topic = qual.topics[1];

    await createLearnerTopicState(learner.id, topic.id, {
      masteryLevel: "0.500",
    });

    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-10T10:00:00Z"),
      topicsCovered: [topic.id],
      totalDurationMinutes: 20,
    });

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-15T23:59:59Z"),
      baseDeps(),
    );

    const change = result.masteryChanges.find((m) => m.topicId === topic.id);
    expect(change).toBeDefined();
    expect(change!.before).toBe(0);
    expect(change!.after).toBe(0.5);
  });

  it("persists safety flags to the database", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    // No sessions → disengagement flag
    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-15T23:59:59Z"),
      baseDeps(),
    );

    expect(result.flags.length).toBeGreaterThan(0);

    const storedFlags = await db
      .select()
      .from(safetyFlags)
      .where(eq(safetyFlags.learnerId, learner.id));
    expect(storedFlags.length).toBeGreaterThan(0);
    expect(storedFlags[0].flagType).toBe("disengagement");
  });

  it("excludes non-completed sessions from counts", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    await createStudySession(learner.id, {
      status: "abandoned",
      startedAt: new Date("2026-03-10T10:00:00Z"),
      totalDurationMinutes: 15,
    });
    await createStudySession(learner.id, {
      status: "active",
      startedAt: new Date("2026-03-11T10:00:00Z"),
      totalDurationMinutes: 20,
    });

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-15T23:59:59Z"),
      baseDeps(),
    );

    expect(result.sessionsCompleted).toBe(0);
    expect(result.totalStudyMinutes).toBe(0);
  });

  it("excludes sessions outside the period", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    // Session before the period
    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-01T10:00:00Z"),
      totalDurationMinutes: 30,
    });
    // Session after the period
    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-20T10:00:00Z"),
      totalDurationMinutes: 30,
    });

    const result = await generateWeeklyReport(
      learner.id as LearnerId,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-15T23:59:59Z"),
      baseDeps(),
    );

    expect(result.sessionsCompleted).toBe(0);
  });
});

describe("detectFlags", () => {
  it("detects disengagement when no sessions exist", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const disengagement = flags.find((f) => f.type === "disengagement");
    expect(disengagement).toBeDefined();
    expect(disengagement!.severity).toBe("high");
  });

  it("detects disengagement with severity based on days since last session", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    // Session 4 days ago (within 7 but outside lookback detection)
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    await createStudySession(learner.id, {
      startedAt: fourDaysAgo,
      status: "completed",
    });

    // Use 3-day lookback to trigger disengagement
    const flags = await detectFlags(learner.id as LearnerId, 3, baseDeps());

    const disengagement = flags.find((f) => f.type === "disengagement");
    expect(disengagement).toBeDefined();
    expect(disengagement!.severity).toBe("medium");
  });

  it("does not flag disengagement when sessions are recent", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    await createStudySession(learner.id, {
      startedAt: new Date(),
      status: "completed",
    });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const disengagement = flags.find((f) => f.type === "disengagement");
    expect(disengagement).toBeUndefined();
  });

  it("detects avoidance when many topics are overdue for review", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Create 6 overdue topic states (threshold is 5)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    for (const topic of qual.topics) {
      await createLearnerTopicState(learner.id, topic.id, {
        nextReviewAt: pastDate,
      });
    }
    // qual.topics has 5 topics, add one more session to avoid disengagement
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const avoidance = flags.find((f) => f.type === "avoidance");
    expect(avoidance).toBeDefined();
    expect(avoidance!.severity).toBe("medium");
  });

  it("does not flag avoidance when fewer than 5 topics are overdue", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    // Only 3 overdue topics
    for (const topic of qual.topics.slice(0, 3)) {
      await createLearnerTopicState(learner.id, topic.id, {
        nextReviewAt: pastDate,
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const avoidance = flags.find((f) => f.type === "avoidance");
    expect(avoidance).toBeUndefined();
  });

  it("flags avoidance as high severity when 10+ topics overdue", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    // Create 10 overdue topic states (use the 5 from qual.topics, plus insert more)
    for (const topic of qual.topics) {
      await createLearnerTopicState(learner.id, topic.id, {
        nextReviewAt: pastDate,
      });
    }

    // We need more topics. Create a second qualification for extra topics.
    const qual2 = await createTestQualification();
    for (const topic of qual2.topics) {
      await createLearnerTopicState(learner.id, topic.id, {
        nextReviewAt: pastDate,
      });
    }

    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const avoidance = flags.find((f) => f.type === "avoidance");
    expect(avoidance).toBeDefined();
    expect(avoidance!.severity).toBe("high");
  });

  it("detects rapid mastery decay", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // 3 topics with low mastery despite multiple reviews
    for (const topic of qual.topics.slice(0, 3)) {
      await createLearnerTopicState(learner.id, topic.id, {
        masteryLevel: "0.200",
        reviewCount: 5,
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const distress = flags.find(
      (f) => f.type === "distress" && f.description.includes("decay"),
    );
    expect(distress).toBeDefined();
    expect(distress!.severity).toBe("medium");
  });

  it("flags rapid decay as high severity when 6+ topics affected", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const qual2 = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // 6+ topics with low mastery and multiple reviews
    const allTopics = [...qual.topics, ...qual2.topics.slice(0, 2)];
    for (const topic of allTopics) {
      await createLearnerTopicState(learner.id, topic.id, {
        masteryLevel: "0.100",
        reviewCount: 4,
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const distress = flags.find(
      (f) => f.type === "distress" && f.description.includes("decay"),
    );
    expect(distress).toBeDefined();
    expect(distress!.severity).toBe("high");
  });

  it("does not flag decay when mastery is above threshold", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    for (const topic of qual.topics) {
      await createLearnerTopicState(learner.id, topic.id, {
        masteryLevel: "0.700",
        reviewCount: 5,
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const distress = flags.find(
      (f) => f.type === "distress" && f.description.includes("decay"),
    );
    expect(distress).toBeUndefined();
  });

  it("detects repeated misconception clusters", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    // 3 unresolved misconceptions on the same topic in the lookback period
    for (let i = 0; i < 3; i++) {
      await createMisconceptionEvent(learner.id, topic.id, {
        description: `Misconception ${i}`,
        resolved: false,
        createdAt: new Date(),
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const misconceptionFlag = flags.find(
      (f) => f.type === "distress" && f.description.includes("misconception"),
    );
    expect(misconceptionFlag).toBeDefined();
  });

  it("flags misconceptions as high severity when 5+ on a topic", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    for (let i = 0; i < 5; i++) {
      await createMisconceptionEvent(learner.id, topic.id, {
        description: `Misconception ${i}`,
        resolved: false,
        createdAt: new Date(),
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const misconceptionFlag = flags.find(
      (f) => f.type === "distress" && f.description.includes("misconception"),
    );
    expect(misconceptionFlag).toBeDefined();
    expect(misconceptionFlag!.severity).toBe("high");
  });

  it("does not flag misconceptions when fewer than 3 per topic", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await createMisconceptionEvent(learner.id, topic.id, {
      resolved: false,
      createdAt: new Date(),
    });
    await createMisconceptionEvent(learner.id, topic.id, {
      resolved: false,
      createdAt: new Date(),
    });
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const misconceptionFlag = flags.find(
      (f) => f.type === "distress" && f.description.includes("misconception"),
    );
    expect(misconceptionFlag).toBeUndefined();
  });

  it("ignores resolved misconceptions", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    for (let i = 0; i < 4; i++) {
      await createMisconceptionEvent(learner.id, topic.id, {
        resolved: true,
        createdAt: new Date(),
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const misconceptionFlag = flags.find(
      (f) => f.type === "distress" && f.description.includes("misconception"),
    );
    expect(misconceptionFlag).toBeUndefined();
  });

  it("ignores misconceptions outside the lookback period", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);

    for (let i = 0; i < 5; i++) {
      await createMisconceptionEvent(learner.id, topic.id, {
        resolved: false,
        createdAt: oldDate,
      });
    }
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const misconceptionFlag = flags.find(
      (f) => f.type === "distress" && f.description.includes("misconception"),
    );
    expect(misconceptionFlag).toBeUndefined();
  });

  it("returns empty array when no issues detected", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    // Recent session
    await createStudySession(learner.id, { startedAt: new Date() });

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    expect(flags).toEqual([]);
  });

  it("can detect multiple flag types simultaneously", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    // No recent sessions → disengagement
    // 5+ overdue topics → avoidance
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    for (const t of qual.topics) {
      await createLearnerTopicState(learner.id, t.id, { nextReviewAt: pastDate });
    }

    // 3+ misconceptions on a topic → distress
    for (let i = 0; i < 3; i++) {
      await createMisconceptionEvent(learner.id, topic.id, {
        resolved: false,
        createdAt: new Date(),
      });
    }

    const flags = await detectFlags(learner.id as LearnerId, 7, baseDeps());

    const types = flags.map((f) => f.type);
    expect(types).toContain("disengagement");
    expect(types).toContain("avoidance");
    expect(types).toContain("distress");
  });
});

describe("sendWeeklyReport", () => {
  it("sends emails to guardians with receives_weekly_report=true", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const guardian = await createTestUser({ email: "parent@example.com" });
    await createTestMembership(guardian.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);
    await createTestGuardianLink(guardian.id, learner.id);

    // Create a report
    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    const emailMock = mockSendEmail();
    const result = await sendWeeklyReport(report.id, {
      ...baseDeps(),
      sendEmailFn: emailMock,
    });

    expect(result.sentTo).toHaveLength(1);
    expect(result.sentTo[0].userId).toBe(guardian.id);
    expect(result.sentTo[0].channel).toBe("email");
    expect(emailMock).toHaveBeenCalledOnce();
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent@example.com" }),
    );
  });

  it("skips guardians with receives_weekly_report=false", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const guardian = await createTestUser();
    await createTestMembership(guardian.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);

    // Create link with reports disabled
    await db.insert((await import("@/db/schema")).guardianLinks).values({
      guardianUserId: guardian.id,
      learnerId: learner.id,
      relationship: "parent",
      receivesWeeklyReport: false,
    });

    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    const emailMock = mockSendEmail();
    const result = await sendWeeklyReport(report.id, {
      ...baseDeps(),
      sendEmailFn: emailMock,
    });

    expect(result.sentTo).toHaveLength(0);
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("sends to multiple guardians", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const guardian1 = await createTestUser({ email: "parent1@example.com" });
    const guardian2 = await createTestUser({ email: "parent2@example.com" });
    await createTestMembership(guardian1.id, org.id, "guardian");
    await createTestMembership(guardian2.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);
    await createTestGuardianLink(guardian1.id, learner.id);
    await createTestGuardianLink(guardian2.id, learner.id);

    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    const emailMock = mockSendEmail();
    const result = await sendWeeklyReport(report.id, {
      ...baseDeps(),
      sendEmailFn: emailMock,
    });

    expect(result.sentTo).toHaveLength(2);
    expect(emailMock).toHaveBeenCalledTimes(2);
  });

  it("records notification_events for each sent email", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const guardian = await createTestUser();
    await createTestMembership(guardian.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);
    await createTestGuardianLink(guardian.id, learner.id);

    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    await sendWeeklyReport(report.id, baseDeps());

    const notifications = await db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.userId, guardian.id));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("weekly_report");
    expect(notifications[0].channel).toBe("email");
    expect(notifications[0].sentAt).toBeDefined();
  });

  it("handles report with no guardians", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    const emailMock = mockSendEmail();
    const result = await sendWeeklyReport(report.id, {
      ...baseDeps(),
      sendEmailFn: emailMock,
    });

    expect(result.sentTo).toHaveLength(0);
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("throws when report not found", async () => {
    await expect(
      sendWeeklyReport("00000000-0000-0000-0000-000000000000", baseDeps()),
    ).rejects.toThrow("Report not found");
  });

  it("updates the report sentTo field", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const guardian = await createTestUser();
    await createTestMembership(guardian.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);
    await createTestGuardianLink(guardian.id, learner.id);

    const [report] = await db
      .insert(weeklyReports)
      .values({
        learnerId: learner.id,
        periodStart: "2026-03-09",
        periodEnd: "2026-03-15",
        summary: "Good week",
        masteryChanges: [] as unknown as Record<string, unknown>,
        sessionsCompleted: 3,
        totalStudyMinutes: 90,
        topicsReviewed: 2,
      })
      .returning();

    await sendWeeklyReport(report.id, baseDeps());

    const [updated] = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.id, report.id));

    const sentTo = updated.sentTo as Array<{ userId: string; channel: string; sentAt: string }>;
    expect(sentTo).toHaveLength(1);
    expect(sentTo[0].userId).toBe(guardian.id);
    expect(sentTo[0].channel).toBe("email");
    expect(sentTo[0].sentAt).toBeDefined();
  });
});

describe("generateTeacherInsight", () => {
  it("generates insight with topic breakdown", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const teacher = await createTestUser();
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    for (const topic of qual.topics) {
      await createLearnerTopicState(learner.id, topic.id, {
        masteryLevel: "0.600",
        confidence: "0.500",
        streak: 2,
      });
    }

    await createStudySession(learner.id, {
      startedAt: new Date(),
      totalDurationMinutes: 30,
    });

    const aiMock = mockAiSummarize(
      JSON.stringify({
        summary: "Student is making steady progress.",
        strengths: ["Consistent study habits"],
        concerns: ["Needs more time on weaker topics"],
        recommendations: ["Focus on spaced repetition"],
      }),
    );

    const result = await generateTeacherInsight(
      learner.id as LearnerId,
      teacher.id as UserId,
      { ...baseDeps(), aiSummarize: aiMock },
    );

    expect(result.summary).toBe("Student is making steady progress.");
    expect(result.strengths).toEqual(["Consistent study habits"]);
    expect(result.concerns).toEqual(["Needs more time on weaker topics"]);
    expect(result.recommendations).toEqual(["Focus on spaced repetition"]);
    expect(result.topicBreakdown).toHaveLength(qual.topics.length);
    expect(result.topicBreakdown[0].masteryLevel).toBe(0.6);
    expect(aiMock).toHaveBeenCalledOnce();
  });

  it("returns empty arrays when AI returns non-JSON", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const teacher = await createTestUser();

    const aiMock = mockAiSummarize("This is plain text, not JSON.");

    const result = await generateTeacherInsight(
      learner.id as LearnerId,
      teacher.id as UserId,
      { ...baseDeps(), aiSummarize: aiMock },
    );

    expect(result.summary).toBe("This is plain text, not JSON.");
    expect(result.strengths).toEqual([]);
    expect(result.concerns).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it("handles a learner with no mastery data", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const teacher = await createTestUser();

    const aiMock = mockAiSummarize(
      JSON.stringify({
        summary: "New student, no data yet.",
        strengths: [],
        concerns: [],
        recommendations: ["Start with the basics"],
      }),
    );

    const result = await generateTeacherInsight(
      learner.id as LearnerId,
      teacher.id as UserId,
      { ...baseDeps(), aiSummarize: aiMock },
    );

    expect(result.topicBreakdown).toHaveLength(0);
    expect(result.summary).toBe("New student, no data yet.");
  });

  it("correctly marks overdue topics", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const teacher = await createTestUser();
    const qual = await createTestQualification();

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    await createLearnerTopicState(learner.id, qual.topics[0].id, {
      nextReviewAt: pastDate,
    });
    await createLearnerTopicState(learner.id, qual.topics[1].id, {
      nextReviewAt: futureDate,
    });

    const result = await generateTeacherInsight(
      learner.id as LearnerId,
      teacher.id as UserId,
      baseDeps(),
    );

    const overdueTopics = result.topicBreakdown.filter((t) => t.isOverdue);
    const notOverdueTopics = result.topicBreakdown.filter((t) => !t.isOverdue);

    expect(overdueTopics).toHaveLength(1);
    expect(notOverdueTopics).toHaveLength(1);
  });

  it("includes recent misconceptions in the AI prompt", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const teacher = await createTestUser();
    const qual = await createTestQualification();

    await createMisconceptionEvent(learner.id, qual.topics[1].id, {
      description: "Confuses mitosis with meiosis",
      severity: 3,
      resolved: false,
      createdAt: new Date(),
    });

    const aiMock = mockAiSummarize(
      JSON.stringify({
        summary: "Has key misconceptions.",
        strengths: [],
        concerns: ["Fundamental confusion about cell division"],
        recommendations: ["Review mitosis vs meiosis"],
      }),
    );

    const result = await generateTeacherInsight(
      learner.id as LearnerId,
      teacher.id as UserId,
      { ...baseDeps(), aiSummarize: aiMock },
    );

    // Verify the AI was called with a prompt that mentions the misconception
    const promptArg = aiMock.mock.calls[0][0] as string;
    expect(promptArg).toContain("mitosis");
    expect(result.concerns).toContain("Fundamental confusion about cell division");
  });
});

describe("email template rendering", () => {
  it("renders weekly report email to HTML", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 5,
        totalStudyMinutes: 120,
        topicsReviewed: 3,
        masteryChanges: [
          {
            topicId: "t1" as TopicId,
            topicName: "Cell Biology",
            before: 0.4,
            after: 0.6,
            delta: 0.2,
          },
        ],
        flags: [
          {
            type: "avoidance",
            description: "Skipping chemistry topics",
            severity: "medium",
          },
        ],
        summary: "A productive week with good progress in biology.",
      },
      learnerName: "Alice Smith",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Alice Smith");
    expect(html).toContain("Weekly Study Report");
    expect(html).toContain("5"); // sessions
    expect(html).toContain("120"); // minutes
    expect(html).toContain("3"); // topics
    expect(html).toContain("Cell Biology");
    expect(html).toContain("+20%");
    expect(html).toContain("avoidance");
    expect(html).toContain("Skipping chemistry topics");
    expect(html).toContain("A productive week");
  });

  it("renders without mastery changes or flags", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 0,
        totalStudyMinutes: 0,
        topicsReviewed: 0,
        masteryChanges: [],
        flags: [],
        summary: "No activity this week.",
      },
      learnerName: "Bob Jones",
    });

    expect(html).toContain("Bob Jones");
    expect(html).toContain("No activity this week.");
    expect(html).not.toContain("Mastery Progress");
    expect(html).not.toContain("Attention Needed");
  });

  it("renders negative mastery changes in red", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 2,
        totalStudyMinutes: 60,
        topicsReviewed: 1,
        masteryChanges: [
          {
            topicId: "t1" as TopicId,
            topicName: "Ecology",
            before: 0.7,
            after: 0.5,
            delta: -0.2,
          },
        ],
        flags: [],
        summary: "Some topics need attention.",
      },
      learnerName: "Charlie",
    });

    expect(html).toContain("-20%");
    expect(html).toContain("Ecology");
  });
});
