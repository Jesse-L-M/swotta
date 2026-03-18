export function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-[0_8px_24px_rgba(26,25,23,0.1)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-cream-200 px-5 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-coral/40" />
        <div className="h-2.5 w-2.5 rounded-full bg-stone-450/30" />
        <div className="h-2.5 w-2.5 rounded-full bg-teal/40" />
        <span className="ml-3 text-xs text-stone-450">swotta.app/dashboard</span>
      </div>

      <div className="p-5 md:p-6">
        {/* Greeting */}
        <p className="text-sm text-stone-650">Good morning, Michael</p>
        <h3 className="mt-1 font-serif text-xl">Your week at a glance</h3>

        {/* Stat cards */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="text-xs text-stone-450">Mastery</p>
            <p className="mt-1 font-serif text-2xl text-teal">67%</p>
            <p className="mt-0.5 text-xs text-teal">+4% this week</p>
          </div>
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="text-xs text-stone-450">Streak</p>
            <p className="mt-1 font-serif text-2xl text-stone-750">5 days</p>
            <p className="mt-0.5 text-xs text-stone-450">Personal best</p>
          </div>
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="text-xs text-stone-450">Exam</p>
            <p className="mt-1 font-serif text-2xl text-coral">32 days</p>
            <p className="mt-0.5 text-xs text-stone-450">AQA Biology</p>
          </div>
        </div>

        {/* Today's queue */}
        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-450">
            Today&apos;s sessions
          </h4>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-cream-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Genetics: DNA structure</p>
                <p className="text-xs text-stone-450">Retrieval drill &middot; 15 min</p>
              </div>
              <div className="rounded-md bg-teal px-2.5 py-1 text-xs font-medium text-white">Start</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-cream-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Ecology: food webs</p>
                <p className="text-xs text-stone-450">Worked example &middot; 20 min</p>
              </div>
              <div className="rounded-md border border-cream-200 px-2.5 py-1 text-xs text-stone-450">Upcoming</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-cream-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Cell biology: osmosis</p>
                <p className="text-xs text-coral">Misconception detected</p>
              </div>
              <div className="rounded-md border border-coral/30 bg-coral-light px-2.5 py-1 text-xs text-coral">Review</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
