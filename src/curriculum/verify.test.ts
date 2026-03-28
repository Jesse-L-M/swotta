import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qualificationVersions } from "@/db/schema";
import { getTestDb } from "@/test/setup";
import { buildApprovedCurriculumPackage } from "./test-fixtures";

describe("curriculum verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs downstream verification against the real seeded data", async () => {
    const db = getTestDb();
    const { verifyCurriculumInput } = await import("./verify");

    const result = await verifyCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry_run");
    expect(result.normalizedFrom).toBe("package");
    expect(result.limitations).toContain(
      "Source verification uses synthetic source artifacts and the coverage query. It does not re-run extraction, chunking, embeddings, or classifier mapping."
    );
    expect(result.checks).toEqual([
      expect.objectContaining({ name: "package validates", ok: true }),
      expect.objectContaining({ name: "seed succeeds", ok: true }),
      expect.objectContaining({ name: "topic tree loads", ok: true }),
      expect.objectContaining({ name: "curriculum queries cohere", ok: true }),
      expect.objectContaining({
        name: "repeat seed is idempotent",
        ok: true,
      }),
      expect.objectContaining({
        name: "scheduler assumptions cohere",
        ok: true,
      }),
      expect.objectContaining({
        name: "synthetic source coverage query sees mapped topics",
        ok: true,
      }),
    ]);

    const rows = await db
      .select({ count: count() })
      .from(qualificationVersions)
      .where(eq(qualificationVersions.versionCode, "8461"));
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it("rolls the dry-run seed back when a downstream check fails", async () => {
    const db = getTestDb();
    vi.resetModules();

    const diagnostic = await import("@/engine/diagnostic");
    vi.spyOn(diagnostic, "getQualificationName").mockRejectedValueOnce(
      new Error("forced downstream failure")
    );

    const { verifyCurriculumInput } = await import("./verify");
    const result = await verifyCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "curriculum queries cohere",
        ok: false,
        detail: "forced downstream failure",
      })
    );

    const rows = await db
      .select({ count: count() })
      .from(qualificationVersions)
      .where(eq(qualificationVersions.versionCode, "8461"));
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });
});
