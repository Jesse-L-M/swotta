import { describe, expect, it } from "vitest";
import { runPastPaperAwareTutoringSuite } from "@/evals/suites/past-paper-aware-tutoring";

describe("runPastPaperAwareTutoringSuite", () => {
  it("beats the fallback exam-guidance path for every committed past-paper scenario", async () => {
    const suite = await runPastPaperAwareTutoringSuite();

    expect(suite.scenarios).toHaveLength(3);

    for (const scenario of suite.scenarios) {
      const live = scenario.variants.find(
        (variant) => variant.id === "past_paper_intelligence"
      );
      const fallback = scenario.variants.find(
        (variant) => variant.id === "fallback_exam_guidance"
      );

      expect(live?.totalScore).toBeGreaterThan(fallback?.totalScore ?? 0);
      expect(
        live?.metrics.find((metric) => metric.id === "reference_question_grounding")
          ?.value
      ).toBe(100);
    }
  });

  it("keeps real command words and signal labels visible in the exam-intelligence trace", async () => {
    const suite = await runPastPaperAwareTutoringSuite();
    const combinedHighlights = suite.scenarios
      .flatMap((scenario) => scenario.variants[0]?.highlights ?? [])
      .join("\n");

    expect(combinedHighlights).toContain("Question types: Multiple choice");
    expect(combinedHighlights).toContain("Point-plus-reason explanation");
    expect(combinedHighlights).toContain("Balanced judgement");
  });
});
