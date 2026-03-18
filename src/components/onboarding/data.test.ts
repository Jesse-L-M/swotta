import { describe, test, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import { createTestQualification } from "@/test/fixtures";
import { loadSubjects, loadQualificationOptions } from "./data";

describe("loadSubjects", () => {
  test("returns empty array when no subjects exist", async () => {
    const db = getTestDb();
    const result = await loadSubjects(db);
    expect(result).toEqual([]);
  });

  test("returns subjects with id, name, slug", async () => {
    const db = getTestDb();
    await createTestQualification();

    const result = await loadSubjects(db);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("slug");
  });

  test("returns subjects ordered by name", async () => {
    const db = getTestDb();
    await createTestQualification();

    const result = await loadSubjects(db);
    if (result.length > 1) {
      for (let i = 1; i < result.length; i++) {
        expect(result[i].name >= result[i - 1].name).toBe(true);
      }
    }
  });
});

describe("loadQualificationOptions", () => {
  test("returns empty array when no qualifications exist", async () => {
    const db = getTestDb();
    const result = await loadQualificationOptions(db);
    expect(result).toEqual([]);
  });

  test("returns qualifications with all joined fields", async () => {
    const db = getTestDb();
    await createTestQualification();

    const result = await loadQualificationOptions(db);
    expect(result.length).toBeGreaterThan(0);

    const q = result[0];
    expect(q.qualificationVersionId).toBeTruthy();
    expect(q.qualificationName).toBeTruthy();
    expect(q.subjectId).toBeTruthy();
    expect(q.subjectName).toBeTruthy();
    expect(q.examBoardCode).toBeTruthy();
    expect(q.examBoardName).toBeTruthy();
    expect(q.level).toBeTruthy();
    expect(q.versionCode).toBeTruthy();
  });

  test("returns qualifications from multiple boards", async () => {
    const db = getTestDb();
    await createTestQualification();
    await createTestQualification();

    const result = await loadQualificationOptions(db);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
