"use client";

import { useParams, useRouter } from "next/navigation";
import { SessionView } from "@/components/session";

export default function SessionPage() {
  const params = useParams<{ blockId: string }>();
  const router = useRouter();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <SessionView
        blockId={params.blockId}
        onNextBlock={() => router.push("/dashboard")}
        onBackToDashboard={() => router.push("/dashboard")}
      />
    </div>
  );
}
