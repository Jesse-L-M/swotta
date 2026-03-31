import { describe, expect, it } from "vitest";
import type { TopicId } from "@/lib/types";
import {
  clusterMisconceptionEvents,
  type MisconceptionClusterSourceEvent,
} from "./misconception-clustering";

function event(
  id: string,
  topicId: string,
  topicName: string,
  description: string,
  overrides: Partial<MisconceptionClusterSourceEvent> = {},
): MisconceptionClusterSourceEvent {
  return {
    eventId: id,
    topicId: topicId as TopicId,
    topicName,
    description,
    severity: overrides.severity ?? 2,
    createdAt: overrides.createdAt ?? new Date("2026-03-30T10:00:00Z"),
    misconceptionRuleId: overrides.misconceptionRuleId ?? null,
    ruleDescription: overrides.ruleDescription ?? null,
    triggerPatterns: overrides.triggerPatterns ?? [],
  };
}

describe("clusterMisconceptionEvents", () => {
  it("clusters exact normalized descriptions across topics", () => {
    const clusters = clusterMisconceptionEvents([
      event(
        "event-1",
        "topic-1",
        "Cell transport",
        "Confuses osmosis with diffusion",
      ),
      event(
        "event-2",
        "topic-2",
        "Leaf structure",
        "confuses osmosis with diffusion!",
      ),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].strategy).toBe("normalized_description");
    expect(clusters[0].rootCauseLabel).toBe("Confuses osmosis with diffusion");
    expect(clusters[0].memberTopics.map((topic) => topic.topicName)).toEqual([
      "Cell transport",
      "Leaf structure",
    ]);
  });

  it("prefers rule lineage when descriptions vary but the seeded misconception matches", () => {
    const clusters = clusterMisconceptionEvents([
      event(
        "event-1",
        "topic-1",
        "Photosynthesis",
        "Thinks chlorophyll stores energy for later use",
        {
          misconceptionRuleId: "rule-a",
          ruleDescription: "Confuses chlorophyll with glucose",
        },
      ),
      event(
        "event-2",
        "topic-2",
        "Respiration",
        "Treats chlorophyll as the substance released by respiration",
        {
          misconceptionRuleId: "rule-b",
          ruleDescription: "Confuses chlorophyll with glucose",
        },
      ),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].strategy).toBe("rule_lineage");
    expect(clusters[0].rootCauseLabel).toBe("Confuses chlorophyll with glucose");
    expect(clusters[0].explanation).toContain("same misconception rule");
  });

  it("clusters explicit comparison-pattern confusions across topics", () => {
    const clusters = clusterMisconceptionEvents([
      event(
        "event-1",
        "topic-1",
        "Variables",
        "Confuses independent and dependent variables",
      ),
      event(
        "event-2",
        "topic-2",
        "Data analysis",
        "Mixes up dependent and independent variables",
      ),
      event(
        "event-3",
        "topic-3",
        "Bonding",
        "Assumes pressure rises when volume falls",
      ),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].strategy).toBe("comparison_pattern");
    expect(clusters[0].rootCauseLabel).toBe(
      "Confusion between dependent variable and independent variable",
    );
    expect(clusters[0].signal.totalEvents).toBe(2);
  });

  it("stays conservative when two concepts recur without an explicit comparison pattern", () => {
    const clusters = clusterMisconceptionEvents([
      event(
        "event-1",
        "topic-1",
        "Gas laws",
        "Pressure rises as volume falls in Boyle law questions",
      ),
      event(
        "event-2",
        "topic-2",
        "Particle model",
        "Volume changes when pressure increases in a sealed container",
      ),
    ]);

    expect(clusters).toEqual([]);
  });
});
