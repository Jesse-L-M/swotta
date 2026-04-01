import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";

function runEvalCli(args: string[]): string {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  return execFileSync(npmCommand, ["run", "--silent", "evals", "--", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
  });
}

describe("evals CLI smoke", () => {
  it("runs the default npm script path without writing artifacts", () => {
    const output = runEvalCli(["--no-write"]);

    expect(output).toContain("Swotta eval report");
    expect(output).toContain("Structured Context vs Blank Context");
    expect(output).toContain("Scheduler Quality vs Baselines");
    expect(output).toContain("Source Grounding Quality");
    expect(output).toContain("Policy Adherence");
    expect(output).toContain("Past-Paper-Aware Tutoring");
  });

  it("runs a named suite invocation through the npm script", () => {
    const output = runEvalCli([
      "structured-context-vs-blank",
      "--no-write",
      "--format",
      "json",
    ]);
    const report = JSON.parse(output) as {
      suiteCount: number;
      suites: Array<{ id: string }>;
    };

    expect(report.suiteCount).toBe(1);
    expect(report.suites[0]?.id).toBe("structured-context-vs-blank");
  });
});
