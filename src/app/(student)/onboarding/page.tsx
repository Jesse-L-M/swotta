import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, learners, learnerQualifications } from "@/db/schema";
import { loadSubjects, loadQualificationOptions } from "@/components/onboarding/data";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) redirect("/sign-in");

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.userId, user.id))
    .limit(1);

  if (!learner) redirect("/sign-in");

  const existingQuals = await db
    .select({ id: learnerQualifications.id })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learner.id),
        eq(learnerQualifications.status, "active")
      )
    )
    .limit(1);

  if (existingQuals.length > 0) {
    redirect("/dashboard");
  }

  const [subjectList, qualificationOptions] = await Promise.all([
    loadSubjects(db),
    loadQualificationOptions(db),
  ]);

  return (
    <OnboardingWizard
      subjects={subjectList}
      qualifications={qualificationOptions}
    />
  );
}
