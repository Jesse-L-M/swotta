import { eq } from "drizzle-orm";
import { learners, learnerQualifications } from "@/db/schema";
import { initTopicStates } from "@/engine/mastery";
import type { Database } from "@/lib/db";
import type { LearnerId, QualificationVersionId } from "@/lib/types";
import { structuredLog } from "@/lib/logger";

export interface EnrollmentInput {
  qualificationVersionId: string;
  targetGrade: string;
  examDate: string;
}

export function validateEnrollments(
  enrollments: EnrollmentInput[]
): string | null {
  if (enrollments.length === 0) {
    return "Select at least one qualification";
  }
  for (const enrollment of enrollments) {
    if (!enrollment.qualificationVersionId) {
      return "Missing qualification version";
    }
    if (!enrollment.examDate) {
      return "Exam date is required for all qualifications";
    }
    if (!enrollment.targetGrade.trim()) {
      return "Target grade is required for all qualifications";
    }
  }
  return null;
}

export async function enrollInQualifications(
  learnerId: string,
  enrollments: EnrollmentInput[],
  db: Database
): Promise<{ error?: string }> {
  const validationError = validateEnrollments(enrollments);
  if (validationError) {
    return { error: validationError };
  }

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);

  if (!learner) {
    return { error: "Learner not found" };
  }

  for (const enrollment of enrollments) {
    await db
      .insert(learnerQualifications)
      .values({
        learnerId,
        qualificationVersionId: enrollment.qualificationVersionId,
        targetGrade: enrollment.targetGrade.trim(),
        examDate: enrollment.examDate,
      })
      .onConflictDoNothing();

    await initTopicStates(
      learnerId as LearnerId,
      enrollment.qualificationVersionId as QualificationVersionId,
      db
    );

    structuredLog("onboarding.qualification_enrolled", {
      learnerId,
      qualificationVersionId: enrollment.qualificationVersionId,
    });
  }

  return {};
}
