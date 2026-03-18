import { describe, test, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestUser,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import { learnerTopicState, studySessions, studyBlocks } from "@/db/schema";
import {
  loadLearnerByUserId,
  loadQualifications,
  loadDashboardStats,
  loadMasteryTopics,
  loadTodayQueue,
} from "./data";

describe("loadLearnerByUserId", () => {
  test("returns learner for valid user", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const user = await createTestUser();
    const learner = await createTestLearner(org.id, { userId: user.id });

    const result = await loadLearnerByUserId(user.id, db);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(learner.id);
    expect(result!.displayName).toBeTruthy();
  });

  test("returns null for user without learner", async () => {
    const db = getTestDb();
    const user = await createTestUser();

    const result = await loadLearnerByUserId(user.id, db);
    expect(result).toBeNull();
  });

  test("returns null for non-existent user", async () => {
    const db = getTestDb();
    const result = await loadLearnerByUserId(
      "00000000-0000-0000-0000-000000000000",
      db
    );
    expect(result).toBeNull();
  });
});

describe("loadQualifications", () => {
  test("returns enrolled qualifications with joined data", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );

    const result = await loadQualifications(learner.id, db);
    expect(result.length).toBe(1);
    expect(result[0].qualificationName).toBeTruthy();
    expect(result[0].subjectName).toBeTruthy();
    expect(result[0].examBoardCode).toBeTruthy();
    expect(result[0].qualificationVersionId).toBe(
      qual.qualificationVersionId
    );
  });

  test("returns empty for learner with no qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const result = await loadQualifications(learner.id, db);
    expect(result.length).toBe(0);
  });

  test("only returns active qualifications", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );

    const result = await loadQualifications(learner.id, db);
    expect(result.length).toBe(1);
    expect(result[0].qualificationVersionId).toBe(
      qual.qualificationVersionId
    );
  });
});

describe("loadDashboardStats", () => {
  test("returns zero stats for new learner", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const stats = await loadDashboardStats(learner.id, db);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalStudyMinutes).toBe(0);
    expect(stats.averageMastery).toBe(0);
    expect(stats.topicsStudied).toBe(0);
    expect(stats.topicsTotal).toBe(0);
    expect(stats.currentStreak).toBe(0);
  });

  test("counts completed sessions", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    await db.insert(studySessions).values({
      learnerId: learner.id,
      status: "completed",
      totalDurationMinutes: 30,
    });
    await db.insert(studySessions).values({
      learnerId: learner.id,
      status: "completed",
      totalDurationMinutes: 45,
    });
    await db.insert(studySessions).values({
      learnerId: learner.id,
      status: "abandoned",
      totalDurationMinutes: 10,
    });

    const stats = await loadDashboardStats(learner.id, db);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalStudyMinutes).toBe(75);
  });

  test("calculates mastery stats from topic state", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const topicIds = qual.topics.map((t) => t.id);

    for (const topicId of topicIds) {
      await db.insert(learnerTopicState).values({
        learnerId: learner.id,
        topicId,
        masteryLevel: "0.500",
        streak: 2,
      });
    }

    const stats = await loadDashboardStats(learner.id, db);
    expect(stats.topicsTotal).toBe(topicIds.length);
    expect(stats.topicsStudied).toBe(topicIds.length);
    expect(stats.averageMastery).toBe(0.5);
    expect(stats.currentStreak).toBe(2);
  });

  test("tracks max streak across topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      masteryLevel: "0.800",
      streak: 5,
    });
    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[1].id,
      masteryLevel: "0.300",
      streak: 1,
    });

    const stats = await loadDashboardStats(learner.id, db);
    expect(stats.currentStreak).toBe(5);
  });

  test("distinguishes studied vs not-studied topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      masteryLevel: "0.500",
    });
    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[1].id,
      masteryLevel: "0.000",
    });

    const stats = await loadDashboardStats(learner.id, db);
    expect(stats.topicsTotal).toBe(2);
    expect(stats.topicsStudied).toBe(1);
  });
});

describe("loadMasteryTopics", () => {
  test("returns empty for learner with no topic state", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const result = await loadMasteryTopics(learner.id, db);
    expect(result.length).toBe(0);
  });

  test("returns topics with mastery levels", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      masteryLevel: "0.750",
    });

    const result = await loadMasteryTopics(learner.id, db);
    expect(result.length).toBe(1);
    expect(result[0].masteryLevel).toBe(0.75);
    expect(result[0].topicName).toBe(qual.topics[0].name);
    expect(result[0].qualificationVersionId).toBeTruthy();
  });

  test("converts decimal mastery to number", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      masteryLevel: "0.333",
    });

    const result = await loadMasteryTopics(learner.id, db);
    expect(typeof result[0].masteryLevel).toBe("number");
    expect(result[0].masteryLevel).toBe(0.333);
  });
});

describe("loadTodayQueue", () => {
  test("returns existing pending blocks without creating new ones", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(studyBlocks).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      blockType: "retrieval_drill",
      durationMinutes: 10,
      priority: 1,
      status: "pending",
    });

    const result = await loadTodayQueue(learner.id, db);
    expect(result.length).toBe(1);
    expect(result[0].topicName).toBe(qual.topics[0].name);
    expect(result[0].blockType).toBe("retrieval_drill");

    const secondResult = await loadTodayQueue(learner.id, db);
    expect(secondResult.length).toBe(1);
    expect(secondResult[0].id).toBe(result[0].id);
  });

  test("returns empty for learner with no blocks or topic state", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const result = await loadTodayQueue(learner.id, db);
    expect(result.length).toBe(0);
  });

  test("orders blocks by priority", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(studyBlocks).values([
      {
        learnerId: learner.id,
        topicId: qual.topics[0].id,
        blockType: "explanation",
        durationMinutes: 15,
        priority: 5,
        status: "pending",
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 1,
        status: "pending",
      },
    ]);

    const result = await loadTodayQueue(learner.id, db);
    expect(result.length).toBe(2);
    expect(result[0].priority).toBe(1);
    expect(result[1].priority).toBe(5);
  });

  test("ignores completed blocks", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(studyBlocks).values({
      learnerId: learner.id,
      topicId: qual.topics[0].id,
      blockType: "retrieval_drill",
      durationMinutes: 10,
      priority: 1,
      status: "completed",
    });

    const result = await loadTodayQueue(learner.id, db);
    expect(result.length).toBe(0);
  });
});
