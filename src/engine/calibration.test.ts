import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  enrollLearnerInQualification,
  resetFixtureCounter,
} from "@/test/fixtures";
import { confidenceEvents, learnerTopicState } from "@/db/schema";
import type { LearnerId, TopicId } from "@/lib/types";
import {
  computeCalibrationScore,
  classifyCalibration,
  computeTrend,
  generateOverallMessage,
  generateTopicMessage,
  calculateCalibration,
} from "./calibration";

beforeEach(() => {
  resetFixtureCounter();
});

// --- Pure function tests ---

describe("computeCalibrationScore", () => {
  it("returns 0 for empty array", () => {
    expect(computeCalibrationScore([])).toBe(0);
  });

  it("returns the single value for one element", () => {
    expect(computeCalibrationScore([0.2])).toBe(0.2);
  });

  it("computes the average delta", () => {
    expect(computeCalibrationScore([0.2, 0.4])).toBe(0.3);
  });

  it("handles negative deltas (underconfident)", () => {
    expect(computeCalibrationScore([-0.3, -0.1])).toBe(-0.2);
  });

  it("handles mixed deltas", () => {
    expect(computeCalibrationScore([0.2, -0.2])).toBe(0);
  });

  it("rounds to 3 decimal places", () => {
    const result = computeCalibrationScore([0.1, 0.2, 0.15]);
    const decimals = result.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(3);
  });
});

describe("classifyCalibration", () => {
  it("returns overconfident for score > 0.1", () => {
    const result = classifyCalibration(0.15);
    expect(result.overconfident).toBe(true);
    expect(result.underconfident).toBe(false);
  });

  it("returns underconfident for score < -0.1", () => {
    const result = classifyCalibration(-0.15);
    expect(result.overconfident).toBe(false);
    expect(result.underconfident).toBe(true);
  });

  it("returns neither for score near zero", () => {
    const result = classifyCalibration(0.05);
    expect(result.overconfident).toBe(false);
    expect(result.underconfident).toBe(false);
  });

  it("returns neither at exact threshold boundaries", () => {
    const atPositive = classifyCalibration(0.1);
    expect(atPositive.overconfident).toBe(false);

    const atNegative = classifyCalibration(-0.1);
    expect(atNegative.underconfident).toBe(false);
  });

  it("returns overconfident at zero boundary for score = 0", () => {
    const result = classifyCalibration(0);
    expect(result.overconfident).toBe(false);
    expect(result.underconfident).toBe(false);
  });
});

describe("computeTrend", () => {
  function makeEvents(
    deltas: number[],
    startTime = Date.now()
  ): Array<{ delta: number; createdAt: Date }> {
    return deltas.map((delta, i) => ({
      delta,
      createdAt: new Date(startTime + i * 60 * 60 * 1000),
    }));
  }

  it("returns stable for fewer than 4 events", () => {
    expect(computeTrend(makeEvents([0.3, -0.2, 0.1]))).toBe("stable");
  });

  it("returns stable for empty events", () => {
    expect(computeTrend([])).toBe("stable");
  });

  it("returns improving when recent |deltas| are smaller", () => {
    // Earlier: large deltas (0.4, 0.3), Recent: small deltas (0.05, 0.02)
    const events = makeEvents([0.4, 0.3, 0.05, 0.02]);
    expect(computeTrend(events)).toBe("improving");
  });

  it("returns declining when recent |deltas| are larger", () => {
    // Earlier: small deltas (0.02, 0.05), Recent: large deltas (0.3, 0.4)
    const events = makeEvents([0.02, 0.05, 0.3, 0.4]);
    expect(computeTrend(events)).toBe("declining");
  });

  it("returns stable when deltas are consistent", () => {
    const events = makeEvents([0.1, 0.1, 0.1, 0.1]);
    expect(computeTrend(events)).toBe("stable");
  });

  it("sorts by createdAt regardless of input order", () => {
    const now = Date.now();
    const events = [
      { delta: 0.05, createdAt: new Date(now + 3000) },
      { delta: 0.4, createdAt: new Date(now) },
      { delta: 0.02, createdAt: new Date(now + 4000) },
      { delta: 0.3, createdAt: new Date(now + 1000) },
    ];
    expect(computeTrend(events)).toBe("improving");
  });

  it("handles negative deltas for trend", () => {
    // Earlier: large negative, Recent: small negative → improving
    const events = makeEvents([-0.4, -0.3, -0.05, -0.02]);
    expect(computeTrend(events)).toBe("improving");
  });

  it("handles odd number of events", () => {
    // 5 events: earlier = [0.4, 0.3], recent = [0.05, 0.02, 0.01]
    const events = makeEvents([0.4, 0.3, 0.05, 0.02, 0.01]);
    expect(computeTrend(events)).toBe("improving");
  });
});

describe("generateOverallMessage", () => {
  it("returns 'not enough data' for 0 data points", () => {
    const msg = generateOverallMessage(0, "stable", 0);
    expect(msg).toContain("Not enough data");
  });

  it("returns underconfident message for negative score", () => {
    const msg = generateOverallMessage(-0.2, "stable", 5);
    expect(msg).toContain("underestimate");
    expect(msg).toContain("know more than you think");
  });

  it("returns overconfident message for positive score", () => {
    const msg = generateOverallMessage(0.2, "stable", 5);
    expect(msg).toContain("overestimate");
  });

  it("returns well-calibrated message for near-zero score", () => {
    const msg = generateOverallMessage(0.05, "stable", 5);
    expect(msg).toContain("well calibrated");
  });

  it("appends improving suffix", () => {
    const msg = generateOverallMessage(0.05, "improving", 5);
    expect(msg).toContain("improving over time");
  });

  it("appends declining suffix", () => {
    const msg = generateOverallMessage(0.05, "declining", 5);
    expect(msg).toContain("declining recently");
  });

  it("does not append suffix for stable trend", () => {
    const msg = generateOverallMessage(0.05, "stable", 5);
    expect(msg).not.toContain("improving");
    expect(msg).not.toContain("declining");
  });

  it("includes a self-rating number for underconfident students", () => {
    const msg = generateOverallMessage(-0.3, "stable", 5);
    expect(msg).toMatch(/\d\/5/);
  });
});

describe("generateTopicMessage", () => {
  it("returns low-data message for fewer than 2 data points", () => {
    const msg = generateTopicMessage("Genetics", 0.2, 1);
    expect(msg).toContain("1 session");
    expect(msg).toContain("need more data");
  });

  it("returns singular for exactly 1 data point", () => {
    const msg = generateTopicMessage("Genetics", 0.2, 1);
    expect(msg).toContain("1 session on Genetics");
  });

  it("returns underconfident message", () => {
    const msg = generateTopicMessage("Genetics", -0.2, 5);
    expect(msg).toContain("Underconfident on Genetics");
  });

  it("returns overconfident message", () => {
    const msg = generateTopicMessage("Ecology", 0.2, 5);
    expect(msg).toContain("Overconfident on Ecology");
  });

  it("returns well-calibrated message", () => {
    const msg = generateTopicMessage("Cell Biology", 0.05, 5);
    expect(msg).toContain("Well calibrated on Cell Biology");
  });
});

// --- Integration tests ---

describe("calculateCalibration", () => {
  async function setupTestData() {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );

    // Topic 1.1 and Topic 1.2 are leaf topics
    const topicA = qual.topics[1]; // Topic 1.1
    const topicB = qual.topics[2]; // Topic 1.2

    // Create learner topic states
    await db.insert(learnerTopicState).values([
      { learnerId: learner.id, topicId: topicA.id },
      { learnerId: learner.id, topicId: topicB.id },
    ]);

    return { db, learner, qual, topicA, topicB };
  }

  async function insertConfidenceEvent(
    db: ReturnType<typeof getTestDb>,
    learnerId: string,
    topicId: string,
    selfRated: number,
    actual: number,
    createdAt?: Date
  ) {
    const delta = selfRated - actual;
    await db.insert(confidenceEvents).values({
      learnerId,
      topicId,
      selfRated: selfRated.toFixed(3),
      actual: actual.toFixed(3),
      delta: delta.toFixed(3),
      ...(createdAt ? { createdAt } : {}),
    });
  }

  it("returns empty result when no confidence events exist", async () => {
    const { db, learner } = await setupTestData();

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.dataPoints).toBe(0);
    expect(result.overconfident).toBe(false);
    expect(result.underconfident).toBe(false);
    expect(result.calibrationScore).toBe(0);
    expect(result.trend).toBe("stable");
    expect(result.topicCalibrations).toHaveLength(0);
    expect(result.message).toContain("Not enough data");
  });

  it("detects overconfidence across multiple events", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();

    // Student rates themselves high but scores low
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.8,
      0.5,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.7,
      0.4,
      new Date(now + 1000)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.9,
      0.6,
      new Date(now + 2000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.overconfident).toBe(true);
    expect(result.underconfident).toBe(false);
    expect(result.calibrationScore).toBeGreaterThan(0.1);
    expect(result.dataPoints).toBe(3);
    expect(result.message).toContain("overestimate");
  });

  it("detects underconfidence across multiple events", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();

    // Student rates themselves low but scores high
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.3,
      0.8,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.2,
      0.7,
      new Date(now + 1000)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.4,
      0.9,
      new Date(now + 2000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.underconfident).toBe(true);
    expect(result.overconfident).toBe(false);
    expect(result.calibrationScore).toBeLessThan(-0.1);
    expect(result.message).toContain("underestimate");
    expect(result.message).toContain("know more than you think");
  });

  it("detects well-calibrated student", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();

    // Student self-assessment closely matches actual performance
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.7,
      0.72,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.58,
      new Date(now + 1000)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.8,
      0.82,
      new Date(now + 2000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.overconfident).toBe(false);
    expect(result.underconfident).toBe(false);
    expect(Math.abs(result.calibrationScore)).toBeLessThanOrEqual(0.1);
    expect(result.message).toContain("well calibrated");
  });

  it("produces per-topic calibration breakdown", async () => {
    const { db, learner, topicA, topicB } = await setupTestData();
    const now = Date.now();

    // Underconfident on topicA (genetics)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.3,
      0.8,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.2,
      0.7,
      new Date(now + 1000)
    );

    // Overconfident on topicB (ecology)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicB.id,
      0.9,
      0.5,
      new Date(now + 2000)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicB.id,
      0.8,
      0.4,
      new Date(now + 3000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.topicCalibrations).toHaveLength(2);
    expect(result.dataPoints).toBe(4);

    const topicACalib = result.topicCalibrations.find(
      (t) => t.topicId === topicA.id
    );
    const topicBCalib = result.topicCalibrations.find(
      (t) => t.topicId === topicB.id
    );

    expect(topicACalib).toBeDefined();
    expect(topicACalib!.underconfident).toBe(true);
    expect(topicACalib!.overconfident).toBe(false);
    expect(topicACalib!.dataPoints).toBe(2);
    expect(topicACalib!.topicName).toBe("Topic 1.1");
    expect(topicACalib!.message).toContain("Underconfident");

    expect(topicBCalib).toBeDefined();
    expect(topicBCalib!.overconfident).toBe(true);
    expect(topicBCalib!.underconfident).toBe(false);
    expect(topicBCalib!.dataPoints).toBe(2);
    expect(topicBCalib!.topicName).toBe("Topic 1.2");
    expect(topicBCalib!.message).toContain("Overconfident");
  });

  it("filters by topicId when provided", async () => {
    const { db, learner, topicA, topicB } = await setupTestData();
    const now = Date.now();

    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.3,
      0.8,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicB.id,
      0.9,
      0.5,
      new Date(now + 1000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId,
      topicA.id as TopicId
    );

    expect(result.dataPoints).toBe(1);
    expect(result.topicCalibrations).toHaveLength(1);
    expect(result.topicCalibrations[0].topicId).toBe(topicA.id);
  });

  it("detects improving trend when calibration gets better over time", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    // Earlier: large deltas (bad calibration)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.9,
      0.4,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.8,
      0.3,
      new Date(now + hour)
    );
    // Recent: small deltas (good calibration)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.58,
      new Date(now + 2 * hour)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.7,
      0.72,
      new Date(now + 3 * hour)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.trend).toBe("improving");
    expect(result.message).toContain("improving over time");
  });

  it("detects declining trend when calibration gets worse over time", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    // Earlier: small deltas (good calibration)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.58,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.7,
      0.72,
      new Date(now + hour)
    );
    // Recent: large deltas (bad calibration)
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.9,
      0.4,
      new Date(now + 2 * hour)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.8,
      0.3,
      new Date(now + 3 * hour)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.trend).toBe("declining");
    expect(result.message).toContain("declining recently");
  });

  it("returns stable trend with fewer than 4 events", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();

    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.3,
      0.8,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.2,
      0.7,
      new Date(now + 1000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.trend).toBe("stable");
  });

  it("returns stable trend when deltas are consistent", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.5,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.5,
      new Date(now + hour)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.5,
      new Date(now + 2 * hour)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.5,
      new Date(now + 3 * hour)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.trend).toBe("stable");
  });

  it("does not return data for a different learner", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learnerA = await createTestLearner(org.id);
    const learnerB = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const topic = qual.topics[1];
    await db.insert(learnerTopicState).values([
      { learnerId: learnerA.id, topicId: topic.id },
      { learnerId: learnerB.id, topicId: topic.id },
    ]);

    await insertConfidenceEvent(db, learnerA.id, topic.id, 0.3, 0.8);

    const result = await calculateCalibration(
      db,
      learnerB.id as LearnerId
    );

    expect(result.dataPoints).toBe(0);
    expect(result.topicCalibrations).toHaveLength(0);
  });

  it("handles single event per topic with low-data message", async () => {
    const { db, learner, topicA, topicB } = await setupTestData();
    const now = Date.now();

    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.3,
      0.8,
      new Date(now)
    );
    await insertConfidenceEvent(
      db,
      learner.id,
      topicB.id,
      0.9,
      0.5,
      new Date(now + 1000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    for (const tc of result.topicCalibrations) {
      expect(tc.dataPoints).toBe(1);
      expect(tc.message).toContain("need more data");
    }
  });

  it("handles many events for structured parent report data", async () => {
    const { db, learner, topicA, topicB } = await setupTestData();
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    // 5 events on topicA (underconfident)
    for (let i = 0; i < 5; i++) {
      await insertConfidenceEvent(
        db,
        learner.id,
        topicA.id,
        0.3,
        0.8,
        new Date(now + i * hour)
      );
    }

    // 3 events on topicB (overconfident)
    for (let i = 0; i < 3; i++) {
      await insertConfidenceEvent(
        db,
        learner.id,
        topicB.id,
        0.9,
        0.4,
        new Date(now + (5 + i) * hour)
      );
    }

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    expect(result.dataPoints).toBe(8);
    expect(result.topicCalibrations).toHaveLength(2);

    // Verify structured data fields exist for parent reports
    for (const tc of result.topicCalibrations) {
      expect(tc).toHaveProperty("topicId");
      expect(tc).toHaveProperty("topicName");
      expect(tc).toHaveProperty("calibrationScore");
      expect(tc).toHaveProperty("overconfident");
      expect(tc).toHaveProperty("underconfident");
      expect(tc).toHaveProperty("dataPoints");
      expect(tc).toHaveProperty("message");
      expect(typeof tc.calibrationScore).toBe("number");
      expect(typeof tc.overconfident).toBe("boolean");
      expect(typeof tc.underconfident).toBe("boolean");
    }

    // Overall result has correct structure
    expect(result).toHaveProperty("overconfident");
    expect(result).toHaveProperty("underconfident");
    expect(result).toHaveProperty("calibrationScore");
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("topicCalibrations");
    expect(result).toHaveProperty("dataPoints");
  });

  it("produces correct calibration score matching manual calculation", async () => {
    const { db, learner, topicA } = await setupTestData();
    const now = Date.now();

    // selfRated=0.8, actual=0.5 → delta=0.3
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.8,
      0.5,
      new Date(now)
    );
    // selfRated=0.6, actual=0.7 → delta=-0.1
    await insertConfidenceEvent(
      db,
      learner.id,
      topicA.id,
      0.6,
      0.7,
      new Date(now + 1000)
    );

    const result = await calculateCalibration(
      db,
      learner.id as LearnerId
    );

    // Average delta: (0.3 + (-0.1)) / 2 = 0.1
    expect(result.calibrationScore).toBe(0.1);
  });
});
