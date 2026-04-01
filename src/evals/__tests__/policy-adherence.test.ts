import { describe, expect, it } from "vitest";
import { runPolicyAdherenceSuite } from "@/evals/suites/policy-adherence";

describe("runPolicyAdherenceSuite", () => {
  it("resolves the committed winning policies and beats the policyless baseline for every scenario", async () => {
    const suite = await runPolicyAdherenceSuite();

    expect(suite.scenarios).toHaveLength(3);

    for (const scenario of suite.scenarios) {
      const live = scenario.variants.find(
        (variant) => variant.id === "resolved_policy_context"
      );
      const baseline = scenario.variants.find(
        (variant) => variant.id === "policyless_baseline"
      );

      expect(live?.totalScore).toBeGreaterThan(baseline?.totalScore ?? 0);
      expect(
        live?.metrics.find((metric) => metric.id === "resolution_accuracy")?.value
      ).toBe(100);
    }
  });

  it("surfaces the expected org, class, qualification, and learner winners in the prompt trace", async () => {
    const suite = await runPolicyAdherenceSuite();
    const combinedHighlights = suite.scenarios
      .flatMap((scenario) => scenario.variants[0]?.highlights ?? [])
      .join("\n");

    expect(combinedHighlights).toContain("essay_generation_mode -> org");
    expect(combinedHighlights).toContain("paper_focus -> class");
    expect(combinedHighlights).toContain("command_word_emphasis -> qualification");
    expect(combinedHighlights).toContain("difficulty_override -> learner: foundational");
    expect(combinedHighlights).not.toContain("stretch");
  });
});
