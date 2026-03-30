import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import { createTestQualification } from "@/test/fixtures";
import {
  learnerPreferences,
  learnerQualifications,
  learners,
  memberships,
  organizations,
  studyBlocks,
  studyPlans,
  studySessions,
  users,
} from "@/db/schema";
import { PREFERENCE_KEYS } from "@/components/settings/settings-schemas";
import { asTestable } from "../test-helpers";

const { sendEmailMock, structuredLogMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  structuredLogMock: vi.fn(),
}));

vi.mock("@/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/logger", () => ({
  structuredLog: structuredLogMock,
}));

import { studentWeeklyTrigger } from "./student-weekly-trigger";

const testable = asTestable(studentWeeklyTrigger);
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
let entityCounter = 0;

function runStep<T>(callback: () => Promise<T>) {
  return callback();
}

async function runTrigger() {
  const stepRun = vi.fn().mockImplementation(
    (_name: string, fn: () => Promise<unknown>) => runStep(fn),
  );

  const result = await testable.fn(
    { step: { run: stepRun } },
    undefined,
  );

  return { result, stepRun };
}

async function createWeeklyPlan(
  learnerId: string,
  overrides?: Partial<{
    title: string;
    startDate: string;
    endDate: string;
    status: "draft" | "active" | "completed" | "abandoned";
  }>,
) {
  const db = getTestDb();
  const now = referenceNow();
  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId,
      planType: "weekly",
      title: overrides?.title ?? "Week plan",
      startDate: overrides?.startDate ?? formatLondonDate(now),
      endDate: overrides?.endDate ?? formatLondonDate(addDays(now, 6)),
      status: overrides?.status ?? "active",
    })
    .returning();

  return plan;
}

async function createPlanBlock(
  learnerId: string,
  planId: string,
  topicId: string,
  overrides?: Partial<{
    blockType:
      | "retrieval_drill"
      | "explanation"
      | "worked_example"
      | "timed_problems"
      | "essay_planning"
      | "source_analysis"
      | "mistake_review"
      | "reentry";
    scheduledDate: string;
    scheduledOrder: number;
    durationMinutes: number;
    status: "pending" | "active" | "completed" | "skipped";
  }>,
) {
  const db = getTestDb();
  const now = referenceNow();
  const [block] = await db
    .insert(studyBlocks)
    .values({
      learnerId,
      planId,
      topicId,
      blockType: overrides?.blockType ?? "retrieval_drill",
      scheduledDate: overrides?.scheduledDate ?? formatLondonDate(now),
      scheduledOrder: overrides?.scheduledOrder ?? 1,
      durationMinutes: overrides?.durationMinutes ?? 15,
      status: overrides?.status ?? "pending",
    })
    .returning();

  return block;
}

async function createCompletedSession(
  learnerId: string,
  startedAt: Date,
) {
  const db = getTestDb();
  const [session] = await db
    .insert(studySessions)
    .values({
      learnerId,
      status: "completed",
      startedAt,
      totalDurationMinutes: 20,
    })
    .returning();

  return session;
}

async function createActiveLearnerEmailContext(
  overrides?: Partial<{
    email: string;
    name: string;
    displayName: string;
    examDate: string;
  }>,
) {
  const db = getTestDb();
  const qualification = await createTestQualification();
  const now = referenceNow();
  const suffix = ++entityCounter;

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Weekly Email Org ${suffix}`,
      type: "household",
      slug: `weekly-email-org-${suffix}`,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      firebaseUid: `weekly-email-user-${suffix}`,
      email: overrides?.email ?? "michael@example.com",
      name: overrides?.name ?? "Michael Learner",
    })
    .returning();

  await db.insert(memberships).values({
    userId: user.id,
    orgId: org.id,
    role: "learner",
  });

  const [learner] = await db
    .insert(learners)
    .values({
      userId: user.id,
      orgId: org.id,
      displayName: overrides?.displayName ?? "Michael Learner",
      yearGroup: 10,
    })
    .returning();

  await db.insert(learnerQualifications).values({
    learnerId: learner.id,
    qualificationVersionId: qualification.qualificationVersionId,
    targetGrade: "7",
    examDate: overrides?.examDate ?? formatLondonDate(addDays(now, 11)),
    status: "active",
  });

  return { learner, qualification, user };
}

function referenceNow(): Date {
  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);
  return now;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatLondonDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format London date in test");
  }

  return `${year}-${month}-${day}`;
}

function weekdayName(dateString: string): string {
  return WEEKDAY_NAMES[new Date(`${dateString}T12:00:00Z`).getUTCDay()];
}

function daysBetweenDateStrings(startDate: string, endDate: string): number {
  return Math.round(
    (
      new Date(`${endDate}T12:00:00Z`).getTime() -
      new Date(`${startDate}T12:00:00Z`).getTime()
    ) /
      (24 * 60 * 60 * 1000),
  );
}

describe("student/weekly-email function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: "email-123" });
  });

  it("has the expected cron trigger and retry policy", () => {
    expect(testable.opts.id).toBe("student/weekly-email");
    expect(testable.opts.triggers).toEqual([
      { cron: "TZ=Europe/London 0 7 * * 1" },
    ]);
    expect(testable.opts.retries).toBe(3);
  });

  it("sends the current week's plan and excludes stale or completed blocks", async () => {
    const now = referenceNow();
    const previousWeekStart = formatLondonDate(addDays(now, -7));
    const previousWeekEnd = formatLondonDate(addDays(now, -1));
    const currentDay = formatLondonDate(now);
    const nextDay = formatLondonDate(addDays(now, 1));
    const laterThisWeek = formatLondonDate(addDays(now, 2));
    const examDate = formatLondonDate(addDays(now, 11));

    const { learner, qualification } = await createActiveLearnerEmailContext({
      examDate,
    });
    const [mondayTopic, staleTopic, wednesdayTopic] = qualification.topics.filter(
      (topic) => topic.depth === 1,
    );

    const oldPlan = await createWeeklyPlan(learner.id, {
      title: "Old week",
      startDate: previousWeekStart,
      endDate: previousWeekEnd,
    });
    await createPlanBlock(learner.id, oldPlan.id, staleTopic.id, {
      blockType: "explanation",
      scheduledDate: previousWeekStart,
      durationMinutes: 25,
    });

    const currentPlan = await createWeeklyPlan(learner.id, {
      title: "Current week",
      startDate: currentDay,
      endDate: formatLondonDate(addDays(now, 6)),
    });
    await createPlanBlock(learner.id, currentPlan.id, mondayTopic.id, {
      blockType: "retrieval_drill",
      scheduledDate: currentDay,
      scheduledOrder: 1,
      durationMinutes: 15,
    });
    await createPlanBlock(learner.id, currentPlan.id, staleTopic.id, {
      blockType: "explanation",
      scheduledDate: nextDay,
      scheduledOrder: 2,
      durationMinutes: 30,
      status: "completed",
    });
    await createPlanBlock(learner.id, currentPlan.id, wednesdayTopic.id, {
      blockType: "worked_example",
      scheduledDate: laterThisWeek,
      scheduledOrder: 1,
      durationMinutes: 20,
    });

    await createCompletedSession(learner.id, now);
    await createCompletedSession(learner.id, addDays(now, -1));

    const { result, stepRun } = await runTrigger();

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      skipped: 0,
    });
    expect(stepRun.mock.calls.map((call) => call[0])).toEqual([
      "get-active-learners",
      `send-weekly-${learner.id}`,
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "michael@example.com",
        subject: "Your week ahead, Michael",
      }),
    );

    const [{ html }] = sendEmailMock.mock.calls[0];
    expect(html).toContain("Topic 1.1");
    expect(html).toContain("Topic 2.1");
    expect(html).not.toContain("Topic 1.2");
    expect(html).toContain(weekdayName(currentDay));
    expect(html).toContain(weekdayName(laterThisWeek));
    expect(html).not.toContain(weekdayName(nextDay));
    expect(html).toContain("Retrieval Drill");
    expect(html).toContain("Worked Example");
    expect(html).toContain("35m");
    expect(html).toContain(">2<");
    expect(html).toContain(
      `${daysBetweenDateStrings(currentDay, examDate)} days`,
    );

    expect(structuredLogMock).toHaveBeenCalledWith(
      "student-weekly-email.sent",
      expect.objectContaining({
        learnerId: learner.id,
        currentPlanId: currentPlan.id,
        blocksPlanned: 2,
        streakCount: 2,
        examCount: 1,
        phase: "revision",
      }),
    );
  });

  it("skips when learner study reminders are disabled", async () => {
    const db = getTestDb();
    const { learner, qualification } = await createActiveLearnerEmailContext();
    const [topic] = qualification.topics.filter((entry) => entry.depth === 1);

    const currentPlan = await createWeeklyPlan(learner.id);
    await createPlanBlock(learner.id, currentPlan.id, topic.id);

    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: PREFERENCE_KEYS.studyReminders,
      value: false,
      source: "stated",
    });

    const { result } = await runTrigger();

    expect(result).toEqual({
      processed: 1,
      sent: 0,
      skipped: 1,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(structuredLogMock).toHaveBeenCalledWith(
      "student-weekly-email.skipped",
      expect.objectContaining({
        learnerId: learner.id,
        reason: "reminders_disabled",
      }),
    );
  });

  it("skips when legacy learner notifications are disabled", async () => {
    const db = getTestDb();
    const { learner, qualification } = await createActiveLearnerEmailContext();
    const [topic] = qualification.topics.filter((entry) => entry.depth === 1);

    const currentPlan = await createWeeklyPlan(learner.id);
    await createPlanBlock(learner.id, currentPlan.id, topic.id);

    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: "notifications_enabled",
      value: false,
      source: "stated",
    });

    const { result } = await runTrigger();

    expect(result).toEqual({
      processed: 1,
      sent: 0,
      skipped: 1,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(structuredLogMock).toHaveBeenCalledWith(
      "student-weekly-email.skipped",
      expect.objectContaining({
        learnerId: learner.id,
        reason: "reminders_disabled",
      }),
    );
  });

  it("skips when the learner has no plan, no future exams, and no streak", async () => {
    const now = referenceNow();
    const { learner } = await createActiveLearnerEmailContext({
      examDate: formatLondonDate(addDays(now, -5)),
    });

    const { result } = await runTrigger();

    expect(result).toEqual({
      processed: 1,
      sent: 0,
      skipped: 1,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(structuredLogMock).toHaveBeenCalledWith(
      "student-weekly-email.skipped",
      expect.objectContaining({
        learnerId: learner.id,
        reason: "no_content",
        currentPlanId: null,
      }),
    );
  });
});
