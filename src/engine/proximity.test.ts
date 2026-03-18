import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import {
  learnerTopicState,
  studyBlocks,
  studySessions,
  misconceptionEvents,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  LearnerId,
  QualificationVersionId,
  TopicId,
} from "@/lib/types";
import {
  calculateDaysToExam,
  determinePhase,
  getSchedulerWeightsForPhase,
  getToneModifiersForPhase,
  getAnxietySignalsForPhase,
  getExamPhase,
  generatePostExamSummary,
} from "./proximity";
import type { ExamPhaseName } from "./proximity";

beforeEach(() => {
  resetFixtureCounter();
});

// --- Pure function tests ---

describe("calculateDaysToExam", () => {
  it("returns positive days for future exam", () => {
    const now = new Date(2026, 2, 1); // March 1
    const exam = new Date(2026, 5, 15); // June 15
    const days = calculateDaysToExam(now, exam);
    expect(days).toBe(106);
  });

  it("returns 0 when exam is today", () => {
    const now = new Date(2026, 5, 15);
    const exam = new Date(2026, 5, 15);
    expect(calculateDaysToExam(now, exam)).toBe(0);
  });

  it("returns negative days for past exam", () => {
    const now = new Date(2026, 5, 20); // June 20
    const exam = new Date(2026, 5, 15); // June 15
    expect(calculateDaysToExam(now, exam)).toBe(-5);
  });

  it("returns 1 for tomorrow", () => {
    const now = new Date(2026, 2, 10);
    const exam = new Date(2026, 2, 11);
    expect(calculateDaysToExam(now, exam)).toBe(1);
  });

  it("returns 7 for one week away", () => {
    const now = new Date(2026, 2, 1);
    const exam = new Date(2026, 2, 8);
    expect(calculateDaysToExam(now, exam)).toBe(7);
  });

  it("ignores time-of-day differences", () => {
    const now = new Date(2026, 2, 1, 23, 59, 59); // Late night
    const exam = new Date(2026, 2, 2, 0, 0, 0); // Early morning
    expect(calculateDaysToExam(now, exam)).toBe(1);
  });

  it("handles large time differences", () => {
    const now = new Date(2026, 0, 1); // Jan 1
    const exam = new Date(2026, 11, 31); // Dec 31
    expect(calculateDaysToExam(now, exam)).toBe(364);
  });
});

describe("determinePhase", () => {
  it("returns exploration for 56+ days", () => {
    expect(determinePhase(56)).toBe("exploration");
    expect(determinePhase(57)).toBe("exploration");
    expect(determinePhase(100)).toBe("exploration");
    expect(determinePhase(365)).toBe("exploration");
  });

  it("returns consolidation for 28-55 days", () => {
    expect(determinePhase(28)).toBe("consolidation");
    expect(determinePhase(40)).toBe("consolidation");
    expect(determinePhase(55)).toBe("consolidation");
  });

  it("returns revision for 7-27 days", () => {
    expect(determinePhase(7)).toBe("revision");
    expect(determinePhase(14)).toBe("revision");
    expect(determinePhase(27)).toBe("revision");
  });

  it("returns confidence for 0-6 days", () => {
    expect(determinePhase(0)).toBe("confidence");
    expect(determinePhase(1)).toBe("confidence");
    expect(determinePhase(6)).toBe("confidence");
  });

  it("returns confidence for negative days (past exam)", () => {
    expect(determinePhase(-1)).toBe("confidence");
    expect(determinePhase(-30)).toBe("confidence");
  });

  it("correctly handles phase boundaries", () => {
    expect(determinePhase(55)).toBe("consolidation");
    expect(determinePhase(56)).toBe("exploration");
    expect(determinePhase(27)).toBe("revision");
    expect(determinePhase(28)).toBe("consolidation");
    expect(determinePhase(6)).toBe("confidence");
    expect(determinePhase(7)).toBe("revision");
  });
});

describe("getSchedulerWeightsForPhase", () => {
  const allPhases: ExamPhaseName[] = [
    "exploration",
    "consolidation",
    "revision",
    "confidence",
  ];

  for (const phase of allPhases) {
    it(`returns valid weights for ${phase}`, () => {
      const weights = getSchedulerWeightsForPhase(phase);
      expect(weights.blockTypeWeights).toBeDefined();
      expect(weights.newTopicWeight).toBeGreaterThanOrEqual(0);
      expect(weights.weakTopicWeight).toBeGreaterThanOrEqual(0);
      expect(weights.reviewTopicWeight).toBeGreaterThanOrEqual(0);
      expect(weights.sessionMinutesMultiplier).toBeGreaterThan(0);
    });
  }

  it("has all block types in weights", () => {
    const blockTypes = [
      "retrieval_drill",
      "explanation",
      "worked_example",
      "timed_problems",
      "essay_planning",
      "source_analysis",
      "mistake_review",
      "reentry",
    ] as const;

    for (const phase of allPhases) {
      const weights = getSchedulerWeightsForPhase(phase);
      for (const bt of blockTypes) {
        expect(weights.blockTypeWeights[bt]).toBeDefined();
        expect(typeof weights.blockTypeWeights[bt]).toBe("number");
      }
    }
  });

  it("exploration favours new topics and essay planning", () => {
    const w = getSchedulerWeightsForPhase("exploration");
    expect(w.newTopicWeight).toBeGreaterThan(1.0);
    expect(w.blockTypeWeights.essay_planning).toBeGreaterThan(1.0);
    expect(w.sessionMinutesMultiplier).toBeGreaterThan(1.0);
  });

  it("consolidation reduces new topics and increases retrieval drills", () => {
    const w = getSchedulerWeightsForPhase("consolidation");
    expect(w.newTopicWeight).toBeLessThan(1.0);
    expect(w.blockTypeWeights.retrieval_drill).toBeGreaterThan(1.0);
    expect(w.blockTypeWeights.timed_problems).toBeGreaterThan(1.0);
    expect(w.weakTopicWeight).toBeGreaterThan(1.0);
  });

  it("revision maximises retrieval and timed practice", () => {
    const w = getSchedulerWeightsForPhase("revision");
    expect(w.blockTypeWeights.retrieval_drill).toBeGreaterThanOrEqual(2.0);
    expect(w.blockTypeWeights.timed_problems).toBeGreaterThan(1.5);
    expect(w.newTopicWeight).toBeLessThanOrEqual(0.1);
    expect(w.weakTopicWeight).toBeGreaterThanOrEqual(2.0);
    expect(w.sessionMinutesMultiplier).toBeLessThan(1.0);
  });

  it("confidence suppresses new topics and shortens sessions", () => {
    const w = getSchedulerWeightsForPhase("confidence");
    expect(w.newTopicWeight).toBe(0.0);
    expect(w.weakTopicWeight).toBeLessThan(1.0);
    expect(w.sessionMinutesMultiplier).toBeLessThanOrEqual(0.5);
  });
});

describe("getToneModifiersForPhase", () => {
  const allPhases: ExamPhaseName[] = [
    "exploration",
    "consolidation",
    "revision",
    "confidence",
  ];

  for (const phase of allPhases) {
    it(`returns valid tone modifiers for ${phase}`, () => {
      const tone = getToneModifiersForPhase(phase);
      expect(["high", "medium", "low"]).toContain(tone.encouragement);
      expect(["high", "medium", "low"]).toContain(tone.urgency);
      expect(["high", "medium", "low"]).toContain(tone.positivity);
      expect(["high", "medium", "low"]).toContain(tone.directness);
      expect(tone.description).toBeTruthy();
      expect(tone.description.length).toBeGreaterThan(10);
    });
  }

  it("exploration has low urgency", () => {
    const tone = getToneModifiersForPhase("exploration");
    expect(tone.urgency).toBe("low");
  });

  it("consolidation has high directness", () => {
    const tone = getToneModifiersForPhase("consolidation");
    expect(tone.directness).toBe("high");
  });

  it("revision has high urgency and encouragement", () => {
    const tone = getToneModifiersForPhase("revision");
    expect(tone.urgency).toBe("high");
    expect(tone.encouragement).toBe("high");
  });

  it("confidence has high positivity and low urgency", () => {
    const tone = getToneModifiersForPhase("confidence");
    expect(tone.positivity).toBe("high");
    expect(tone.urgency).toBe("low");
    expect(tone.encouragement).toBe("high");
    expect(tone.directness).toBe("low");
  });
});

describe("getAnxietySignalsForPhase", () => {
  it("enables anxiety detection for confidence phase", () => {
    const signals = getAnxietySignalsForPhase("confidence");
    expect(signals.enabled).toBe(true);
    expect(signals.triggers.length).toBeGreaterThan(0);
    expect(signals.triggers).toContain("panicking");
    expect(signals.triggers).toContain("stressed");
    expect(signals.triggers).toContain("I can't do this");
    expect(signals.triggers).toContain("overwhelmed");
  });

  it("disables anxiety detection for exploration", () => {
    const signals = getAnxietySignalsForPhase("exploration");
    expect(signals.enabled).toBe(false);
    expect(signals.triggers).toHaveLength(0);
  });

  it("disables anxiety detection for consolidation", () => {
    const signals = getAnxietySignalsForPhase("consolidation");
    expect(signals.enabled).toBe(false);
    expect(signals.triggers).toHaveLength(0);
  });

  it("disables anxiety detection for revision", () => {
    const signals = getAnxietySignalsForPhase("revision");
    expect(signals.enabled).toBe(false);
    expect(signals.triggers).toHaveLength(0);
  });
});

// --- DB function tests ---

describe("getExamPhase", () => {
  it("returns exploration phase for exam 10 weeks away", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 2, 1); // March 1
    const examDateStr = "2026-05-15"; // ~75 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("exploration");
    expect(result.daysToExam).toBe(75);
    expect(result.weeksToExam).toBe(10);
    expect(result.examDate).toEqual(new Date("2026-05-15T00:00:00"));
    expect(result.schedulerWeights.newTopicWeight).toBeGreaterThan(1.0);
    expect(result.toneModifiers.urgency).toBe("low");
    expect(result.anxietySignals.enabled).toBe(false);
  });

  it("returns consolidation phase for exam 6 weeks away", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 4, 1); // May 1
    const examDateStr = "2026-06-15"; // 45 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("consolidation");
    expect(result.daysToExam).toBe(45);
    expect(result.weeksToExam).toBe(6);
    expect(result.schedulerWeights.newTopicWeight).toBeLessThan(1.0);
    expect(result.toneModifiers.directness).toBe("high");
  });

  it("returns revision phase for exam 3 weeks away", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 4, 25); // May 25
    const examDateStr = "2026-06-15"; // 21 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("revision");
    expect(result.daysToExam).toBe(21);
    expect(result.weeksToExam).toBe(3);
    expect(result.schedulerWeights.blockTypeWeights.retrieval_drill).toBe(2.0);
    expect(result.toneModifiers.urgency).toBe("high");
  });

  it("returns confidence phase for exam 3 days away", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 5, 12); // June 12
    const examDateStr = "2026-06-15"; // 3 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("confidence");
    expect(result.daysToExam).toBe(3);
    expect(result.weeksToExam).toBe(0);
    expect(result.schedulerWeights.newTopicWeight).toBe(0.0);
    expect(result.toneModifiers.positivity).toBe("high");
    expect(result.anxietySignals.enabled).toBe(true);
    expect(result.anxietySignals.triggers.length).toBeGreaterThan(0);
  });

  it("returns confidence with negative daysToExam for past exam", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 5, 20); // June 20
    const examDateStr = "2026-06-15"; // 5 days ago
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("confidence");
    expect(result.daysToExam).toBe(-5);
    expect(result.weeksToExam).toBe(0);
  });

  it("returns confidence for exam today (0 days)", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 5, 15); // June 15
    const examDateStr = "2026-06-15";
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("confidence");
    expect(result.daysToExam).toBe(0);
    expect(result.weeksToExam).toBe(0);
  });

  it("throws when no enrollment found", async () => {
    const db = getTestDb();

    await expect(
      getExamPhase(
        db,
        "00000000-0000-0000-0000-000000000000" as LearnerId,
        "00000000-0000-0000-0000-000000000000" as QualificationVersionId
      )
    ).rejects.toThrow("No qualification enrollment found");
  });

  it("throws when no exam date set", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: undefined as unknown as string }
    );

    // Update to null exam date
    const { learnerQualifications } = await import("@/db/schema");
    await db
      .update(learnerQualifications)
      .set({ examDate: null })
      .where(eq(learnerQualifications.learnerId, learner.id));

    await expect(
      getExamPhase(
        db,
        learner.id as LearnerId,
        qual.qualificationVersionId
      )
    ).rejects.toThrow("No exam date set");
  });

  it("uses current date when now is not provided", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    // Set exam far in the future so it's always exploration
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: "2030-06-15" }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(result.phase).toBe("exploration");
    expect(result.daysToExam).toBeGreaterThan(56);
  });

  it("returns correct boundary: day 7 is revision not confidence", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 5, 8); // June 8
    const examDateStr = "2026-06-15"; // 7 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("revision");
    expect(result.daysToExam).toBe(7);
  });

  it("returns correct boundary: day 6 is confidence not revision", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const now = new Date(2026, 5, 9); // June 9
    const examDateStr = "2026-06-15"; // 6 days away
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: examDateStr }
    );

    const result = await getExamPhase(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId,
      now
    );

    expect(result.phase).toBe("confidence");
    expect(result.daysToExam).toBe(6);
  });
});

describe("generatePostExamSummary", () => {
  async function setupFullTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: "2026-06-15" }
    );

    // Create learner topic state for all topics
    for (const topic of qual.topics) {
      await db.insert(learnerTopicState).values({
        learnerId: learner.id,
        topicId: topic.id,
      });
    }

    return { db, org, learner, qual };
  }

  it("returns correct summary with sessions and misconceptions", async () => {
    const { db, learner, qual } = await setupFullTestData();
    const topic = qual.topics[1]; // Topic 1.1

    // Set mastery levels
    await db
      .update(learnerTopicState)
      .set({ masteryLevel: "0.800" })
      .where(
        eq(learnerTopicState.topicId, topic.id)
      );

    // Create a study block + session
    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 3,
      })
      .returning();

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: block.id,
      status: "completed",
      totalDurationMinutes: 12,
    });

    // Create a misconception (resolved)
    await db.insert(misconceptionEvents).values({
      learnerId: learner.id,
      topicId: topic.id,
      description: "Confused osmosis with diffusion",
      severity: 2,
      resolved: true,
      resolvedAt: new Date(),
    });

    // Create a misconception (unresolved)
    await db.insert(misconceptionEvents).values({
      learnerId: learner.id,
      topicId: topic.id,
      description: "Cell wall vs cell membrane",
      severity: 1,
    });

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.qualificationName).toBe("GCSE Test Subject");
    expect(summary.examDate).toEqual(new Date("2026-06-15T00:00:00"));
    expect(summary.sessionsCompleted).toBe(1);
    expect(summary.totalStudyMinutes).toBe(12);
    expect(summary.misconceptionsTotal).toBe(2);
    expect(summary.misconceptionsResolved).toBe(1);
    expect(summary.totalTopics).toBe(qual.topics.length);
    expect(summary.topicsCovered).toBe(1); // Only 1 topic has mastery > 0
    expect(summary.averageMastery).toBeGreaterThan(0);
    expect(summary.strongestTopics.length).toBeGreaterThan(0);
    expect(summary.weakestTopics.length).toBeGreaterThan(0);
  });

  it("returns zeros when no activity", async () => {
    const { db, learner, qual } = await setupFullTestData();

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.sessionsCompleted).toBe(0);
    expect(summary.totalStudyMinutes).toBe(0);
    expect(summary.misconceptionsTotal).toBe(0);
    expect(summary.misconceptionsResolved).toBe(0);
    expect(summary.topicsCovered).toBe(0);
    expect(summary.averageMastery).toBe(0);
    expect(summary.specCoveragePercent).toBe(0);
  });

  it("handles qualification with no topics", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: "2026-06-15" }
    );

    // Delete topic_edges first (FK references topics), then topics
    const { topicEdges, topics: topicsTable } = await import("@/db/schema");
    await db.delete(topicEdges);
    await db
      .delete(topicsTable)
      .where(eq(topicsTable.qualificationVersionId, qual.qualificationVersionId));

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.totalTopics).toBe(0);
    expect(summary.sessionsCompleted).toBe(0);
    expect(summary.specCoveragePercent).toBe(0);
    expect(summary.strongestTopics).toHaveLength(0);
    expect(summary.weakestTopics).toHaveLength(0);
  });

  it("correctly identifies strongest and weakest topics", async () => {
    const { db, learner, qual } = await setupFullTestData();

    // Set different mastery levels for each topic
    const masteryLevels = [0.9, 0.8, 0.6, 0.2, 0.1];
    for (let i = 0; i < qual.topics.length; i++) {
      await db
        .update(learnerTopicState)
        .set({ masteryLevel: (masteryLevels[i] ?? 0).toFixed(3) })
        .where(eq(learnerTopicState.topicId, qual.topics[i].id));
    }

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.strongestTopics[0].mastery).toBe(0.9);
    expect(summary.weakestTopics[0].mastery).toBe(0.1);
    expect(summary.topicsCovered).toBe(5);
    expect(summary.specCoveragePercent).toBe(100);
  });

  it("calculates spec coverage correctly with partial mastery", async () => {
    const { db, learner, qual } = await setupFullTestData();

    // Set mastery for 2 out of 5 topics
    await db
      .update(learnerTopicState)
      .set({ masteryLevel: "0.700" })
      .where(eq(learnerTopicState.topicId, qual.topics[0].id));
    await db
      .update(learnerTopicState)
      .set({ masteryLevel: "0.500" })
      .where(eq(learnerTopicState.topicId, qual.topics[1].id));

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.topicsCovered).toBe(2);
    expect(summary.totalTopics).toBe(5);
    expect(summary.specCoveragePercent).toBe(40);
  });

  it("counts multiple sessions correctly", async () => {
    const { db, learner, qual } = await setupFullTestData();

    // Create multiple blocks and sessions
    for (let i = 0; i < 3; i++) {
      const [block] = await db
        .insert(studyBlocks)
        .values({
          learnerId: learner.id,
          topicId: qual.topics[i % qual.topics.length].id,
          blockType: "retrieval_drill",
          durationMinutes: 15,
          priority: 3,
        })
        .returning();

      await db.insert(studySessions).values({
        learnerId: learner.id,
        blockId: block.id,
        status: "completed",
        totalDurationMinutes: 10 + i * 5,
      });
    }

    // Also create an abandoned session (should NOT count)
    const [abandonedBlock] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: qual.topics[0].id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 3,
      })
      .returning();

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: abandonedBlock.id,
      status: "abandoned",
      totalDurationMinutes: 5,
    });

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.sessionsCompleted).toBe(3);
    expect(summary.totalStudyMinutes).toBe(10 + 15 + 20);
  });

  it("does not count sessions from other qualifications", async () => {
    const { db, learner, qual } = await setupFullTestData();

    // Create another qualification with its own topic
    const qual2 = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual2.qualificationVersionId,
      { examDate: "2026-06-20" }
    );

    // Create a session for the OTHER qualification
    const [otherBlock] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: qual2.topics[1].id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 3,
      })
      .returning();

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: otherBlock.id,
      status: "completed",
      totalDurationMinutes: 20,
    });

    // Create a session for THIS qualification
    const [thisBlock] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: qual.topics[1].id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 3,
      })
      .returning();

    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: thisBlock.id,
      status: "completed",
      totalDurationMinutes: 10,
    });

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    // Should only count the session for this qualification
    expect(summary.sessionsCompleted).toBe(1);
    expect(summary.totalStudyMinutes).toBe(10);
  });

  it("throws when no enrollment found", async () => {
    const db = getTestDb();

    await expect(
      generatePostExamSummary(
        db,
        "00000000-0000-0000-0000-000000000000" as LearnerId,
        "00000000-0000-0000-0000-000000000000" as QualificationVersionId
      )
    ).rejects.toThrow("No qualification enrollment found");
  });

  it("throws when no exam date set", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: "2026-06-15" }
    );

    // Remove exam date
    const { learnerQualifications } = await import("@/db/schema");
    await db
      .update(learnerQualifications)
      .set({ examDate: null })
      .where(eq(learnerQualifications.learnerId, learner.id));

    await expect(
      generatePostExamSummary(
        db,
        learner.id as LearnerId,
        qual.qualificationVersionId
      )
    ).rejects.toThrow("No exam date set");
  });

  it("calculates average mastery across all topics", async () => {
    const { db, learner, qual } = await setupFullTestData();

    // Set known mastery values: 0.8, 0.6, 0.4, 0.2, 0.0
    const levels = [0.8, 0.6, 0.4, 0.2, 0.0];
    for (let i = 0; i < qual.topics.length; i++) {
      await db
        .update(learnerTopicState)
        .set({ masteryLevel: (levels[i] ?? 0).toFixed(3) })
        .where(eq(learnerTopicState.topicId, qual.topics[i].id));
    }

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    // Average: (0.8 + 0.6 + 0.4 + 0.2 + 0.0) / 5 = 0.4
    expect(summary.averageMastery).toBe(0.4);
  });

  it("limits strongest/weakest to 5 topics max", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId,
      { examDate: "2026-06-15" }
    );

    // createTestQualification creates 5 topics, so strongest/weakest
    // should be capped at 5
    for (const topic of qual.topics) {
      await db.insert(learnerTopicState).values({
        learnerId: learner.id,
        topicId: topic.id,
        masteryLevel: (Math.random() * 0.9 + 0.1).toFixed(3),
      });
    }

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.strongestTopics.length).toBeLessThanOrEqual(5);
    expect(summary.weakestTopics.length).toBeLessThanOrEqual(5);
  });

  it("handles sessions with null duration gracefully", async () => {
    const { db, learner, qual } = await setupFullTestData();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: qual.topics[0].id,
        blockType: "retrieval_drill",
        durationMinutes: 15,
        priority: 3,
      })
      .returning();

    // Session with null totalDurationMinutes
    await db.insert(studySessions).values({
      learnerId: learner.id,
      blockId: block.id,
      status: "completed",
      totalDurationMinutes: null,
    });

    const summary = await generatePostExamSummary(
      db,
      learner.id as LearnerId,
      qual.qualificationVersionId
    );

    expect(summary.sessionsCompleted).toBe(1);
    expect(summary.totalStudyMinutes).toBe(0);
  });
});
