import { describe, expect, it } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestLearner,
  createTestOrg,
  createTestQualification,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import {
  setQualificationDiagnosticStatus,
} from "@/lib/pending-diagnostics";
import type { LearnerId, QualificationVersionId } from "@/lib/types";
import { resolveDiagnosticPageContext } from "./diagnostic-routing";

describe("resolveDiagnosticPageContext", () => {
  it("redirects /diagnostic to the earliest pending diagnostic", async () => {
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

    await expect(
      resolveDiagnosticPageContext(
        getTestDb(),
        learner.id as LearnerId
      )
    ).resolves.toMatchObject({
      redirectTo: `/diagnostic?qualificationVersionId=${firstQualification.qualificationVersionId}`,
    });
  });

  it("redirects out-of-order qualification params back to the first pending diagnostic", async () => {
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

    await expect(
      resolveDiagnosticPageContext(
        getTestDb(),
        learner.id as LearnerId,
        secondQualification.qualificationVersionId
      )
    ).resolves.toMatchObject({
      redirectTo: `/diagnostic?qualificationVersionId=${firstQualification.qualificationVersionId}`,
    });
  });

  it("returns the current qualification context when the first pending diagnostic is requested", async () => {
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

    await expect(
      resolveDiagnosticPageContext(
        getTestDb(),
        learner.id as LearnerId,
        firstQualification.qualificationVersionId
      )
    ).resolves.toMatchObject({
      context: {
        qualificationVersionId: firstQualification.qualificationVersionId,
        qualificationName: "GCSE Test Subject",
        remainingPendingCount: 1,
      },
      redirectTo: null,
    });
  });

  it("redirects resolved diagnostics to the next pending one", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const completedQualification = await createTestQualification();
    const pendingQualification = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      completedQualification.qualificationVersionId
    );
    await enrollLearnerInQualification(
      learner.id,
      pendingQualification.qualificationVersionId
    );

    await setQualificationDiagnosticStatus(
      db,
      learner.id as LearnerId,
      completedQualification.qualificationVersionId as QualificationVersionId,
      "completed"
    );

    await expect(
      resolveDiagnosticPageContext(
        db,
        learner.id as LearnerId,
        completedQualification.qualificationVersionId
      )
    ).resolves.toMatchObject({
      redirectTo: `/diagnostic?qualificationVersionId=${pendingQualification.qualificationVersionId}`,
    });
  });

  it("falls back to the dashboard when no pending diagnostics remain", async () => {
    const db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();

    await enrollLearnerInQualification(
      learner.id,
      qualification.qualificationVersionId
    );

    await setQualificationDiagnosticStatus(
      db,
      learner.id as LearnerId,
      qualification.qualificationVersionId as QualificationVersionId,
      "skipped"
    );

    await expect(
      resolveDiagnosticPageContext(
        db,
        learner.id as LearnerId,
        qualification.qualificationVersionId
      )
    ).resolves.toMatchObject({
      context: null,
      redirectTo: "/dashboard",
    });
  });
});
