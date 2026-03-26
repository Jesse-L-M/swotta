import { requireStudentPageAuth } from "../../student-page-auth";
import { SessionPageClient } from "./session-page-client";

interface SessionPageProps {
  params: Promise<{
    blockId: string;
  }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { blockId } = await params;
  await requireStudentPageAuth(`/session/${blockId}`);
  return <SessionPageClient blockId={blockId} />;
}
