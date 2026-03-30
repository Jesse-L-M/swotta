import { and, asc, eq } from "drizzle-orm";
import { learnerQualifications } from "@/db/schema";
import type { Database } from "@/lib/db";
import type { LearnerId, QualificationVersionId } from "@/lib/types";

export type QualificationDiagnosticStatus =
  | "pending"
  | "completed"
  | "skipped";

export function buildDiagnosticPath(
  qualificationVersionId: QualificationVersionId
): string {
  return `/diagnostic?qualificationVersionId=${encodeURIComponent(
    qualificationVersionId
  )}`;
}

export async function getQualificationDiagnosticStatus(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<QualificationDiagnosticStatus | null> {
  const [row] = await db
    .select({
      diagnosticStatus: learnerQualifications.diagnosticStatus,
    })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active"),
        eq(
          learnerQualifications.qualificationVersionId,
          qualificationVersionId
        )
      )
    )
    .limit(1);

  return row?.diagnosticStatus ?? null;
}

export async function getNextPendingDiagnosticPath(
  db: Database,
  learnerId: LearnerId
): Promise<string | null> {
  const [row] = await db
    .select({
      qualificationVersionId: learnerQualifications.qualificationVersionId,
    })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active"),
        eq(learnerQualifications.diagnosticStatus, "pending")
      )
    )
    .orderBy(
      asc(learnerQualifications.createdAt),
      asc(learnerQualifications.qualificationVersionId)
    )
    .limit(1);

  return row
    ? buildDiagnosticPath(
        row.qualificationVersionId as QualificationVersionId
      )
    : null;
}

export async function setQualificationDiagnosticStatus(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  diagnosticStatus: QualificationDiagnosticStatus
): Promise<void> {
  const updated = await db
    .update(learnerQualifications)
    .set({ diagnosticStatus })
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active"),
        eq(
          learnerQualifications.qualificationVersionId,
          qualificationVersionId
        )
      )
    )
    .returning({ id: learnerQualifications.id });

  if (updated.length === 0) {
    throw new Error(
      `Learner qualification not found for learner ${learnerId} and qualification ${qualificationVersionId}`
    );
  }
}
