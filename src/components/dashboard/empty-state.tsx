import { BookOpen } from "lucide-react";

interface EmptyStateProps {
  learnerName: string;
}

export function EmptyState({ learnerName }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-[#E8E4DB] bg-white px-6 py-12 text-center shadow-sm sm:px-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50">
        <BookOpen className="h-8 w-8 text-teal-600" />
      </div>
      <h1 className="mt-6 font-[family-name:var(--font-serif)] text-2xl text-[#1A1A2E]">
        Welcome to Swotta, {learnerName}
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-[#6B7280]">
        Add your subjects and exam dates first. Once that is in place, Swotta
        can build a queue that tells you what to do next, why it matters today,
        and how it connects to your exams.
      </p>
      <div className="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
        <div className="rounded-xl bg-[#F8F6F1] p-4">
          <p className="text-sm font-medium text-[#1A1A2E]">
            1. Tell us what you study
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Add your qualifications so the dashboard knows what should be in
            scope.
          </p>
        </div>
        <div className="rounded-xl bg-[#F8F6F1] p-4">
          <p className="text-sm font-medium text-[#1A1A2E]">
            2. Set your exam dates
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            This lets the queue explain when something is urgent and why it is
            worth doing now.
          </p>
        </div>
        <div className="rounded-xl bg-[#F8F6F1] p-4">
          <p className="text-sm font-medium text-[#1A1A2E]">
            3. Get your first study plan
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Your dashboard will turn that setup into clear next actions instead
            of a blank page.
          </p>
        </div>
      </div>
      <a
        href="/onboarding"
        className="mt-6 inline-flex items-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        Get started
      </a>
    </div>
  );
}
