import DiagnosticPageClient from "./diagnostic-page-client";
import { requireStudentPageAuth } from "../student-page-auth";

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

  await requireStudentPageAuth(redirectTarget);

  return <DiagnosticPageClient />;
}
