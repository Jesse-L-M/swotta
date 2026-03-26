import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { learners } from "@/db/schema";

export async function requireStudentPageAuth(
  redirectTarget: string
): Promise<void> {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }

  const [learner] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(eq(learners.userId, ctx.user.id))
    .limit(1);

  if (!learner) {
    redirect("/onboarding");
  }
}
