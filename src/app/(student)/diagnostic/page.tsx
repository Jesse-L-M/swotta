import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStudentPageAuth } from "../student-page-auth";
import type { LearnerId } from "@/lib/types";
import DiagnosticPageClient from "./diagnostic-page-client";
import { resolveDiagnosticPageContext } from "./diagnostic-routing";

interface DiagnosticPageProps {
  searchParams: Promise<{
    qualificationVersionId?: string;
  }>;
}

export default async function DiagnosticPage({
  searchParams,
}: DiagnosticPageProps) {
  const { qualificationVersionId } = await searchParams;
  const redirectTarget = qualificationVersionId
    ? `/diagnostic?qualificationVersionId=${encodeURIComponent(qualificationVersionId)}`
    : "/diagnostic";

  const { learner } = await requireStudentPageAuth(redirectTarget, {
    allowPendingDiagnostic: true,
  });

  const resolution = await resolveDiagnosticPageContext(
    db,
    learner.id as LearnerId,
    qualificationVersionId
  );

  if (resolution.redirectTo) {
    redirect(resolution.redirectTo);
  }

  if (!resolution.context) {
    redirect("/dashboard");
  }

  return <DiagnosticPageClient {...resolution.context} />;
}
