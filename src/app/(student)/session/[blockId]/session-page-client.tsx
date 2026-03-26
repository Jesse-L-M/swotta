"use client";

import { useRouter } from "next/navigation";
import { SessionView } from "@/components/session";

interface SessionPageClientProps {
  blockId: string;
}

export function SessionPageClient({ blockId }: SessionPageClientProps) {
  const router = useRouter();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <SessionView
        blockId={blockId}
        onNextBlock={() => router.push("/dashboard")}
        onBackToDashboard={() => router.push("/dashboard")}
      />
    </div>
  );
}
