import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { qualificationVersions } from "@/db/schema";
import { getTestDb } from "@/test/setup";
import {
  buildApprovedCurriculumPackage,
  buildLegacyQualificationSeed,
} from "./test-fixtures";

const cliPath = path.resolve(process.cwd(), "src/curriculum/cli.ts");
const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
const testDatabaseUrl =
  process.env.DATABASE_TEST_URL ??
  "postgresql://swotta:swotta_test@localhost:5433/swotta_test";
const fixtureRequestPath = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__/extract-request.json"
);

function runCli(args: string[]) {
  return spawnSync(tsxPath, [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DATABASE_TEST_URL: testDatabaseUrl,
    },
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

  it("renders a review report for a legacy seed file", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-"));
    const packagePath = path.join(tempDir, "legacy-seed.json");

    writeFileSync(
      packagePath,
      JSON.stringify(buildLegacyQualificationSeed(), null, 2),
      "utf8"
    );

    try {
      const result = runCli(["review-report", packagePath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("# Curriculum Review Report");
      expect(result.stdout).toContain("Input: legacy_seed");
      expect(result.stdout).toContain("## Topic Tree Summary");
      expect(result.stdout).toContain("Cell Division");
      expect(result.stdout).toContain("Warnings:");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("extracts then normalizes a fixture draft through the CLI", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-"));
    const draftPath = path.join(tempDir, "draft.json");

    try {
      const extractResult = runCli(["extract", fixtureRequestPath]);

      expect(extractResult.status).toBe(0);
      writeFileSync(draftPath, extractResult.stdout, "utf8");

      const draft = JSON.parse(readFileSync(draftPath, "utf8")) as {
        topics: Array<{ values: { code?: string } }>;
      };
      expect(draft.topics).toHaveLength(3);
      expect(draft.topics[2]?.values.code).toBe("4.1.2");

      const normalizeResult = runCli(["normalize", draftPath]);
      expect(normalizeResult.status).toBe(0);

      const normalized = JSON.parse(normalizeResult.stdout) as {
        ok: boolean;
        package: { lifecycle: string; metadata: { packageId: string } };
      };
      expect(normalized.ok).toBe(true);
      expect(normalized.package.lifecycle).toBe("candidate");
      expect(normalized.package.metadata.packageId).toBe(
        "aqa-gcse-biology-8461"
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("suppresses package output for package-only normalization failures", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-"));
    const draftPath = path.join(tempDir, "broken-draft.json");

    try {
      const extractResult = runCli(["extract", fixtureRequestPath]);
      expect(extractResult.status).toBe(0);

      const draft = JSON.parse(extractResult.stdout) as {
        taskRules: Array<{ values: { topicRef?: string } }>;
      };
      draft.taskRules[0]!.values.topicRef = "missing-topic";
      writeFileSync(draftPath, JSON.stringify(draft, null, 2), "utf8");

      const normalizeResult = runCli([
        "normalize",
        "--package-only",
        draftPath,
      ]);

      expect(normalizeResult.status).toBe(1);
      expect(normalizeResult.stdout).toBe("");
      expect(normalizeResult.stderr).toContain(
        "normalize.task_rule_topic_unresolved"
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("seeds an approved package file through the real CLI path", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-seed-"));
    const packagePath = path.join(tempDir, "approved-package.json");

    writeFileSync(
      packagePath,
      JSON.stringify(buildApprovedCurriculumPackage(), null, 2),
      "utf8"
    );

    try {
      const result = runCli(["seed", packagePath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Seed: PASS");
      expect(result.stdout).toContain("Input: package");

      const db = getTestDb();
      const rows = await db
        .select({ count: count() })
        .from(qualificationVersions)
        .where(eq(qualificationVersions.versionCode, "8461"));
      expect(Number(rows[0]?.count ?? 0)).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("verifies a legacy seed file through the real CLI path", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "curriculum-cli-verify-"));
    const seedPath = path.join(tempDir, "legacy-seed.json");
    const legacySeed = buildLegacyQualificationSeed();
    legacySeed.versionCode = "8461-verify";

    writeFileSync(
      seedPath,
      JSON.stringify(legacySeed, null, 2),
      "utf8"
    );

    try {
      const result = runCli(["verify", seedPath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Verify: PASS");
      expect(result.stdout).toContain("Input: legacy_seed");
      expect(result.stdout).toContain("PASS repeat seed is idempotent");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
