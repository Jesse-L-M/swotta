import { describe, it, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
} from "@/test/fixtures";
import {
  misconceptionEvents,
  studySessions,
  learnerTopicState,
} from "@/db/schema";
import {
  loadMisconceptionThreads,
  loadJourneyStats,
  loadJourneyData,
} from "./data";

describe("loadMisconceptionThreads", () => {
  it("returns empty array when no misconception events", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads).toEqual([]);
  });

  it("groups misconception events by description and topic", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1]; // Topic 1.1

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Confuses X with Y",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Confuses X with Y",
        severity: 2,
        resolved: false,
      },
    ]);

    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads).toHaveLength(1);
    expect(threads[0].description).toBe("Confuses X with Y");
    expect(threads[0].occurrenceCount).toBe(2);
    expect(threads[0].topicName).toBe("Topic 1.1");
  });

  it("marks thread as resolved when any event is resolved", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    const now = new Date();
    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Mixes A and B",
        severity: 1,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Mixes A and B",
        severity: 1,
        resolved: true,
        resolvedAt: now,
      },
    ]);

    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads).toHaveLength(1);
    expect(threads[0].resolved).toBe(true);
    expect(threads[0].resolvedAt).toBeTruthy();
  });

  it("returns the max severity from grouped events", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Issue",
        severity: 1,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Issue",
        severity: 3,
        resolved: false,
      },
    ]);

    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads[0].severity).toBe(3);
  });

  it("separates threads with different descriptions", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "First misconception",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Second misconception",
        severity: 1,
        resolved: true,
        resolvedAt: new Date(),
      },
    ]);

    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads).toHaveLength(2);
  });

  it("separates threads with same description but different topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicA = qual.topics[1]; // Topic 1.1
    const topicB = qual.topics[2]; // Topic 1.2

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topicA.id,
        description: "Same issue",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topicB.id,
        description: "Same issue",
        severity: 2,
        resolved: false,
      },
    ]);

    const threads = await loadMisconceptionThreads(learner.id, db);
    expect(threads).toHaveLength(2);
  });

  it("does not include events from other learners", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learnerA.id,
        topicId: topic.id,
        description: "Learner A issue",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learnerB.id,
        topicId: topic.id,
        description: "Learner B issue",
        severity: 2,
        resolved: false,
      },
    ]);

    const threads = await loadMisconceptionThreads(learnerA.id, db);
    expect(threads).toHaveLength(1);
    expect(threads[0].description).toBe("Learner A issue");
  });
});

describe("loadJourneyStats", () => {
  it("returns zero stats when no data exists", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const stats = await loadJourneyStats(learner.id, db);

    expect(stats.sessionsCompleted).toBe(0);
    expect(stats.totalStudyMinutes).toBe(0);
    expect(stats.sessionsThisWeek).toBe(0);
    expect(stats.studyMinutesThisWeek).toBe(0);
    expect(stats.lastSessionAt).toBeNull();
    expect(stats.misconceptionsTotal).toBe(0);
    expect(stats.misconceptionsConquered).toBe(0);
    expect(stats.specCoveragePercent).toBe(0);
    expect(stats.topicsCovered).toBe(0);
    expect(stats.totalTopics).toBe(0);
  });

  it("counts completed sessions and study minutes", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    await db.insert(studySessions).values([
      {
        learnerId: learner.id,
        status: "completed",
        totalDurationMinutes: 20,
      },
      {
        learnerId: learner.id,
        status: "completed",
        totalDurationMinutes: 30,
      },
      {
        learnerId: learner.id,
        status: "abandoned",
        totalDurationMinutes: 5,
      },
    ]);

    const stats = await loadJourneyStats(learner.id, db);
    expect(stats.sessionsCompleted).toBe(2);
    expect(stats.totalStudyMinutes).toBe(50);
    expect(stats.sessionsThisWeek).toBe(2);
    expect(stats.studyMinutesThisWeek).toBe(50);
    expect(stats.lastSessionAt).toBeTruthy();
  });

  it("tracks current-week momentum separately from historical totals", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    await db.insert(studySessions).values([
      {
        learnerId: learner.id,
        status: "completed",
        totalDurationMinutes: 25,
        startedAt: new Date("2026-03-17T09:00:00Z"),
      },
      {
        learnerId: learner.id,
        status: "completed",
        totalDurationMinutes: 40,
        startedAt: new Date("2026-03-01T09:00:00Z"),
      },
    ]);

    const stats = await loadJourneyStats(
      learner.id,
      db,
      new Date("2026-03-18T12:00:00Z")
    );

    expect(stats.sessionsCompleted).toBe(2);
    expect(stats.totalStudyMinutes).toBe(65);
    expect(stats.sessionsThisWeek).toBe(1);
    expect(stats.studyMinutesThisWeek).toBe(25);
  });

  it("counts unique misconception threads", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicA = qual.topics[1];
    const topicB = qual.topics[2];

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topicA.id,
        description: "Issue A",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topicA.id,
        description: "Issue A",
        severity: 2,
        resolved: true,
        resolvedAt: new Date(),
      },
      {
        learnerId: learner.id,
        topicId: topicB.id,
        description: "Issue B",
        severity: 1,
        resolved: false,
      },
    ]);

    const stats = await loadJourneyStats(learner.id, db);
    expect(stats.misconceptionsTotal).toBe(2);
    expect(stats.misconceptionsConquered).toBe(1);
  });

  it("calculates spec coverage from learner topic state", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await db.insert(learnerTopicState).values([
      {
        learnerId: learner.id,
        topicId: qual.topics[0].id,
        masteryLevel: "0.500",
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        masteryLevel: "0.000",
      },
      {
        learnerId: learner.id,
        topicId: qual.topics[2].id,
        masteryLevel: "0.800",
      },
    ]);

    const stats = await loadJourneyStats(learner.id, db);
    expect(stats.totalTopics).toBe(3);
    expect(stats.topicsCovered).toBe(2);
    expect(stats.specCoveragePercent).toBeCloseTo(66.7, 0);
  });
});

describe("loadJourneyData", () => {
  it("splits threads into conquered and active groups", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Active issue",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Conquered issue",
        severity: 1,
        resolved: true,
        resolvedAt: new Date(),
      },
    ]);

    const data = await loadJourneyData(learner.id, db);
    expect(data.active).toHaveLength(1);
    expect(data.active[0].description).toBe("Active issue");
    expect(data.conquered).toHaveLength(1);
    expect(data.conquered[0].description).toBe("Conquered issue");
  });

  it("extracts milestones from conquered threads", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topic = qual.topics[1];

    await db.insert(misconceptionEvents).values({
      learnerId: learner.id,
      topicId: topic.id,
      description: "Conquered one",
      severity: 2,
      resolved: true,
      resolvedAt: new Date(),
    });

    const data = await loadJourneyData(learner.id, db);
    expect(data.milestones).toHaveLength(1);
    expect(data.milestones[0].description).toBe("Conquered one");
  });

  it("returns empty data for learner with no activity", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);

    const data = await loadJourneyData(learner.id, db);
    expect(data.active).toEqual([]);
    expect(data.conquered).toEqual([]);
    expect(data.milestones).toEqual([]);
    expect(data.stats.sessionsCompleted).toBe(0);
  });
});
