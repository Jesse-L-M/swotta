import { describe, expect, it } from "vitest";
import { runSourceGroundingQualitySuite } from "@/evals/suites/source-grounding-quality";

describe("runSourceGroundingQualitySuite", () => {
  it("retrieves the committed accessible sources and beats the no-retrieval baseline for every scenario", async () => {
    const suite = await runSourceGroundingQualitySuite();

    expect(suite.scenarios).toHaveLength(3);

    for (const scenario of suite.scenarios) {
      const live = scenario.variants.find(
        (variant) => variant.id === "retrieval_enabled"
      );
      const blank = scenario.variants.find(
        (variant) => variant.id === "no_source_retrieval"
      );

      expect(live?.totalScore).toBeGreaterThan(blank?.totalScore ?? 0);
      expect(
        live?.metrics.find((metric) => metric.id === "scope_safety")?.value
      ).toBe(100);
    }
  });

  it("keeps forbidden sources out of the retrieval trace", async () => {
    const suite = await runSourceGroundingQualitySuite();

    for (const scenario of suite.scenarios) {
      const live = scenario.variants.find(
        (variant) => variant.id === "retrieval_enabled"
      );
      const details = live?.details as
        | {
            retrievedSources: string[];
            forbiddenSources: string[];
          }
        | undefined;

      expect(details).toBeDefined();
      for (const forbiddenSource of details?.forbiddenSources ?? []) {
        expect(details?.retrievedSources ?? []).not.toContain(forbiddenSource);
      }
    }
  });
});
