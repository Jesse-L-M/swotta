import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { learners, learnerQualifications } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { loadSubjects, loadQualificationOptions } from "@/components/onboarding/data";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.userId, ctx.user.id))
    .limit(1);

  if (!learner) redirect("/login");

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
