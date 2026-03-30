"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { learners } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { getNextPendingDiagnosticPath } from "@/lib/pending-diagnostics";
import {
  enrollInQualifications,
  type EnrollmentInput,
} from "@/components/onboarding/enroll";
import type { LearnerId } from "@/lib/types";

const enrollmentSchema = z.array(
  z.object({
    qualificationVersionId: z.string().uuid(),
    targetGrade: z.string().min(1).max(10),
    examDate: z.string().refine(
      (d) => !isNaN(new Date(d + "T00:00:00").getTime()),
      { message: "Invalid date" }
    ),
  })
).min(1, { message: "Select at least one qualification" });

export async function completeOnboarding(
  enrollments: EnrollmentInput[]
): Promise<{ error?: string }> {
  const parsed = enrollmentSchema.safeParse(enrollments);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ctx = await getAuthContext();
  if (!ctx) return { error: "Not authenticated" };

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.userId, ctx.user.id))
    .limit(1);

  if (!learner) return { error: "Learner not found" };

  const result = await enrollInQualifications(learner.id, enrollments, db);
  if (result.error) {
    return result;
  }
  const nextDiagnosticPath = await getNextPendingDiagnosticPath(
    db,
    learner.id as LearnerId
  );
  redirect(nextDiagnosticPath ?? "/dashboard");
}
