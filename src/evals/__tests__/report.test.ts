import { describe, expect, it } from "vitest";
import { formatHumanReport, runEvalSuites } from "@/evals";

describe("eval reporting", () => {
  it("builds a combined report for both committed suites", async () => {
    const report = await runEvalSuites("all", "2026-03-30T12:00:00.000Z");
    const human = formatHumanReport(report);

    expect(report.suiteCount).toBe(2);
    expect(human).toContain("Swotta eval report");
    expect(human).toContain("Structured Context vs Blank Context");
    expect(human).toContain("Scheduler Quality vs Baselines");
    expect(human).toContain("What this does not prove");
  });
});
