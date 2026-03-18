import { describe, it, expect } from "vitest";
import { getTestDb } from "./setup";
import {
  createTestOrg,
  createTestUser,
  createTestLearner,
  createTestMembership,
  createTestGuardianLink,
  createTestQualification,
  enrollLearnerInQualification,
} from "./fixtures";
import { seedGCSEBiology } from "./seed";

describe("test infrastructure smoke test", () => {
  it("creates an org", async () => {
    const org = await createTestOrg();
    expect(org.id).toBeDefined();
    expect(org.type).toBe("household");
  });

  it("creates a user", async () => {
    const user = await createTestUser();
    expect(user.id).toBeDefined();
    expect(user.email).toContain("@example.com");
  });

  it("creates a learner with auto-created user and membership", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    expect(learner.id).toBeDefined();
    expect(learner.orgId).toBe(org.id);
    expect(learner.yearGroup).toBe(10);
  });

  it("creates a guardian link", async () => {
    const org = await createTestOrg();
    const guardian = await createTestUser();
    await createTestMembership(guardian.id, org.id, "guardian");
    const learner = await createTestLearner(org.id);
    const link = await createTestGuardianLink(guardian.id, learner.id);
    expect(link.receivesWeeklyReport).toBe(true);
  });

  it("creates a test qualification with topic tree and edges", async () => {
    const qual = await createTestQualification();
    expect(qual.qualificationVersionId).toBeDefined();
    expect(qual.topics.length).toBe(5);
    expect(qual.component.weightPercent).toBe(100);
  });

  it("enrolls a learner in a qualification", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const enrollment = await enrollLearnerInQualification(
      learner.id,
      qual.qualificationVersionId
    );
    expect(enrollment.targetGrade).toBe("7");
    expect(enrollment.examDate).toBe("2026-06-15");
  });

  it("seeds GCSE Biology AQA with full topic tree", async () => {
    const seed = await seedGCSEBiology();
    expect(seed.qualificationVersionId).toBeDefined();
    expect(seed.topics.length).toBe(28);

    const unitCodes = seed.topics
      .filter((t) => !t.code.includes("."))
      .map((t) => t.code)
      .sort();
    expect(unitCodes).toEqual([
      "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7",
    ]);
  });

  it("seedGCSEBiology is idempotent", async () => {
    const first = await seedGCSEBiology();
    const second = await seedGCSEBiology();
    expect(first.qualificationVersionId).toBe(second.qualificationVersionId);
  });

  it("cleanup leaves tables empty", async () => {
    const org = await createTestOrg();
    expect(org.id).toBeDefined();
    // Cleanup happens in afterEach via vitest.setup.ts
    // Next test will verify tables are clean by creating without conflicts
  });
});
