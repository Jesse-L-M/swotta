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
    ]);
  });
});
