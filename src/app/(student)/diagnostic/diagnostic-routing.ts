import { and, asc, eq } from "drizzle-orm";
import {
  learnerQualifications,
  qualificationVersions,
  qualifications,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import { buildDiagnosticPath } from "@/lib/pending-diagnostics";
import type { LearnerId, QualificationVersionId } from "@/lib/types";

export interface DiagnosticPageContext {
  qualificationVersionId: QualificationVersionId;
  qualificationName: string;
  remainingPendingCount: number;
}

interface DiagnosticPageResolution {
  context: DiagnosticPageContext | null;
  redirectTo: string | null;
}

export async function resolveDiagnosticPageContext(
  db: Database,
  learnerId: LearnerId,
  requestedQualificationVersionId?: string
): Promise<DiagnosticPageResolution> {
  const activeQualifications = await db
    .select({
      qualificationVersionId: learnerQualifications.qualificationVersionId,
      diagnosticStatus: learnerQualifications.diagnosticStatus,
      qualificationName: qualifications.name,
    })
    .from(learnerQualifications)
    .innerJoin(
      qualificationVersions,
      eq(
        learnerQualifications.qualificationVersionId,
        qualificationVersions.id
      )
    )
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active")
      )
    )
    .orderBy(
      asc(learnerQualifications.createdAt),
      asc(learnerQualifications.qualificationVersionId)
    );

  const pendingQualifications = activeQualifications.filter(
    (qualification) => qualification.diagnosticStatus === "pending"
  );

  const currentQualification = pendingQualifications[0];
  if (!currentQualification) {
    return {
      context: null,
      redirectTo: "/dashboard",
    };
  }

  if (
    requestedQualificationVersionId !== currentQualification.qualificationVersionId
  ) {
    return {
      context: null,
      redirectTo: buildDiagnosticPath(
        currentQualification.qualificationVersionId as QualificationVersionId
      ),
    };
  }

  return {
    context: {
      qualificationVersionId:
        currentQualification.qualificationVersionId as QualificationVersionId,
      qualificationName: currentQualification.qualificationName,
      remainingPendingCount: pendingQualifications.length - 1,
    },
    redirectTo: null,
  };
}
