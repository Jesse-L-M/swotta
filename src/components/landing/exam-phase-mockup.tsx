export function ExamPhaseMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-[0_8px_24px_rgba(26,25,23,0.1)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-cream-200 px-5 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-coral/40" />
        <div className="h-2.5 w-2.5 rounded-full bg-stone-450/30" />
        <div className="h-2.5 w-2.5 rounded-full bg-teal/40" />
        <span className="ml-3 text-xs text-stone-450">
          Revision phases &middot; AQA Biology
        </span>
      </div>

      <div className="p-5 md:p-6">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold">Exam: 22 May</h4>
          <span className="font-mono text-xs text-coral">32 days away</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-100">
          <div className="h-full w-[62%] rounded-full bg-teal" />
        </div>

        {/* Phases */}
        <div className="mt-5 space-y-2.5">
          {/* Phase 1 — completed */}
          <div className="rounded-lg border border-cream-200 bg-cream-50/50 px-4 py-3 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal/10">
                <svg
                  className="h-3.5 w-3.5 text-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-650">
                  Depth &amp; exploration
                </p>
                <p className="text-xs text-stone-450">
                  8+ weeks &middot; Topic deep-dives, extended practice
                </p>
              </div>
            </div>
          </div>

          {/* Phase 2 — active */}
          <div className="rounded-lg border-2 border-teal bg-teal/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal">
                <div className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    Consolidation &amp; drills
                  </p>
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal">
                    Active
                  </span>
                </div>
                <p className="text-xs text-stone-650">
                  4-8 weeks &middot; Retrieval practice, spaced repetition
                </p>
              </div>
            </div>
            {/* Session types */}
            <div className="ml-9 mt-2.5 flex gap-2">
              <span className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-stone-650 shadow-sm">
                Retrieval drills
              </span>
              <span className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-stone-650 shadow-sm">
                Past paper Qs
              </span>
              <span className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-stone-650 shadow-sm">
                Weak-spot focus
              </span>
            </div>
          </div>

          {/* Phase 3 — upcoming */}
          <div className="rounded-lg border border-cream-200 px-4 py-3 opacity-50">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-cream-200">
                <div className="h-2 w-2 rounded-full bg-cream-200" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-650">
                  Confidence &amp; calm
                </p>
                <p className="text-xs text-stone-450">
                  Final week &middot; Light review, exam technique, composure
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
