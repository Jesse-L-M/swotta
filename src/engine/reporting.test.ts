import { describe, it, expect, vi } from "vitest";
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
  notificationEvents,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LearnerId, UserId, TopicId } from "@/lib/types";
import {
  generateWeeklyReport,
  generateEnhancedWeeklyReport,
  detectFlags,
  sendWeeklyReport,
  generateTeacherInsight,
  buildMisconceptionNarratives,
  computeSuggestions,
  mapEnrichmentToEmailProps,
  type ReportingDeps,
  type ReportEnrichment,
  type MisconceptionNarrative,
  type ExamPhaseContext,
} from "./reporting";
import type { BehaviourReport } from "@/engine/behaviour";
import type { CalibrationResult } from "@/engine/calibration";
import type { TechniqueMastery } from "@/engine/technique";
import type { ExamPhase } from "@/engine/proximity";

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

  it("includes detected flags in the report data", async () => {
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
    expect(result.flags[0].type).toBe("disengagement");
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

    const html = await renderWeeklyReportEmail({
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

    const html = await renderWeeklyReportEmail({
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

    const html = await renderWeeklyReportEmail({
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

// ---------------------------------------------------------------------------
// Phase 6.4: Enhanced report tests
// ---------------------------------------------------------------------------

function mockBehaviourReport(overrides?: Partial<BehaviourReport>): BehaviourReport {
  return {
    avoidedTopics: [],
    engagementTrend: {
      direction: "stable",
      sessionDurationTrend: 0,
      gapTrend: 0,
      confidenceTrend: 0,
      recentAvgDurationMinutes: 30,
      earlierAvgDurationMinutes: 30,
      recentAvgGapDays: 2,
      earlierAvgGapDays: 2,
    },
    peakHours: [],
    overRelianceSignals: [],
    safetyFlags: [],
    ...overrides,
  };
}

function mockCalibrationResult(overrides?: Partial<CalibrationResult>): CalibrationResult {
  return {
    overconfident: false,
    underconfident: false,
    calibrationScore: 0,
    trend: "stable",
    message: "Well calibrated.",
    topicCalibrations: [],
    dataPoints: 5,
    ...overrides,
  };
}

function mockTechniqueMastery(overrides?: Partial<TechniqueMastery>[]): TechniqueMastery[] {
  return (overrides ?? []).map((o) => ({
    commandWord: o?.commandWord ?? "Describe",
    definition: o?.definition ?? "Give an account of",
    expectedDepth: o?.expectedDepth ?? 1,
    questionsAttempted: o?.questionsAttempted ?? 5,
    avgScore: o?.avgScore ?? 70,
    trend: o?.trend ?? "stable",
  }));
}

function mockExamPhase(): ExamPhase {
  return {
    phase: "consolidation",
    weeksToExam: 6,
    daysToExam: 42,
    examDate: new Date("2026-06-15"),
    schedulerWeights: {
      blockTypeWeights: {
        retrieval_drill: 1.5,
        explanation: 0.8,
        worked_example: 1.0,
        timed_problems: 1.3,
        essay_planning: 1.0,
        source_analysis: 0.8,
        mistake_review: 1.3,
        reentry: 0.5,
      },
      newTopicWeight: 0.3,
      weakTopicWeight: 1.5,
      reviewTopicWeight: 1.3,
      sessionMinutesMultiplier: 1.0,
    },
    toneModifiers: {
      encouragement: "medium",
      urgency: "medium",
      positivity: "medium",
      directness: "high",
      description: "Focused and purposeful. Let's strengthen what you know.",
    },
    anxietySignals: { enabled: false, triggers: [] },
  };
}

function enhancedDeps(overrides?: Partial<ReportingDeps>): Partial<ReportingDeps> {
  return {
    ...baseDeps(),
    detectPatternsFn: vi.fn().mockResolvedValue(mockBehaviourReport()),
    calculateCalibrationFn: vi.fn().mockResolvedValue(mockCalibrationResult()),
    getTechniqueMasteryFn: vi.fn().mockResolvedValue(mockTechniqueMastery()),
    getExamPhaseFn: vi.fn().mockResolvedValue(mockExamPhase()),
    ...overrides,
  };
}

describe("computeSuggestions", () => {
  it("returns avoidance suggestion when topics are avoided", () => {
    const behaviour = mockBehaviourReport({
      avoidedTopics: [
        {
          topicId: "t1" as TopicId,
          topicName: "Ecology",
          scheduledCount: 5,
          skippedCount: 3,
          lastScheduledAt: new Date(),
          reintroductionStrategy: {
            approach: "reduce_difficulty",
            suggestedBlockType: "worked_example",
            rationale: "test",
          },
        },
      ],
    });
    const suggestions = computeSuggestions(behaviour, null, [], [], null);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].category).toBe("avoidance");
    expect(suggestions[0].message).toContain("Ecology");
  });

  it("returns engagement suggestion when trend is declining", () => {
    const behaviour = mockBehaviourReport({
      engagementTrend: {
        direction: "declining",
        sessionDurationTrend: -10,
        gapTrend: 3,
        confidenceTrend: -0.2,
        recentAvgDurationMinutes: 15,
        earlierAvgDurationMinutes: 30,
        recentAvgGapDays: 5,
        earlierAvgGapDays: 2,
      },
    });
    const suggestions = computeSuggestions(behaviour, null, [], [], null);
    const engagement = suggestions.find((s) => s.category === "engagement");
    expect(engagement).toBeDefined();
    expect(engagement!.priority).toBe("high");
  });

  it("returns calibration suggestion for underconfident learner", () => {
    const calibration = mockCalibrationResult({
      underconfident: true,
      topicCalibrations: [
        {
          topicId: "t1" as TopicId,
          topicName: "Genetics",
          calibrationScore: -0.3,
          overconfident: false,
          underconfident: true,
          dataPoints: 5,
          message: "Underconfident on Genetics",
        },
      ],
    });
    const suggestions = computeSuggestions(null, calibration, [], [], null);
    const cal = suggestions.find((s) => s.category === "calibration");
    expect(cal).toBeDefined();
    expect(cal!.message).toContain("Genetics");
    expect(cal!.message).toContain("underestimate");
  });

  it("returns calibration suggestion for overconfident learner", () => {
    const calibration = mockCalibrationResult({
      overconfident: true,
      topicCalibrations: [
        {
          topicId: "t1" as TopicId,
          topicName: "Ecology",
          calibrationScore: 0.3,
          overconfident: true,
          underconfident: false,
          dataPoints: 5,
          message: "Overconfident on Ecology",
        },
      ],
    });
    const suggestions = computeSuggestions(null, calibration, [], [], null);
    const cal = suggestions.find((s) => s.category === "calibration");
    expect(cal).toBeDefined();
    expect(cal!.message).toContain("overconfident");
    expect(cal!.message).toContain("Ecology");
  });

  it("returns technique suggestion for weak command words", () => {
    const technique = mockTechniqueMastery([
      { commandWord: "Evaluate", avgScore: 35, questionsAttempted: 5, trend: "stable" },
    ]);
    const suggestions = computeSuggestions(null, null, technique, [], null);
    const tech = suggestions.find((s) => s.category === "technique");
    expect(tech).toBeDefined();
    expect(tech!.message).toContain("evaluate");
  });

  it("returns misconception suggestion for unresolved recurring misconceptions", () => {
    const misconceptions: MisconceptionNarrative[] = [
      {
        topicName: "Cell Biology",
        description: "Confuses osmosis with diffusion",
        occurrences: 4,
        resolved: false,
        resolvedAt: null,
        firstSeenAt: new Date(),
        narrative: "Confuses osmosis with diffusion — seen 4 times",
      },
    ];
    const suggestions = computeSuggestions(null, null, [], misconceptions, null);
    const misc = suggestions.find((s) => s.category === "misconception");
    expect(misc).toBeDefined();
    expect(misc!.message).toContain("Cell Biology");
    expect(misc!.priority).toBe("high");
  });

  it("returns exam suggestion when exam is near", () => {
    const examPhase: ExamPhaseContext = {
      phase: "revision",
      daysToExam: 14,
      weeksToExam: 2,
      qualificationName: "GCSE Biology",
      description: "Focused revision phase",
    };
    const suggestions = computeSuggestions(null, null, [], [], examPhase);
    const exam = suggestions.find((s) => s.category === "exam");
    expect(exam).toBeDefined();
    expect(exam!.message).toContain("GCSE Biology");
    expect(exam!.message).toContain("14 days");
  });

  it("returns high priority exam suggestion when exam within 7 days", () => {
    const examPhase: ExamPhaseContext = {
      phase: "confidence",
      daysToExam: 5,
      weeksToExam: 0,
      qualificationName: "GCSE Biology",
      description: "Stay calm",
    };
    const suggestions = computeSuggestions(null, null, [], [], examPhase);
    const exam = suggestions.find((s) => s.category === "exam");
    expect(exam).toBeDefined();
    expect(exam!.priority).toBe("high");
    expect(exam!.message).toContain("calm");
  });

  it("returns empty array when no issues detected", () => {
    const suggestions = computeSuggestions(null, null, [], [], null);
    expect(suggestions).toEqual([]);
  });

  it("sorts suggestions by priority (high first)", () => {
    const behaviour = mockBehaviourReport({
      engagementTrend: {
        direction: "declining",
        sessionDurationTrend: -10,
        gapTrend: 3,
        confidenceTrend: -0.2,
        recentAvgDurationMinutes: 15,
        earlierAvgDurationMinutes: 30,
        recentAvgGapDays: 5,
        earlierAvgGapDays: 2,
      },
    });
    const calibration = mockCalibrationResult({
      underconfident: true,
      topicCalibrations: [
        {
          topicId: "t1" as TopicId,
          topicName: "X",
          calibrationScore: -0.3,
          overconfident: false,
          underconfident: true,
          dataPoints: 3,
          message: "Underconfident",
        },
      ],
    });
    const suggestions = computeSuggestions(behaviour, calibration, [], [], null);
    expect(suggestions.length).toBeGreaterThan(1);
    expect(suggestions[0].priority).toBe("high");
  });

  it("does not suggest exam context when exam is more than 28 days away", () => {
    const examPhase: ExamPhaseContext = {
      phase: "exploration",
      daysToExam: 60,
      weeksToExam: 8,
      qualificationName: "GCSE Biology",
      description: "Explore",
    };
    const suggestions = computeSuggestions(null, null, [], [], examPhase);
    expect(suggestions.find((s) => s.category === "exam")).toBeUndefined();
  });

  it("does not suggest misconception when fewer than 3 occurrences", () => {
    const misconceptions: MisconceptionNarrative[] = [
      {
        topicName: "X",
        description: "Y",
        occurrences: 2,
        resolved: false,
        resolvedAt: null,
        firstSeenAt: new Date(),
        narrative: "Y — seen 2 times",
      },
    ];
    const suggestions = computeSuggestions(null, null, [], misconceptions, null);
    expect(suggestions.find((s) => s.category === "misconception")).toBeUndefined();
  });
});

describe("buildMisconceptionNarratives", () => {
  it("groups misconceptions by topic and description", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Confuses osmosis with diffusion",
      resolved: false,
    });
    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Confuses osmosis with diffusion",
      resolved: false,
    });

    const narratives = await buildMisconceptionNarratives(
      getTestDb(),
      learner.id as LearnerId,
    );

    expect(narratives).toHaveLength(1);
    expect(narratives[0].occurrences).toBe(2);
    expect(narratives[0].description).toBe("Confuses osmosis with diffusion");
    expect(narratives[0].narrative).toContain("2 times");
  });

  it("marks resolved misconceptions", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Confuses X with Y",
      resolved: true,
    });

    const narratives = await buildMisconceptionNarratives(
      getTestDb(),
      learner.id as LearnerId,
    );

    expect(narratives).toHaveLength(1);
    expect(narratives[0].resolved).toBe(true);
    expect(narratives[0].narrative).toContain("now resolved");
  });

  it("returns empty array when no misconceptions exist", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const narratives = await buildMisconceptionNarratives(
      getTestDb(),
      learner.id as LearnerId,
    );

    expect(narratives).toEqual([]);
  });

  it("separates different descriptions on the same topic", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Misconception A",
    });
    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Misconception B",
    });

    const narratives = await buildMisconceptionNarratives(
      getTestDb(),
      learner.id as LearnerId,
    );

    expect(narratives).toHaveLength(2);
  });
});

describe("generateEnhancedWeeklyReport", () => {
  it("generates enhanced report with enrichment data", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const topic = qual.topics[1];
    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    await createStudySession(learner.id, {
      startedAt: new Date("2026-03-10T10:00:00Z"),
      topicsCovered: [topic.id],
      totalDurationMinutes: 30,
    });

    await createLearnerTopicState(learner.id, topic.id, {
      masteryLevel: "0.650",
    });

    const aiMock = mockAiSummarize("Enhanced report for Michael.");
    const result = await generateEnhancedWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      {
        ...enhancedDeps(),
        aiSummarize: aiMock,
      },
    );

    expect(result.sessionsCompleted).toBe(1);
    expect(result.totalStudyMinutes).toBe(30);
    expect(result.reportId).toBeDefined();
    expect(result.enrichment).toBeDefined();
    expect(result.enrichment.behaviour).toBeDefined();
    expect(result.enrichment.calibration).toBeDefined();
    expect(result.enrichment.misconceptionNarratives).toEqual([]);
    expect(result.enrichment.suggestions).toBeInstanceOf(Array);
    expect(result.summary).toBe("Enhanced report for Michael.");
    expect(aiMock).toHaveBeenCalledOnce();
  });

  it("handles Phase 5 engine failures gracefully", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    const result = await generateEnhancedWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      {
        ...baseDeps(),
        detectPatternsFn: vi.fn().mockRejectedValue(new Error("Engine failed")),
        calculateCalibrationFn: vi.fn().mockRejectedValue(new Error("Engine failed")),
        getTechniqueMasteryFn: vi.fn().mockRejectedValue(new Error("Engine failed")),
        getExamPhaseFn: vi.fn().mockRejectedValue(new Error("Engine failed")),
      },
    );

    expect(result.reportId).toBeDefined();
    expect(result.enrichment.behaviour).toBeNull();
    expect(result.enrichment.calibration).toBeNull();
    expect(result.enrichment.techniqueMastery).toEqual([]);
    expect(result.enrichment.examPhase).toBeNull();
  });

  it("stores the enhanced report in the database", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    const result = await generateEnhancedWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      enhancedDeps(),
    );

    const [stored] = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.id, result.reportId));

    expect(stored).toBeDefined();
    expect(stored.learnerId).toBe(learner.id);
  });

  it("includes misconception narratives from DB data", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Confuses osmosis with diffusion",
      resolved: false,
    });
    await createMisconceptionEvent(learner.id, topic.id, {
      description: "Confuses osmosis with diffusion",
      resolved: false,
    });

    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    const result = await generateEnhancedWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      enhancedDeps(),
    );

    expect(result.enrichment.misconceptionNarratives).toHaveLength(1);
    expect(result.enrichment.misconceptionNarratives[0].description).toBe(
      "Confuses osmosis with diffusion",
    );
    expect(result.enrichment.misconceptionNarratives[0].occurrences).toBe(2);
  });

  it("passes enrichment data to the AI prompt", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const aiMock = mockAiSummarize("Summary with enrichment.");
    const periodStart = new Date("2026-03-09T00:00:00Z");
    const periodEnd = new Date("2026-03-15T23:59:59Z");

    await generateEnhancedWeeklyReport(
      learner.id as LearnerId,
      periodStart,
      periodEnd,
      {
        ...enhancedDeps(),
        aiSummarize: aiMock,
      },
    );

    const prompt = aiMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Engagement trend");
    expect(prompt).toContain("Well calibrated");
  });
});

describe("mapEnrichmentToEmailProps", () => {
  it("maps behaviour insights", () => {
    const enrichment: ReportEnrichment = {
      behaviour: mockBehaviourReport({
        avoidedTopics: [
          {
            topicId: "t1" as TopicId,
            topicName: "Ecology",
            scheduledCount: 5,
            skippedCount: 3,
            lastScheduledAt: new Date(),
            reintroductionStrategy: {
              approach: "reduce_difficulty",
              suggestedBlockType: "worked_example",
              rationale: "test",
            },
          },
        ],
      }),
      calibration: null,
      misconceptionNarratives: [],
      techniqueMastery: [],
      examPhase: null,
      suggestions: [],
    };

    const props = mapEnrichmentToEmailProps(enrichment, "Michael");
    expect(props.behaviourInsights).toBeDefined();
    const insights = props.behaviourInsights as { avoidedTopics: Array<{ topicName: string }> };
    expect(insights.avoidedTopics[0].topicName).toBe("Ecology");
  });

  it("maps calibration insights when data available", () => {
    const enrichment: ReportEnrichment = {
      behaviour: null,
      calibration: mockCalibrationResult({
        underconfident: true,
        topicCalibrations: [
          {
            topicId: "t1" as TopicId,
            topicName: "Genetics",
            calibrationScore: -0.3,
            overconfident: false,
            underconfident: true,
            dataPoints: 5,
            message: "Underconfident on Genetics",
          },
        ],
      }),
      misconceptionNarratives: [],
      techniqueMastery: [],
      examPhase: null,
      suggestions: [],
    };

    const props = mapEnrichmentToEmailProps(enrichment, "Alice");
    expect(props.calibrationInsight).toBeDefined();
  });

  it("maps misconception narratives", () => {
    const enrichment: ReportEnrichment = {
      behaviour: null,
      calibration: null,
      misconceptionNarratives: [
        {
          topicName: "Cell Biology",
          description: "Confuses X",
          occurrences: 3,
          resolved: true,
          resolvedAt: new Date(),
          firstSeenAt: new Date(),
          narrative: "Confuses X — now resolved.",
        },
      ],
      techniqueMastery: [],
      examPhase: null,
      suggestions: [],
    };

    const props = mapEnrichmentToEmailProps(enrichment, "Bob");
    const narrs = props.misconceptionNarratives as Array<{ narrative: string; resolved: boolean }>;
    expect(narrs).toHaveLength(1);
    expect(narrs[0].resolved).toBe(true);
  });

  it("maps suggestions", () => {
    const enrichment: ReportEnrichment = {
      behaviour: null,
      calibration: null,
      misconceptionNarratives: [],
      techniqueMastery: [],
      examPhase: null,
      suggestions: [
        { category: "avoidance", message: "Help needed", priority: "high" },
      ],
    };

    const props = mapEnrichmentToEmailProps(enrichment, "Sam");
    const sugs = props.suggestions as Array<{ message: string; priority: string }>;
    expect(sugs).toHaveLength(1);
    expect(sugs[0].message).toBe("Help needed");
  });

  it("returns empty props when no enrichment data", () => {
    const enrichment: ReportEnrichment = {
      behaviour: null,
      calibration: null,
      misconceptionNarratives: [],
      techniqueMastery: [],
      examPhase: null,
      suggestions: [],
    };

    const props = mapEnrichmentToEmailProps(enrichment, "Sam");
    expect(props.behaviourInsights).toBeUndefined();
    expect(props.calibrationInsight).toBeUndefined();
    expect(props.misconceptionNarratives).toBeUndefined();
    expect(props.suggestions).toBeUndefined();
  });
});

describe("enhanced email template rendering", () => {
  it("renders exam phase context section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      examPhaseContext: {
        phase: "consolidation",
        description: "Focused and purposeful.",
        daysToExam: 42,
      },
    });

    expect(html).toContain("Exam Phase");
    expect(html).toContain("consolidation");
    expect(html).toContain("42 days to exam");
    expect(html).toContain("Focused and purposeful.");
  });

  it("renders behaviour insights section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      behaviourInsights: {
        engagementDirection: "declining",
        avoidedTopics: [{ topicName: "Ecology", skippedCount: 4 }],
      },
    });

    expect(html).toContain("Behaviour Patterns");
    expect(html).toContain("Engagement declining");
    expect(html).toContain("Ecology");
    expect(html).toContain("skipped 4 times");
  });

  it("renders calibration insight section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      calibrationInsight: {
        overconfident: false,
        underconfident: true,
        calibrationScore: -0.25,
        trend: "stable",
        message: "You tend to underestimate yourself.",
        topicHighlights: [
          {
            topicName: "Genetics",
            message: "Underconfident on Genetics",
            overconfident: false,
            underconfident: true,
          },
        ],
      },
    });

    expect(html).toContain("Confidence Calibration");
    expect(html).toContain("You tend to underestimate yourself.");
    expect(html).toContain("Underconfident on Genetics");
  });

  it("renders misconception narratives section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      misconceptionNarratives: [
        { narrative: "Confuses osmosis with diffusion — now resolved.", resolved: true },
        { narrative: "Confuses mitosis with meiosis — seen 3 times.", resolved: false },
      ],
    });

    expect(html).toContain("Misconception Tracker");
    expect(html).toContain("Confuses osmosis with diffusion");
    expect(html).toContain("Resolved");
    expect(html).toContain("Confuses mitosis with meiosis");
  });

  it("renders technique mastery section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      techniqueMastery: [
        { commandWord: "Describe", avgScore: 75, trend: "improving" },
        { commandWord: "Evaluate", avgScore: 35, trend: "declining" },
      ],
    });

    expect(html).toContain("Exam Technique");
    expect(html).toContain("Describe");
    expect(html).toContain("75%");
    expect(html).toContain("Evaluate");
    expect(html).toContain("35%");
    expect(html).toContain("improving");
    expect(html).toContain("declining");
  });

  it("renders suggestions section", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Summary",
      },
      learnerName: "Alice",
      suggestions: [
        { message: "They've been avoiding Ecology.", priority: "high" },
        { message: "Practice evaluate questions.", priority: "medium" },
      ],
    });

    expect(html).toContain("Suggestions for You");
    expect(html).toContain("avoiding Ecology");
    expect(html).toContain("Practice evaluate");
  });

  it("does not render enhanced sections when not provided", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 3,
        totalStudyMinutes: 60,
        topicsReviewed: 2,
        masteryChanges: [],
        flags: [],
        summary: "Basic report.",
      },
      learnerName: "Bob",
    });

    expect(html).not.toContain("Exam Phase");
    expect(html).not.toContain("Behaviour Patterns");
    expect(html).not.toContain("Confidence Calibration");
    expect(html).not.toContain("Misconception Tracker");
    expect(html).not.toContain("Exam Technique");
    expect(html).not.toContain("Suggestions for You");
    expect(html).toContain("Basic report.");
  });

  it("renders all enhanced sections simultaneously", async () => {
    const { renderWeeklyReportEmail } = await import(
      "@/email/templates/weekly-report"
    );

    const html = await renderWeeklyReportEmail({
      data: {
        learnerId: "test-id" as LearnerId,
        periodStart: new Date("2026-03-09"),
        periodEnd: new Date("2026-03-15"),
        sessionsCompleted: 5,
        totalStudyMinutes: 120,
        topicsReviewed: 4,
        masteryChanges: [
          { topicId: "t1" as TopicId, topicName: "Bio", before: 0.4, after: 0.7, delta: 0.3 },
        ],
        flags: [],
        summary: "Great week.",
      },
      learnerName: "Alice",
      examPhaseContext: { phase: "revision", description: "Sharp focus.", daysToExam: 20 },
      behaviourInsights: {
        engagementDirection: "improving",
        avoidedTopics: [],
      },
      calibrationInsight: {
        overconfident: false,
        underconfident: true,
        calibrationScore: -0.2,
        trend: "improving",
        message: "Getting more accurate.",
        topicHighlights: [],
      },
      misconceptionNarratives: [
        { narrative: "Resolved confusion.", resolved: true },
      ],
      techniqueMastery: [
        { commandWord: "Explain", avgScore: 80, trend: "stable" },
      ],
      suggestions: [
        { message: "Keep it up!", priority: "medium" },
      ],
    });

    expect(html).toContain("Exam Phase");
    expect(html).toContain("Confidence Calibration");
    expect(html).toContain("Misconception Tracker");
    expect(html).toContain("Exam Technique");
    expect(html).toContain("Suggestions for You");
  });
});
