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
  notificationEvents,
  learnerTopicState,
  studySessions,
  studyBlocks,
  studyPlans,
  learnerPreferences,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import type { LearnerId, TopicId } from "@/lib/types";
import {
  processLearnerNotifications,
  getDecayingTopics,
  hasRecentNotification,
  hasRecentNotificationOfAnyType,
  getInAppNotifications,
  markNotificationRead,
  buildStudentNudgeContent,
  buildParentAlertContent,
  getActiveLearnerIds,
  type NudgeTriggerData,
  type NotificationDeps,
} from "./notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function mockSendEmail() {
  return vi.fn().mockResolvedValue({ id: "email-123" });
}

function baseDeps(overrides?: Partial<NotificationDeps>): Partial<NotificationDeps> {
  return {
    db: getTestDb(),
    sendEmailFn: mockSendEmail(),
    now: () => new Date("2026-04-15T17:00:00Z"),
    ...overrides,
  };
}

async function createPlanForLearner(db: Database, learnerId: string) {
  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId,
      planType: "weekly",
      title: "Test Plan",
      startDate: daysAgo(7).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      status: "active",
    })
    .returning();
  return plan;
}

async function createSession(
  db: Database,
  opts: {
    learnerId: string;
    blockId?: string;
    status?: string;
    startedAt?: Date;
    totalDurationMinutes?: number;
  },
) {
  const [session] = await db
    .insert(studySessions)
    .values({
      learnerId: opts.learnerId,
      blockId: opts.blockId ?? null,
      status: (opts.status ?? "completed") as "completed",
      startedAt: opts.startedAt ?? new Date(),
      totalDurationMinutes: opts.totalDurationMinutes ?? 20,
    })
    .returning();
  return session;
}

async function createTopicState(
  db: Database,
  opts: {
    learnerId: string;
    topicId: string;
    masteryLevel?: string;
    nextReviewAt?: Date;
    lastReviewedAt?: Date;
    reviewCount?: number;
  },
) {
  const [state] = await db
    .insert(learnerTopicState)
    .values({
      learnerId: opts.learnerId,
      topicId: opts.topicId,
      masteryLevel: opts.masteryLevel ?? "0.300",
      nextReviewAt: opts.nextReviewAt ?? daysAgo(2),
      lastReviewedAt: opts.lastReviewedAt ?? daysAgo(7),
      reviewCount: opts.reviewCount ?? 3,
    })
    .returning();
  return state;
}

// ---------------------------------------------------------------------------
// processLearnerNotifications
// ---------------------------------------------------------------------------

describe("processLearnerNotifications", () => {
  it("sends student nudge when inactive for 3+ days", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Last session was 5 days ago
    const plan = await createPlanForLearner(db, learner.id);
    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    expect(sendEmailFn).toHaveBeenCalled();
    const emailSent = result.sent.filter((s) => s.channel === "email");
    expect(emailSent.length).toBeGreaterThanOrEqual(1);
    expect(emailSent.some((s) => s.type === "student_nudge")).toBe(true);

    // Check in-app notification was created
    const inAppSent = result.sent.filter((s) => s.channel === "in_app");
    expect(inAppSent.length).toBeGreaterThanOrEqual(1);
  });

  it("sends decay alert when topics are below threshold", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Recent session (no inactivity trigger)
    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(1),
    });

    // Create decaying topic states
    for (const topic of qual.topics.filter((t) => t.depth === 1)) {
      await createTopicState(db, {
        learnerId: learner.id,
        topicId: topic.id,
        masteryLevel: "0.350",
        nextReviewAt: daysAgo(3),
      });
    }

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    const decayAlerts = result.sent.filter((s) => s.type === "decay_alert");
    expect(decayAlerts.length).toBeGreaterThan(0);
  });

  it("sends exam proximity notification when exam is within 28 days", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    // Exam in 14 days
    const now = new Date("2026-04-15T17:00:00Z");
    const examDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId, {
      examDate: examDate.toISOString().slice(0, 10),
    });

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(1),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn, now: () => now },
    );

    const examNotifs = result.sent.filter((s) => s.type === "exam_proximity");
    expect(examNotifs.length).toBeGreaterThan(0);
  });

  it("skips when learner has notifications disabled", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Disable notifications
    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: "notifications_enabled",
      value: false,
      source: "stated",
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    expect(sendEmailFn).not.toHaveBeenCalled();
    expect(result.skipped.some((s) => s.reason === "notifications_disabled")).toBe(true);
  });

  it("skips when no triggers are present", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Studied today — no inactivity trigger
    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: new Date("2026-04-15T10:00:00Z"),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    expect(sendEmailFn).not.toHaveBeenCalled();
    expect(result.skipped.some((s) => s.reason === "no_trigger")).toBe(true);
  });

  it("skips when learner not found", async () => {
    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      "00000000-0000-0000-0000-000000000000" as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    expect(sendEmailFn).not.toHaveBeenCalled();
    expect(result.skipped.some((s) => s.reason === "learner_not_found")).toBe(true);
  });

  it("handles email send failure gracefully", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const failingSendEmail = vi.fn().mockRejectedValue(new Error("SMTP error"));
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn: failingSendEmail },
    );

    expect(result.skipped.some((s) => s.reason.includes("email_failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("hasRecentNotification", () => {
  it("returns false when no notifications exist", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const user = await createTestUser();

    const result = await hasRecentNotification(
      db, user.id, "student_nudge", 1, new Date("2026-04-15T17:00:00Z"),
    );

    expect(result).toBe(false);
  });

  it("returns true when notification already sent today", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const user = await createTestUser();
    const now = new Date("2026-04-15T17:00:00Z");

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "student_nudge",
      channel: "email",
      payload: {},
      sentAt: now,
      createdAt: now,
    });

    const result = await hasRecentNotification(
      db, user.id, "student_nudge", 1, now,
    );

    expect(result).toBe(true);
  });

  it("returns false when notification was sent yesterday", async () => {
    const db = getTestDb();
    const user = await createTestUser();
    const now = new Date("2026-04-15T17:00:00Z");
    const yesterday = new Date("2026-04-14T17:00:00Z");

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "student_nudge",
      channel: "email",
      payload: {},
      sentAt: yesterday,
      createdAt: yesterday,
    });

    const result = await hasRecentNotification(
      db, user.id, "student_nudge", 1, now,
    );

    expect(result).toBe(false);
  });

  it("respects different notification types", async () => {
    const db = getTestDb();
    const user = await createTestUser();
    const now = new Date("2026-04-15T17:00:00Z");

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "parent_alert",
      channel: "email",
      payload: {},
      sentAt: now,
      createdAt: now,
    });

    const result = await hasRecentNotification(
      db, user.id, "student_nudge", 1, now,
    );

    expect(result).toBe(false);
  });
});

describe("hasRecentNotificationOfAnyType", () => {
  it("returns true when any matching type was sent today", async () => {
    const db = getTestDb();
    const user = await createTestUser();
    const now = new Date("2026-04-15T17:00:00Z");

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "decay_alert",
      channel: "email",
      payload: {},
      sentAt: now,
      createdAt: now,
    });

    const result = await hasRecentNotificationOfAnyType(
      db, user.id, ["student_nudge", "decay_alert", "exam_proximity"], 1, now,
    );

    expect(result).toBe(true);
  });

  it("returns false when no matching types were sent today", async () => {
    const db = getTestDb();
    const user = await createTestUser();
    const now = new Date("2026-04-15T17:00:00Z");

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "parent_alert",
      channel: "email",
      payload: {},
      sentAt: now,
      createdAt: now,
    });

    const result = await hasRecentNotificationOfAnyType(
      db, user.id, ["student_nudge", "decay_alert", "exam_proximity"], 1, now,
    );

    expect(result).toBe(false);
  });

  it("returns false for empty types array", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    const result = await hasRecentNotificationOfAnyType(
      db, user.id, [], 1, new Date("2026-04-15T17:00:00Z"),
    );

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parent alerts
// ---------------------------------------------------------------------------

describe("parent alerts", () => {
  it("sends parent alert when student is inactive", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Create guardian
    const guardianUser = await createTestUser({ email: "parent@example.com", name: "Jane Smith" });
    await createTestMembership(guardianUser.id, org.id, "guardian");
    await createTestGuardianLink(guardianUser.id, learner.id);

    // Student hasn't studied in 5 days
    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    const parentNotifs = result.sent.filter((s) => s.type === "parent_alert");
    expect(parentNotifs.length).toBeGreaterThan(0);
    expect(parentNotifs.some((s) => s.recipientUserId === guardianUser.id)).toBe(true);
  });

  it("skips parent alert when guardian has receivesFlags disabled", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    // Create guardian with flags disabled
    const guardianUser = await createTestUser();
    await createTestMembership(guardianUser.id, org.id, "guardian");
    const [link] = await db
      .insert((await import("@/db/schema")).guardianLinks)
      .values({
        guardianUserId: guardianUser.id,
        learnerId: learner.id,
        relationship: "parent",
        receivesFlags: false,
      })
      .returning();

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    const parentNotifs = result.sent.filter((s) => s.type === "parent_alert");
    expect(parentNotifs.length).toBe(0);
    expect(result.skipped.some((s) => s.reason === "no_guardians")).toBe(true);
  });

  it("rate limits parent alerts to 1 per day per guardian", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const guardianUser = await createTestUser();
    await createTestMembership(guardianUser.id, org.id, "guardian");
    await createTestGuardianLink(guardianUser.id, learner.id);

    const now = new Date("2026-04-15T17:00:00Z");

    // Already sent parent alert today
    await db.insert(notificationEvents).values({
      userId: guardianUser.id,
      type: "parent_alert",
      channel: "email",
      payload: {},
      sentAt: now,
      createdAt: now,
    });

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn, now: () => now },
    );

    const parentNotifs = result.sent.filter((s) => s.type === "parent_alert");
    expect(parentNotifs.length).toBe(0);
    expect(result.skipped.some((s) => s.reason.startsWith("rate_limited"))).toBe(true);
  });

  it("sends to multiple guardians", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    const guardian1 = await createTestUser({ email: "parent1@example.com" });
    await createTestMembership(guardian1.id, org.id, "guardian");
    await createTestGuardianLink(guardian1.id, learner.id);

    const guardian2 = await createTestUser({ email: "parent2@example.com" });
    await createTestMembership(guardian2.id, org.id, "guardian");
    await createTestGuardianLink(guardian2.id, learner.id);

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const sendEmailFn = mockSendEmail();
    const result = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn },
    );

    const parentEmailsSent = result.sent.filter(
      (s) => s.type === "parent_alert" && s.channel === "email",
    );
    expect(parentEmailsSent.length).toBe(2);
    expect(sendEmailFn).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent1@example.com" }),
    );
    expect(sendEmailFn).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent2@example.com" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Decaying topics
// ---------------------------------------------------------------------------

describe("getDecayingTopics", () => {
  it("returns topics with mastery below threshold and overdue review", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const leafTopic = qual.topics.find((t) => t.depth === 1)!;

    await createTopicState(db, {
      learnerId: learner.id,
      topicId: leafTopic.id,
      masteryLevel: "0.350",
      nextReviewAt: daysAgo(2),
    });

    const now = new Date("2026-04-15T17:00:00Z");
    const results = await getDecayingTopics(db, learner.id as LearnerId, now);

    expect(results.length).toBe(1);
    expect(results[0].topicId).toBe(leafTopic.id);
    expect(results[0].topicName).toBe(leafTopic.name);
    expect(results[0].masteryLevel).toBe(0.35);
  });

  it("excludes topics with mastery above threshold", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const leafTopic = qual.topics.find((t) => t.depth === 1)!;

    await createTopicState(db, {
      learnerId: learner.id,
      topicId: leafTopic.id,
      masteryLevel: "0.700",
      nextReviewAt: daysAgo(2),
    });

    const results = await getDecayingTopics(db, learner.id as LearnerId, new Date());
    expect(results.length).toBe(0);
  });

  it("excludes topics with review not yet due", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const leafTopic = qual.topics.find((t) => t.depth === 1)!;

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createTopicState(db, {
      learnerId: learner.id,
      topicId: leafTopic.id,
      masteryLevel: "0.300",
      nextReviewAt: futureDate,
    });

    const results = await getDecayingTopics(db, learner.id as LearnerId, new Date());
    expect(results.length).toBe(0);
  });

  it("excludes topics with very low mastery (near zero)", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const leafTopic = qual.topics.find((t) => t.depth === 1)!;

    await createTopicState(db, {
      learnerId: learner.id,
      topicId: leafTopic.id,
      masteryLevel: "0.050",
      nextReviewAt: daysAgo(2),
    });

    const results = await getDecayingTopics(db, learner.id as LearnerId, new Date());
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

describe("getInAppNotifications", () => {
  it("returns in-app notifications for a user", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "student_nudge",
      channel: "in_app",
      subject: "Time to study",
      payload: { test: true },
    });

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "student_nudge",
      channel: "email",
      subject: "Time to study",
      payload: { test: true },
    });

    const results = await getInAppNotifications(db, user.id);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("student_nudge");
  });

  it("filters to unread only when requested", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "student_nudge",
      channel: "in_app",
      subject: "Unread",
      payload: { test: true },
    });

    await db.insert(notificationEvents).values({
      userId: user.id,
      type: "decay_alert",
      channel: "in_app",
      subject: "Read",
      payload: { test: true },
      readAt: new Date(),
    });

    const unread = await getInAppNotifications(db, user.id, { unreadOnly: true });
    expect(unread.length).toBe(1);
    expect(unread[0].subject).toBe("Unread");

    const all = await getInAppNotifications(db, user.id, { unreadOnly: false });
    expect(all.length).toBe(2);
  });

  it("respects limit parameter", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    for (let i = 0; i < 5; i++) {
      await db.insert(notificationEvents).values({
        userId: user.id,
        type: "student_nudge",
        channel: "in_app",
        subject: `Notification ${i}`,
        payload: { index: i },
      });
    }

    const results = await getInAppNotifications(db, user.id, { limit: 3 });
    expect(results.length).toBe(3);
  });
});

describe("markNotificationRead", () => {
  it("marks a notification as read", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    const [notif] = await db
      .insert(notificationEvents)
      .values({
        userId: user.id,
        type: "student_nudge",
        channel: "in_app",
        subject: "Test",
        payload: {},
      })
      .returning();

    const result = await markNotificationRead(db, notif.id, user.id);
    expect(result).toBe(true);

    const [updated] = await db
      .select({ readAt: notificationEvents.readAt })
      .from(notificationEvents)
      .where(eq(notificationEvents.id, notif.id));

    expect(updated.readAt).not.toBeNull();
  });

  it("returns false for non-existent notification", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    const result = await markNotificationRead(
      db,
      "00000000-0000-0000-0000-000000000000",
      user.id,
    );

    expect(result).toBe(false);
  });

  it("returns false when userId does not match", async () => {
    const db = getTestDb();
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const [notif] = await db
      .insert(notificationEvents)
      .values({
        userId: user1.id,
        type: "student_nudge",
        channel: "in_app",
        subject: "Test",
        payload: {},
      })
      .returning();

    const result = await markNotificationRead(db, notif.id, user2.id);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

describe("buildStudentNudgeContent", () => {
  const baseTriggerData: NudgeTriggerData = {
    learnerId: "test-id" as LearnerId,
    learnerName: "Michael Smith",
    learnerUserId: "user-id",
    learnerEmail: "michael@example.com",
    daysSinceLastSession: 4,
    decayingTopics: [],
    examProximity: null,
  };

  it("builds inactivity nudge content", () => {
    const { subject, body } = buildStudentNudgeContent(baseTriggerData, "student_nudge");

    expect(subject).toContain("4 days");
    expect(body).toContain("Michael");
    expect(body).toContain("4 days");
  });

  it("builds decay alert content", () => {
    const data: NudgeTriggerData = {
      ...baseTriggerData,
      decayingTopics: [
        { topicId: "t1" as TopicId, topicName: "Genetics", masteryLevel: 0.35, lastReviewedAt: null },
      ],
    };

    const { subject, body } = buildStudentNudgeContent(data, "decay_alert");

    expect(subject).toContain("Genetics");
    expect(body).toContain("Genetics");
    expect(body).toContain("slipping");
  });

  it("builds exam proximity content", () => {
    const data: NudgeTriggerData = {
      ...baseTriggerData,
      examProximity: { qualName: "GCSE Biology", daysToExam: 14, phase: "revision" as const },
    };

    const { subject, body } = buildStudentNudgeContent(data, "exam_proximity");

    expect(subject).toContain("14 days");
    expect(subject).toContain("GCSE Biology");
    expect(body).toContain("Michael");
  });

  it("includes decaying topics in exam proximity content", () => {
    const data: NudgeTriggerData = {
      ...baseTriggerData,
      decayingTopics: [
        { topicId: "t1" as TopicId, topicName: "Genetics", masteryLevel: 0.35, lastReviewedAt: null },
      ],
      examProximity: { qualName: "GCSE Biology", daysToExam: 14, phase: "revision" as const },
    };

    const { body } = buildStudentNudgeContent(data, "exam_proximity");
    expect(body).toContain("Genetics");
  });
});

describe("buildParentAlertContent", () => {
  it("builds parent alert for inactive student", () => {
    const data: NudgeTriggerData = {
      learnerId: "test-id" as LearnerId,
      learnerName: "Michael Smith",
      learnerUserId: "user-id",
      learnerEmail: "michael@example.com",
      daysSinceLastSession: 5,
      decayingTopics: [],
      examProximity: null,
    };

    const { subject, body } = buildParentAlertContent(data, "Jane Smith");

    expect(subject).toContain("Michael");
    expect(body).toContain("Jane");
    expect(body).toContain("Michael");
    expect(body).toContain("hasn't studied");
  });

  it("includes decaying topics in parent alert", () => {
    const data: NudgeTriggerData = {
      learnerId: "test-id" as LearnerId,
      learnerName: "Michael Smith",
      learnerUserId: "user-id",
      learnerEmail: "michael@example.com",
      daysSinceLastSession: 5,
      decayingTopics: [
        { topicId: "t1" as TopicId, topicName: "Genetics", masteryLevel: 0.3, lastReviewedAt: null },
        { topicId: "t2" as TopicId, topicName: "Ecology", masteryLevel: 0.25, lastReviewedAt: null },
      ],
      examProximity: null,
    };

    const { body } = buildParentAlertContent(data, "Jane Smith");
    expect(body).toContain("Genetics");
    expect(body).toContain("Ecology");
  });

  it("includes exam proximity in parent alert", () => {
    const data: NudgeTriggerData = {
      learnerId: "test-id" as LearnerId,
      learnerName: "Michael Smith",
      learnerUserId: "user-id",
      learnerEmail: "michael@example.com",
      daysSinceLastSession: 4,
      decayingTopics: [],
      examProximity: { qualName: "GCSE Biology", daysToExam: 21, phase: "revision" as const },
    };

    const { body } = buildParentAlertContent(data, "Jane Smith");
    expect(body).toContain("GCSE Biology");
    expect(body).toContain("21 days");
  });
});

// ---------------------------------------------------------------------------
// getActiveLearnerIds
// ---------------------------------------------------------------------------

describe("getActiveLearnerIds", () => {
  it("returns learner IDs with active qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner1 = await createTestLearner(org.id);
    const learner2 = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(learner1.id, qual.qualificationVersionId);
    await enrollLearnerInQualification(learner2.id, qual.qualificationVersionId);

    const ids = await getActiveLearnerIds(db);
    expect(ids).toContain(learner1.id);
    expect(ids).toContain(learner2.id);
  });

  it("returns deduplicated IDs for learners with multiple qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual1 = await createTestQualification();
    const qual2 = await createTestQualification();

    await enrollLearnerInQualification(learner.id, qual1.qualificationVersionId);
    await enrollLearnerInQualification(learner.id, qual2.qualificationVersionId);

    const ids = await getActiveLearnerIds(db);
    const matches = ids.filter((id) => id === learner.id);
    expect(matches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Student nudge rate limiting integration
// ---------------------------------------------------------------------------

describe("student nudge rate limiting", () => {
  it("limits to 1 student nudge per day", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);

    await createSession(db, {
      learnerId: learner.id,
      status: "completed",
      startedAt: daysAgo(5),
    });

    const now = new Date("2026-04-15T17:00:00Z");
    const sendEmailFn = mockSendEmail();

    // First call should send
    const result1 = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn, now: () => now },
    );
    const studentSent1 = result1.sent.filter(
      (s) => (s.type === "student_nudge" || s.type === "decay_alert" || s.type === "exam_proximity"),
    );
    expect(studentSent1.length).toBeGreaterThan(0);

    // Second call should be rate limited
    const sendEmailFn2 = mockSendEmail();
    const result2 = await processLearnerNotifications(
      learner.id as LearnerId,
      { ...baseDeps(), sendEmailFn: sendEmailFn2, now: () => now },
    );

    const studentSent2 = result2.sent.filter(
      (s) => (s.type === "student_nudge" || s.type === "decay_alert" || s.type === "exam_proximity"),
    );
    expect(studentSent2.length).toBe(0);
    expect(result2.skipped.some((s) => s.reason === "rate_limited")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Email HTML content
// ---------------------------------------------------------------------------

describe("email content structure", () => {
  it("produces valid HTML with Swotta branding", () => {
    const data: NudgeTriggerData = {
      learnerId: "test-id" as LearnerId,
      learnerName: "Michael Smith",
      learnerUserId: "user-id",
      learnerEmail: "michael@example.com",
      daysSinceLastSession: 4,
      decayingTopics: [],
      examProximity: null,
    };

    const { body } = buildStudentNudgeContent(data, "student_nudge");

    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("Swotta");
    expect(body).toContain("#2D7A6E");
    expect(body).toContain("#FAF6F0");
    expect(body).toContain("app.swotta.com");
  });
});
