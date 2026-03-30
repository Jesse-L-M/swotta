import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "@/test/setup";
import {
  createTestLearner,
  createTestOrg,
  createTestQualification,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import { learnerQualifications } from "@/db/schema";
import type { LearnerId, QualificationVersionId } from "@/lib/types";
import {
  DiagnosticStatusTransitionError,
  getNextPendingDiagnosticPath,
  setQualificationDiagnosticStatus,
} from "./pending-diagnostics";

describe("pending diagnostics", () => {
  it("returns the earliest pending diagnostic path for a learner", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const firstQualification = await createTestQualification();
    const secondQualification = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      firstQualification.qualificationVersionId
    );
    await enrollLearnerInQualification(
      learner.id,
      secondQualification.qualificationVersionId
    );

    await setQualificationDiagnosticStatus(
      db,
      learner.id as LearnerId,
      firstQualification.qualificationVersionId as QualificationVersionId,
      "completed"
    );

    await expect(
      getNextPendingDiagnosticPath(
        db,
        learner.id as LearnerId
      )
    ).resolves.toBe(
      `/diagnostic?qualificationVersionId=${secondQualification.qualificationVersionId}`
    );
  });

  it("uses compare-and-set semantics when resolving diagnostic status", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qualification.qualificationVersionId
    );

    await db
      .update(learnerQualifications)
      .set({ diagnosticStatus: "completed" })
      .where(eq(learnerQualifications.learnerId, learner.id));

    await expect(
      setQualificationDiagnosticStatus(
        db,
        learner.id as LearnerId,
        qualification.qualificationVersionId as QualificationVersionId,
        "skipped",
        { expectedCurrentStatus: "pending" }
      )
    ).rejects.toBeInstanceOf(DiagnosticStatusTransitionError);
  });
});
