"use client";

export function AnalysingScreen() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center px-4"
      data-testid="diagnostic-analysing"
    >
      <div className="text-center">
        <div className="mx-auto mb-8 h-12 w-12 animate-spin rounded-full border-[3px] border-[#F0ECE4] border-t-[#2D7A6E]" />
        <h2 className="font-[family-name:var(--font-serif)] text-[1.75rem] leading-[1.3] text-[#1A1917]">
          Analysing your responses
        </h2>
        <p className="mt-3 text-[1rem] leading-[1.6] text-[#5C5950]">
          Building your personalised knowledge map...
        </p>
      </div>
    </div>
  );
}
