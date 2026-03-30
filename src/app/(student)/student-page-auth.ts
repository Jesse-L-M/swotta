import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import { learners } from "@/db/schema";
import { getNextPendingDiagnosticPath } from "@/lib/pending-diagnostics";
import type { LearnerId } from "@/lib/types";

interface RequireStudentPageAuthOptions {
  allowPendingDiagnostic?: boolean;
}

interface StudentPageAuthResult {
  learner: {
    id: string;
    displayName: string;
    yearGroup: number | null;
  };
  authContext: AuthContext;
}

function getNonLearnerRedirect(ctx: AuthContext): string {
  if (ctx.roles.some((membership) => membership.role === "guardian")) {
    return "/parent/dashboard";
  }

  return "/";
}

export async function requireStudentPageAuth(
  redirectTarget: string,
  options: RequireStudentPageAuthOptions = {}
): Promise<StudentPageAuthResult> {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }

  const [learner] = await db
    .select({
      id: learners.id,
      displayName: learners.displayName,
      yearGroup: learners.yearGroup,
    })
    .from(learners)
    .where(eq(learners.userId, ctx.user.id))
    .limit(1);

  if (!learner) {
    redirect(getNonLearnerRedirect(ctx));
  }

  if (!options.allowPendingDiagnostic) {
    const nextDiagnosticPath = await getNextPendingDiagnosticPath(
      db,
      learner.id as LearnerId
    );
    if (nextDiagnosticPath) {
      redirect(nextDiagnosticPath);
    }
  }

  return {
    learner,
    authContext: ctx,
  };
}
