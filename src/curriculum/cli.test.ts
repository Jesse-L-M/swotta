import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApprovedCurriculumPackage } from "./test-fixtures";

const cliPath = path.resolve(process.cwd(), "src/curriculum/cli.ts");
const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");

function runCli(args: string[]) {
  return spawnSync(tsxPath, [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("curriculum CLI", () => {
  it("prints the stable command surface", () => {
    const result = runCli([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate");
    expect(result.stdout).toContain("review-report");
    expect(result.stdout).toContain("seed");
    expect(result.stdout).toContain("verify");
    expect(result.stdout).toContain("extract");
    expect(result.stdout).toContain("normalize");
  });

  it("validates a canonical package file", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-"));
    const packagePath = path.join(tempDir, "approved-package.json");

    writeFileSync(
      packagePath,
      JSON.stringify(buildApprovedCurriculumPackage(), null, 2),
      "utf8"
    );

    try {
      const result = runCli(["validate", packagePath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Status: OK");
      expect(result.stdout).toContain("Package: aqa-gcse-biology-8461");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns a stable placeholder for reserved commands", () => {
    const result = runCli(["normalize"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "normalize is not implemented yet. The command surface is reserved and stable."
    );
  });
});
