import { describe, test, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
} from "@/test/fixtures";
import { learnerQualifications, learnerTopicState } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  validateEnrollments,
  enrollInQualifications,
  type EnrollmentInput,
} from "./enroll";

describe("validateEnrollments", () => {
  test("returns error for empty enrollments", () => {
    expect(validateEnrollments([])).toBe(
      "Select at least one qualification"
    );
  });

  test("returns error for missing qualification version", () => {
    expect(
      validateEnrollments([
        { qualificationVersionId: "", targetGrade: "7", examDate: "2026-06-15" },
      ])
    ).toBe("Missing qualification version");
  });

  test("returns error for missing exam date", () => {
    expect(
      validateEnrollments([
        { qualificationVersionId: "v1", targetGrade: "7", examDate: "" },
      ])
    ).toBe("Exam date is required for all qualifications");
  });

  test("returns error for missing target grade", () => {
    expect(
      validateEnrollments([
        { qualificationVersionId: "v1", targetGrade: "  ", examDate: "2026-06-15" },
      ])
    ).toBe("Target grade is required for all qualifications");
  });

  test("returns null for valid enrollments", () => {
    expect(
      validateEnrollments([
        { qualificationVersionId: "v1", targetGrade: "7", examDate: "2026-06-15" },
      ])
    ).toBeNull();
  });

  test("validates all enrollments in the array", () => {
    expect(
      validateEnrollments([
        { qualificationVersionId: "v1", targetGrade: "7", examDate: "2026-06-15" },
        { qualificationVersionId: "v2", targetGrade: "", examDate: "2026-06-20" },
      ])
    ).toBe("Target grade is required for all qualifications");
  });
});

describe("enrollInQualifications", () => {
  test("returns error for empty enrollments", async () => {
    const db = getTestDb();
    const result = await enrollInQualifications("some-id", [], db);
    expect(result.error).toBe("Select at least one qualification");
  });

  test("returns error for non-existent learner", async () => {
    const db = getTestDb();
    const result = await enrollInQualifications(
      "00000000-0000-0000-0000-000000000000",
      [
        {
          qualificationVersionId: "v1",
          targetGrade: "7",
          examDate: "2026-06-15",
        },
      ],
      db
    );
    expect(result.error).toBe("Learner not found");
  });

  test("creates learner qualifications without initialising topic states", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const result = await enrollInQualifications(
      learner.id,
      [
        {
          qualificationVersionId: qual.qualificationVersionId,
          targetGrade: "7",
          examDate: "2026-06-15",
        },
      ],
      db
    );

    expect(result.error).toBeUndefined();

    const enrollments = await db
      .select()
      .from(learnerQualifications)
      .where(eq(learnerQualifications.learnerId, learner.id));
    expect(enrollments.length).toBe(1);
    expect(enrollments[0].targetGrade).toBe("7");
    expect(enrollments[0].examDate).toBe("2026-06-15");
    expect(enrollments[0].diagnosticStatus).toBe("pending");

    const topicStates = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id));
    expect(topicStates.length).toBe(0);
  });

  test("creates multiple qualification enrollments", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual1 = await createTestQualification();
    const qual2 = await createTestQualification();

    const result = await enrollInQualifications(
      learner.id,
      [
        {
          qualificationVersionId: qual1.qualificationVersionId,
          targetGrade: "7",
          examDate: "2026-06-15",
        },
        {
          qualificationVersionId: qual2.qualificationVersionId,
          targetGrade: "A*",
          examDate: "2026-06-20",
        },
      ],
      db
    );

    expect(result.error).toBeUndefined();

    const enrollments = await db
      .select()
      .from(learnerQualifications)
      .where(eq(learnerQualifications.learnerId, learner.id));
    expect(enrollments.length).toBe(2);
  });

  test("leaves mastery uninitialised until diagnostic decision", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollInQualifications(
      learner.id,
      [
        {
          qualificationVersionId: qual.qualificationVersionId,
          targetGrade: "8",
          examDate: "2026-06-15",
        },
      ],
      db
    );

    const states = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.learnerId, learner.id));

    expect(states).toHaveLength(0);

    const [enrollment] = await db
      .select()
      .from(learnerQualifications)
      .where(eq(learnerQualifications.learnerId, learner.id));

    expect(enrollment.diagnosticStatus).toBe("pending");
  });

  test("trims target grade whitespace", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    await enrollInQualifications(
      learner.id,
      [
        {
          qualificationVersionId: qual.qualificationVersionId,
          targetGrade: "  7  ",
          examDate: "2026-06-15",
        },
      ],
      db
    );

    const [enrollment] = await db
      .select()
      .from(learnerQualifications)
      .where(eq(learnerQualifications.learnerId, learner.id));
    expect(enrollment.targetGrade).toBe("7");
  });

  test("handles duplicate enrollment gracefully", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();

    const enrollment: EnrollmentInput = {
      qualificationVersionId: qual.qualificationVersionId,
      targetGrade: "7",
      examDate: "2026-06-15",
    };

    await enrollInQualifications(learner.id, [enrollment], db);
    const result = await enrollInQualifications(learner.id, [enrollment], db);

    expect(result.error).toBeUndefined();

    const enrollments = await db
      .select()
      .from(learnerQualifications)
      .where(eq(learnerQualifications.learnerId, learner.id));
    expect(enrollments.length).toBe(1);
  });
});
