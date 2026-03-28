import { describe, expect, it } from "vitest";
import { getTestDb } from "@/test/setup";
import { verifyCurriculumInput } from "./verify";
import { buildApprovedCurriculumPackage } from "./test-fixtures";

describe("curriculum verification", () => {
  it("runs downstream verification against the real seeded data", async () => {
    const db = getTestDb();

    const result = await verifyCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedFrom).toBe("package");
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
        name: "source coverage assumptions cohere",
        ok: true,
      }),
    ]);
  });

  it("fails verification when the requested package no longer matches seeded data", async () => {
    const db = getTestDb();
    const original = buildApprovedCurriculumPackage();
    const changed = buildApprovedCurriculumPackage();
    changed.questionTypes[0].description = "Changed after the first seed";

    const first = await verifyCurriculumInput(original, { db });
    expect(first.ok).toBe(true);

    const second = await verifyCurriculumInput(changed, { db });
    expect(second.ok).toBe(false);
    expect(second.checks).toContainEqual(
      expect.objectContaining({
        name: "seed succeeds",
        ok: false,
      })
    );
  });
});
