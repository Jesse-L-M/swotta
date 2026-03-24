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
  memoryCandidates,
  memoryConfirmed,
  learnerTopicState,
  misconceptionEvents,
  learnerPreferences,
  studySessions,
  studyBlocks,
  policies,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { LearnerId, TopicId } from "@/lib/types";
import {
  median,
  classifyTimeOfDay,
  promoteCandidates,
  inferPreferences,
  assembleLearnerContext,
  MEMORY_PROMOTION_THRESHOLD,
} from "./memory";

beforeEach(() => {
  resetFixtureCounter();
});

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the value for a single element", () => {
    expect(median([42])).toBe(42);
  });

  it("returns the middle value for odd count", () => {
    expect(median([10, 20, 30])).toBe(20);
  });

  it("returns the average of two middle values for even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("sorts unsorted input correctly", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 30, 20])).toBe(25);
  });
});

describe("classifyTimeOfDay", () => {
  it("returns morning for hours 6-11", () => {
    expect(classifyTimeOfDay(6)).toBe("morning");
    expect(classifyTimeOfDay(9)).toBe("morning");
    expect(classifyTimeOfDay(11)).toBe("morning");
  });

  it("returns afternoon for hours 12-16", () => {
    expect(classifyTimeOfDay(12)).toBe("afternoon");
    expect(classifyTimeOfDay(14)).toBe("afternoon");
    expect(classifyTimeOfDay(16)).toBe("afternoon");
  });

  it("returns evening for hours 17-21", () => {
    expect(classifyTimeOfDay(17)).toBe("evening");
    expect(classifyTimeOfDay(19)).toBe("evening");
    expect(classifyTimeOfDay(21)).toBe("evening");
  });

  it("returns night for hours 22-5", () => {
    expect(classifyTimeOfDay(22)).toBe("night");
    expect(classifyTimeOfDay(0)).toBe("night");
    expect(classifyTimeOfDay(3)).toBe("night");
    expect(classifyTimeOfDay(5)).toBe("night");
  });
});

// ---------------------------------------------------------------------------
// promoteCandidates
// ---------------------------------------------------------------------------

describe("promoteCandidates", () => {
  async function setupLearner() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    return { db, learner };
  }

  it("promotes candidates at the threshold", async () => {
    const { db, learner } = await setupLearner();
    const learnerId = learner.id as LearnerId;

    await db.insert(memoryCandidates).values({
      learnerId: learner.id,
      category: "learning_style",
      content: "Prefers visual explanations",
      evidenceCount: MEMORY_PROMOTION_THRESHOLD,
    });

    const promoted = await promoteCandidates(db, learnerId);
    expect(promoted).toBe(1);

    const confirmed = await db
      .select()
      .from(memoryConfirmed)
      .where(eq(memoryConfirmed.learnerId, learner.id));

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].category).toBe("learning_style");
    expect(confirmed[0].content).toBe("Prefers visual explanations");
    expect(confirmed[0].confirmedBy).toBe("auto_promotion");
  });

  it("promotes candidates above the threshold", async () => {
    const { db, learner } = await setupLearner();
    const learnerId = learner.id as LearnerId;

    await db.insert(memoryCandidates).values({
      learnerId: learner.id,
      category: "misconception_pattern",
      content: "Confuses mitosis with meiosis",
      evidenceCount: MEMORY_PROMOTION_THRESHOLD + 3,
    });

    const promoted = await promoteCandidates(db, learnerId);
    expect(promoted).toBe(1);
  });

  it("returns 0 when no candidates exist", async () => {
    const { db, learner } = await setupLearner();
    const promoted = await promoteCandidates(db, learner.id as LearnerId);
    expect(promoted).toBe(0);
  });

  it("returns 0 when all candidates are below threshold", async () => {
    const { db, learner } = await setupLearner();

    await db.insert(memoryCandidates).values({
      learnerId: learner.id,
      category: "learning_style",
      content: "Prefers short sessions",
      evidenceCount: MEMORY_PROMOTION_THRESHOLD - 1,
    });

    const promoted = await promoteCandidates(
      db,
      learner.id as LearnerId
    );
    expect(promoted).toBe(0);
  });

  it("skips already-promoted candidates", async () => {
    const { db, learner } = await setupLearner();

    await db.insert(memoryCandidates).values({
      learnerId: learner.id,
      category: "learning_style",
      content: "Already promoted",
      evidenceCount: MEMORY_PROMOTION_THRESHOLD,
      promotedAt: new Date(),
    });

    const promoted = await promoteCandidates(
      db,
      learner.id as LearnerId
    );
    expect(promoted).toBe(0);

    const confirmed = await db
      .select()
      .from(memoryConfirmed)
      .where(eq(memoryConfirmed.learnerId, learner.id));
    expect(confirmed).toHaveLength(0);
  });

  it("promotes multiple candidates in one call", async () => {
    const { db, learner } = await setupLearner();
    const learnerId = learner.id as LearnerId;

    await db.insert(memoryCandidates).values([
      {
        learnerId: learner.id,
        category: "learning_style",
        content: "Visual learner",
        evidenceCount: MEMORY_PROMOTION_THRESHOLD,
      },
      {
        learnerId: learner.id,
        category: "time_preference",
        content: "Studies best in the evening",
        evidenceCount: MEMORY_PROMOTION_THRESHOLD + 2,
      },
      {
        learnerId: learner.id,
        category: "misconception_pattern",
        content: "Below threshold",
        evidenceCount: 2,
      },
    ]);

    const promoted = await promoteCandidates(db, learnerId);
    expect(promoted).toBe(2);

    const confirmed = await db
      .select()
      .from(memoryConfirmed)
      .where(eq(memoryConfirmed.learnerId, learner.id));
    expect(confirmed).toHaveLength(2);

    const categories = confirmed.map((c) => c.category).sort();
    expect(categories).toEqual(["learning_style", "time_preference"]);
  });

  it("sets promotedAt timestamp on promoted candidates", async () => {
    const { db, learner } = await setupLearner();
    const learnerId = learner.id as LearnerId;

    const [candidate] = await db
      .insert(memoryCandidates)
      .values({
        learnerId: learner.id,
        category: "learning_style",
        content: "Test content",
        evidenceCount: MEMORY_PROMOTION_THRESHOLD,
      })
      .returning();

    await promoteCandidates(db, learnerId);

    const [updated] = await db
      .select()
      .from(memoryCandidates)
      .where(eq(memoryCandidates.id, candidate.id));

    expect(updated.promotedAt).not.toBeNull();
  });

  it("links sourceCandidateId in confirmed memory", async () => {
    const { db, learner } = await setupLearner();
    const learnerId = learner.id as LearnerId;

    const [candidate] = await db
      .insert(memoryCandidates)
      .values({
        learnerId: learner.id,
        category: "learning_style",
        content: "Linked content",
        evidenceCount: MEMORY_PROMOTION_THRESHOLD,
      })
      .returning();

    await promoteCandidates(db, learnerId);

    const [confirmed] = await db
      .select()
      .from(memoryConfirmed)
      .where(eq(memoryConfirmed.learnerId, learner.id));

    expect(confirmed.sourceCandidateId).toBe(candidate.id);
  });
});

// ---------------------------------------------------------------------------
// inferPreferences
// ---------------------------------------------------------------------------

describe("inferPreferences", () => {
  async function setupLearnerWithQual() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    return { db, learner, qual };
  }

  function makeDate(hoursAgo: number, utcHour: number): Date {
    const now = new Date();
    const d = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    d.setUTCHours(utcHour, 0, 0, 0);
    return d;
  }

  it("returns empty for learner with no sessions", async () => {
    const { db, learner } = await setupLearnerWithQual();
    const prefs = await inferPreferences(db, learner.id as LearnerId);
    expect(prefs).toEqual([]);
  });

  it("detects preferred session length from completed sessions", async () => {
    const { db, learner } = await setupLearnerWithQual();

    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 20 + i * 5, // 20, 25, 30, 35, 40
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const sessionPref = prefs.find(
      (p) => p.key === "preferred_session_minutes"
    );
    expect(sessionPref).toBeDefined();
    expect(sessionPref!.value).toBe(30); // median of [20,25,30,35,40]
    expect(sessionPref!.source).toBe("inferred");
  });

  it("skips session length when fewer than minimum sessions", async () => {
    const { db, learner } = await setupLearnerWithQual();

    await db.insert(studySessions).values([
      {
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(24, 10),
        totalDurationMinutes: 25,
      },
      {
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(48, 10),
        totalDurationMinutes: 30,
      },
    ]);

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const sessionPref = prefs.find(
      (p) => p.key === "preferred_session_minutes"
    );
    expect(sessionPref).toBeUndefined();
  });

  it("ignores null/zero durations for session length", async () => {
    const { db, learner } = await setupLearnerWithQual();

    for (let i = 0; i < 4; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 25,
      });
    }
    // Add one with null duration
    await db.insert(studySessions).values({
      learnerId: learner.id,
      status: "completed",
      startedAt: makeDate(120, 10),
      totalDurationMinutes: null,
    });

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const sessionPref = prefs.find(
      (p) => p.key === "preferred_session_minutes"
    );
    expect(sessionPref).toBeDefined();
    expect(sessionPref!.value).toBe(25);
  });

  it("detects preferred time of day", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 5 evening sessions (UTC 19:00)
    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 19),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const timePref = prefs.find(
      (p) => p.key === "preferred_time_of_day"
    );
    expect(timePref).toBeDefined();
    expect(timePref!.value).toBe("evening");
  });

  it("classifies morning sessions correctly", async () => {
    const { db, learner } = await setupLearnerWithQual();

    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 9),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const timePref = prefs.find(
      (p) => p.key === "preferred_time_of_day"
    );
    expect(timePref!.value).toBe("morning");
  });

  it("includes abandoned sessions in time-of-day inference", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 3 abandoned afternoon + 2 completed morning sessions
    for (let i = 0; i < 3; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "abandoned",
        startedAt: makeDate(i * 24, 14),
      });
    }
    for (let i = 3; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 9),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const timePref = prefs.find(
      (p) => p.key === "preferred_time_of_day"
    );
    expect(timePref!.value).toBe("afternoon");
  });

  it("skips time of day when fewer than minimum sessions", async () => {
    const { db, learner } = await setupLearnerWithQual();

    for (let i = 0; i < 4; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 19),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const timePref = prefs.find(
      (p) => p.key === "preferred_time_of_day"
    );
    expect(timePref).toBeUndefined();
  });

  it("detects preferred block types from completed blocks", async () => {
    const { db, learner, qual } = await setupLearnerWithQual();
    const topic = qual.topics[1];

    // 3 retrieval_drill, 2 explanation, 1 worked_example = 6 total
    for (let i = 0; i < 3; i++) {
      await db.insert(studyBlocks).values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 5,
        status: "completed",
      });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(studyBlocks).values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "explanation",
        durationMinutes: 15,
        priority: 5,
        status: "completed",
      });
    }
    await db.insert(studyBlocks).values({
      learnerId: learner.id,
      topicId: topic.id,
      blockType: "worked_example",
      durationMinutes: 20,
      priority: 5,
      status: "completed",
    });

    // Need enough completed sessions for pace inference
    for (let i = 0; i < 3; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const blockPref = prefs.find(
      (p) => p.key === "preferred_block_types"
    );
    expect(blockPref).toBeDefined();
    const types = blockPref!.value as string[];
    expect(types[0]).toBe("retrieval_drill");
    expect(types).toContain("explanation");
  });

  it("skips block types when fewer than minimum blocks", async () => {
    const { db, learner, qual } = await setupLearnerWithQual();
    const topic = qual.topics[1];

    for (let i = 0; i < 4; i++) {
      await db.insert(studyBlocks).values({
        learnerId: learner.id,
        topicId: topic.id,
        blockType: "retrieval_drill",
        durationMinutes: 10,
        priority: 5,
        status: "completed",
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const blockPref = prefs.find(
      (p) => p.key === "preferred_block_types"
    );
    expect(blockPref).toBeUndefined();
  });

  it("detects intensive learning pace", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 28 sessions in last 28 days = 7/week = intensive
    for (let i = 0; i < 28; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const pacePref = prefs.find((p) => p.key === "learning_pace");
    expect(pacePref).toBeDefined();
    expect(pacePref!.value).toBe("intensive");
  });

  it("detects moderate learning pace", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 16 sessions in 28 days = 4/week = moderate
    for (let i = 0; i < 16; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 48, 10),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const pacePref = prefs.find((p) => p.key === "learning_pace");
    expect(pacePref!.value).toBe("moderate");
  });

  it("detects light learning pace", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 6 sessions in 28 days = 1.5/week = light
    for (let i = 0; i < 6; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 96, 10),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const pacePref = prefs.find((p) => p.key === "learning_pace");
    expect(pacePref!.value).toBe("light");
  });

  it("detects sporadic learning pace", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // 3 sessions all older than 28 days
    for (let i = 0; i < 3; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: new Date(
          Date.now() - (30 + i) * 24 * 60 * 60 * 1000
        ),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);
    const pacePref = prefs.find((p) => p.key === "learning_pace");
    expect(pacePref!.value).toBe("sporadic");
  });

  it("writes inferred preferences to the database", async () => {
    const { db, learner } = await setupLearnerWithQual();

    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 30,
      });
    }

    await inferPreferences(db, learner.id as LearnerId);

    const dbPrefs = await db
      .select()
      .from(learnerPreferences)
      .where(eq(learnerPreferences.learnerId, learner.id));

    expect(dbPrefs.length).toBeGreaterThan(0);

    const sessionMinutes = dbPrefs.find(
      (p) => p.key === "preferred_session_minutes"
    );
    expect(sessionMinutes).toBeDefined();
    expect(sessionMinutes!.value).toBe(30);
    expect(sessionMinutes!.source).toBe("inferred");
  });

  it("does not overwrite stated preferences", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // Pre-set a stated preference
    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: "preferred_session_minutes",
      value: 45,
      source: "stated",
    });

    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 20,
      });
    }

    const prefs = await inferPreferences(db, learner.id as LearnerId);

    // Should still detect the preference
    const sessionPref = prefs.find(
      (p) => p.key === "preferred_session_minutes"
    );
    expect(sessionPref).toBeDefined();
    expect(sessionPref!.value).toBe(20);

    // But DB should still have the stated value
    const [dbPref] = await db
      .select()
      .from(learnerPreferences)
      .where(
        and(
          eq(learnerPreferences.learnerId, learner.id),
          eq(learnerPreferences.key, "preferred_session_minutes")
        )
      );

    expect(dbPref.value).toBe(45);
    expect(dbPref.source).toBe("stated");
  });

  it("does not overwrite guardian_set preferences", async () => {
    const { db, learner } = await setupLearnerWithQual();

    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: "preferred_session_minutes",
      value: 60,
      source: "guardian_set",
    });

    for (let i = 0; i < 5; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 20,
      });
    }

    await inferPreferences(db, learner.id as LearnerId);

    const [dbPref] = await db
      .select()
      .from(learnerPreferences)
      .where(
        and(
          eq(learnerPreferences.learnerId, learner.id),
          eq(learnerPreferences.key, "preferred_session_minutes")
        )
      );

    expect(dbPref.value).toBe(60);
    expect(dbPref.source).toBe("guardian_set");
  });

  it("updates existing inferred preferences on re-run", async () => {
    const { db, learner } = await setupLearnerWithQual();

    // First run: 3 sessions of 20 min
    for (let i = 0; i < 3; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24 + 240, 10),
        totalDurationMinutes: 20,
      });
    }

    await inferPreferences(db, learner.id as LearnerId);

    const [firstPref] = await db
      .select()
      .from(learnerPreferences)
      .where(
        and(
          eq(learnerPreferences.learnerId, learner.id),
          eq(learnerPreferences.key, "preferred_session_minutes")
        )
      );
    expect(firstPref.value).toBe(20);

    // Second run: 3 more sessions of 40 min (now 6 total)
    for (let i = 0; i < 3; i++) {
      await db.insert(studySessions).values({
        learnerId: learner.id,
        status: "completed",
        startedAt: makeDate(i * 24, 10),
        totalDurationMinutes: 40,
      });
    }

    await inferPreferences(db, learner.id as LearnerId);

    const [updatedPref] = await db
      .select()
      .from(learnerPreferences)
      .where(
        and(
          eq(learnerPreferences.learnerId, learner.id),
          eq(learnerPreferences.key, "preferred_session_minutes")
        )
      );
    expect(updatedPref.value).toBe(30); // median of [20,20,20,40,40,40]
  });
});

// ---------------------------------------------------------------------------
// assembleLearnerContext
// ---------------------------------------------------------------------------

describe("assembleLearnerContext", () => {
  async function setupFullContext() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );

    const topic = qual.topics[1]; // Topic 1.1 (leaf topic)

    return { db, learner, qual, topic };
  }

  it("returns full context with all fields populated", async () => {
    const { db, learner, topic } = await setupFullContext();
    const learnerId = learner.id as LearnerId;
    const topicId = topic.id as TopicId;

    // Set up mastery
    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: topic.id,
      masteryLevel: "0.750",
    });

    // Add misconception
    await db.insert(misconceptionEvents).values({
      learnerId: learner.id,
      topicId: topic.id,
      description: "Confused diffusion with osmosis",
      severity: 2,
      resolved: false,
    });

    // Add confirmed memory
    await db.insert(memoryConfirmed).values({
      learnerId: learner.id,
      category: "learning_style",
      content: "Prefers visual diagrams",
      confirmedBy: "auto_promotion",
    });

    // Add preference
    await db.insert(learnerPreferences).values({
      learnerId: learner.id,
      key: "preferred_session_minutes",
      value: 25,
      source: "inferred",
    });

    // Add policy
    await db.insert(policies).values({
      scopeType: "learner",
      scopeId: learner.id,
      key: "session_time_limit",
      value: 30,
    });

    const context = await assembleLearnerContext(db, learnerId, topicId);

    expect(context.masteryLevel).toBe(0.75);
    expect(context.knownMisconceptions).toContain(
      "Confused diffusion with osmosis"
    );
    expect(context.confirmedMemory).toEqual([
      { category: "learning_style", content: "Prefers visual diagrams" },
    ]);
    expect(context.preferences).toEqual({ preferred_session_minutes: 25 });
    expect(context.policies).toHaveLength(1);
    expect(context.policies[0].key).toBe("session_time_limit");
  });

  it("returns masteryLevel 0 when no topic state exists", async () => {
    const { db, learner, topic } = await setupFullContext();

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.masteryLevel).toBe(0);
  });

  it("returns only unresolved misconceptions", async () => {
    const { db, learner, topic } = await setupFullContext();

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Unresolved misconception",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Resolved misconception",
        severity: 1,
        resolved: true,
        resolvedAt: new Date(),
      },
    ]);

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.knownMisconceptions).toEqual([
      "Unresolved misconception",
    ]);
  });

  it("deduplicates misconception descriptions", async () => {
    const { db, learner, topic } = await setupFullContext();

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Same misconception",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Same misconception",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic.id,
        description: "Different misconception",
        severity: 1,
        resolved: false,
      },
    ]);

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.knownMisconceptions).toHaveLength(2);
    expect(context.knownMisconceptions).toContain("Same misconception");
    expect(context.knownMisconceptions).toContain(
      "Different misconception"
    );
  });

  it("returns misconceptions only for the given topic", async () => {
    const { db, learner, qual } = await setupFullContext();
    const topic1 = qual.topics[1]; // Topic 1.1
    const topic2 = qual.topics[2]; // Topic 1.2

    await db.insert(misconceptionEvents).values([
      {
        learnerId: learner.id,
        topicId: topic1.id,
        description: "Topic 1 misconception",
        severity: 2,
        resolved: false,
      },
      {
        learnerId: learner.id,
        topicId: topic2.id,
        description: "Topic 2 misconception",
        severity: 2,
        resolved: false,
      },
    ]);

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic1.id as TopicId
    );

    expect(context.knownMisconceptions).toEqual([
      "Topic 1 misconception",
    ]);
  });

  it("returns all confirmed memories regardless of category", async () => {
    const { db, learner, topic } = await setupFullContext();

    await db.insert(memoryConfirmed).values([
      {
        learnerId: learner.id,
        category: "learning_style",
        content: "Visual learner",
        confirmedBy: "auto_promotion",
      },
      {
        learnerId: learner.id,
        category: "misconception_pattern",
        content: "Confuses X and Y",
        confirmedBy: "auto_promotion",
      },
      {
        learnerId: learner.id,
        category: "time_preference",
        content: "Studies best in the evening",
        confirmedBy: "learner",
      },
    ]);

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.confirmedMemory).toHaveLength(3);
    const categories = context.confirmedMemory.map((m) => m.category).sort();
    expect(categories).toEqual([
      "learning_style",
      "misconception_pattern",
      "time_preference",
    ]);
  });

  it("returns preferences as Record<string, unknown>", async () => {
    const { db, learner, topic } = await setupFullContext();

    await db.insert(learnerPreferences).values([
      {
        learnerId: learner.id,
        key: "preferred_session_minutes",
        value: 30,
        source: "inferred",
      },
      {
        learnerId: learner.id,
        key: "preferred_time_of_day",
        value: "evening",
        source: "inferred",
      },
      {
        learnerId: learner.id,
        key: "visual_learner",
        value: true,
        source: "stated",
      },
    ]);

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.preferences).toEqual({
      preferred_session_minutes: 30,
      preferred_time_of_day: "evening",
      visual_learner: true,
    });
  });

  it("resolves policies for the learner", async () => {
    const { db, learner, topic } = await setupFullContext();

    // Global policy
    await db.insert(policies).values({
      scopeType: "global",
      scopeId: null,
      key: "essay_generation_allowed",
      value: false,
    });

    // Learner-scoped policy (should win)
    await db.insert(policies).values({
      scopeType: "learner",
      scopeId: learner.id,
      key: "session_time_limit",
      value: 45,
    });

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.policies.length).toBeGreaterThanOrEqual(2);

    const essayPolicy = context.policies.find(
      (p) => p.key === "essay_generation_allowed"
    );
    expect(essayPolicy).toBeDefined();
    expect(essayPolicy!.value).toBe(false);

    const timePolicy = context.policies.find(
      (p) => p.key === "session_time_limit"
    );
    expect(timePolicy).toBeDefined();
    expect(timePolicy!.value).toBe(45);
    expect(timePolicy!.scopeType).toBe("learner");
  });

  it("returns empty values when no data exists", async () => {
    const { db, learner, topic } = await setupFullContext();

    const context = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      topic.id as TopicId
    );

    expect(context.masteryLevel).toBe(0);
    expect(context.knownMisconceptions).toEqual([]);
    expect(context.confirmedMemory).toEqual([]);
    expect(context.preferences).toEqual({});
    expect(context.policies).toEqual([]);
  });
});
