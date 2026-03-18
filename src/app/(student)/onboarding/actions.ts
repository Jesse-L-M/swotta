"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, learners } from "@/db/schema";
import {
  enrollInQualifications,
  type EnrollmentInput,
} from "@/components/onboarding/enroll";

export async function completeOnboarding(
  enrollments: EnrollmentInput[]
): Promise<{ error?: string }> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "Not authenticated" };

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) return { error: "User not found" };

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.userId, user.id))
    .limit(1);

  if (!learner) return { error: "Learner not found" };

  const result = await enrollInQualifications(learner.id, enrollments, db);
  if (result.error) {
    return result;
  }
  redirect("/dashboard");
}
