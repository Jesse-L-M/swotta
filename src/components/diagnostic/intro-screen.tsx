"use client";

interface IntroScreenProps {
  onStart: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string | null;
}

export function IntroScreen({
  onStart,
  onSkip,
  loading,
  error,
}: IntroScreenProps) {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center px-4"
      data-testid="diagnostic-intro"
    >
      <div className="max-w-lg text-center">
        <h1 className="font-[family-name:var(--font-serif)] text-[2.5rem] leading-[1.2] tracking-[-0.01em] text-[#1A1917]">
          Let&apos;s see what you already know
        </h1>
        <p className="mt-6 text-[1.125rem] leading-[1.7] text-[#5C5950]">
          Before we build your study plan, we&apos;ll have a quick conversation
          about each major topic area. This helps Swotta understand where
          you&apos;re strong and where to focus your time.
        </p>
        <p className="mt-3 text-[0.875rem] leading-[1.5] text-[#949085]">
          Takes about 10&ndash;15 minutes. No wrong answers &mdash; just tell us
          what you know.
        </p>

        {error && (
          <div
            className="mt-6 rounded-[8px] border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-left text-[0.875rem] text-[#D4654A]"
            data-testid="intro-error"
          >
            {error}
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={onStart}
            disabled={loading}
            className="rounded-[8px] bg-[#2D7A6E] px-8 py-3 text-base font-medium text-white transition-colors duration-150 hover:bg-[#256b60] disabled:opacity-50"
            data-testid="start-btn"
          >
            {loading ? "Starting..." : "Start diagnostic"}
          </button>
          <button
            onClick={onSkip}
            disabled={loading}
            className="text-[0.875rem] text-[#949085] underline-offset-2 transition-colors duration-150 hover:text-[#5C5950] hover:underline"
            data-testid="skip-btn"
          >
            Skip for now
          </button>
          <p
            className="mt-1 max-w-sm text-[0.75rem] leading-[1.4] text-[#949085]"
            data-testid="skip-explanation"
          >
            If you skip, all topics start at zero mastery and Swotta won&apos;t
            know your strengths. The diagnostic helps us personalise your study
            plan from day one.
          </p>
        </div>
      </div>
    </div>
  );
}
