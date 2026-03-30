import { describe, expect, it } from "vitest";
import { runSchedulerQualitySuite } from "@/evals/suites/scheduler-quality";

describe("runSchedulerQualitySuite", () => {
  it("returns all three scheduler variants for each committed scenario", async () => {
    const suite = await runSchedulerQualitySuite();

    expect(suite.scenarios).toHaveLength(3);

    for (const scenario of suite.scenarios) {
      expect(scenario.variants.map((variant) => variant.id)).toEqual([
        "swotta",
        "random",
        "overdue_only",
      ]);
    }
  });

  it("beats the random baseline on weighted mastery gain and urgent-gap timing in the committed fixtures", async () => {
    const suite = await runSchedulerQualitySuite();

    for (const scenario of suite.scenarios) {
      const swotta = scenario.variants[0];
      const random = scenario.variants[1];

      const swottaGain = swotta.metrics.find(
        (metric) => metric.id === "weighted_mastery_gain"
      )?.value;
      const randomGain = random.metrics.find(
        (metric) => metric.id === "weighted_mastery_gain"
      )?.value;
      const swottaUrgentLeadTime = swotta.metrics.find(
        (metric) => metric.id === "urgent_gap_lead_time"
      )?.value;
      const randomUrgentLeadTime = random.metrics.find(
        (metric) => metric.id === "urgent_gap_lead_time"
      )?.value;

      expect(swottaGain).toBeGreaterThan(randomGain ?? 0);
      expect(swottaUrgentLeadTime).toBeLessThan(randomUrgentLeadTime ?? Infinity);
    }
  });
});
