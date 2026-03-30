import { and, asc, eq } from "drizzle-orm";
import { learnerQualifications } from "@/db/schema";
import type { Database } from "@/lib/db";
import type { LearnerId, QualificationVersionId } from "@/lib/types";

export type QualificationDiagnosticStatus =
  | "pending"
  | "completed"
  | "skipped";

export class DiagnosticStatusTransitionError extends Error {
  constructor(message = "Diagnostic has already been resolved.") {
    super(message);
    this.name = "DiagnosticStatusTransitionError";
  }
}

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
  diagnosticStatus: QualificationDiagnosticStatus,
  options: {
    expectedCurrentStatus?: QualificationDiagnosticStatus;
  } = {}
): Promise<void> {
  const conditions = [
    eq(learnerQualifications.learnerId, learnerId),
    eq(learnerQualifications.status, "active"),
    eq(
      learnerQualifications.qualificationVersionId,
      qualificationVersionId
    ),
  ];

  if (options.expectedCurrentStatus) {
    conditions.push(
      eq(
        learnerQualifications.diagnosticStatus,
        options.expectedCurrentStatus
      )
    );
  }

  const updated = await db
    .update(learnerQualifications)
    .set({ diagnosticStatus })
    .where(and(...conditions))
    .returning({ id: learnerQualifications.id });

  if (updated.length > 0) {
    return;
  }

  if (options.expectedCurrentStatus) {
    throw new DiagnosticStatusTransitionError(
      `Diagnostic status transition expected ${options.expectedCurrentStatus} for learner ${learnerId} and qualification ${qualificationVersionId}`
    );
  }

  throw new Error(
    `Learner qualification not found for learner ${learnerId} and qualification ${qualificationVersionId}`
  );
}
