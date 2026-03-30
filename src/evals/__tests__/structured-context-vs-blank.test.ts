import { describe, expect, it } from "vitest";
import { runStructuredContextVsBlankSuite } from "@/evals/suites/structured-context-vs-blank";

describe("runStructuredContextVsBlankSuite", () => {
  it("scores structured context above blank context for every committed scenario", async () => {
    const suite = await runStructuredContextVsBlankSuite();

    expect(suite.scenarios).toHaveLength(3);

    for (const scenario of suite.scenarios) {
      const structured = scenario.variants.find(
        (variant) => variant.id === "structured_context"
      );
      const blank = scenario.variants.find(
        (variant) => variant.id === "blank_context"
      );

      expect(structured?.totalScore).toBeGreaterThan(blank?.totalScore ?? 0);
    }
  });

  it("keeps the structured variant source-grounded while the blank variant stays sparse", async () => {
    const suite = await runStructuredContextVsBlankSuite();
    const firstScenario = suite.scenarios[0];
    const structured = firstScenario.variants[0];
    const blank = firstScenario.variants[1];

    expect(structured.highlights.join("\n")).toContain("mock-paper-mitosis.pdf");
    expect(blank.highlights.join("\n")).toContain("Primary source cue: none");
  });
});
