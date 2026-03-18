"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  enrollInQualifications,
  type EnrollmentInput,
} from "@/components/onboarding/enroll";

export async function completeOnboarding(
  learnerId: string,
  enrollments: EnrollmentInput[]
): Promise<{ error?: string }> {
  const result = await enrollInQualifications(learnerId, enrollments, db);
  if (result.error) {
    return result;
  }
  redirect("/dashboard");
}
