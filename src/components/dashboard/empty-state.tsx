import { BookOpen } from "lucide-react";

interface EmptyStateProps {
  learnerName: string;
}

export function EmptyState({ learnerName }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50">
        <BookOpen className="h-8 w-8 text-teal-600" />
      </div>
      <h1 className="mt-6 font-[family-name:var(--font-serif)] text-2xl text-[#1A1A2E]">
        Welcome to Swotta, {learnerName}
      </h1>
      <p className="mt-2 max-w-md text-[#6B7280]">
        Let&apos;s get you set up. Add your subjects and exam dates so we can
        build your personalised study plan.
      </p>
      <a
        href="/onboarding"
        className="mt-6 inline-flex items-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        Get started
      </a>
    </div>
  );
}
