export function ParentReportMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#302E28] bg-[#222120] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      {/* Email header */}
      <div className="border-b border-[#302E28] px-5 py-4">
        <p className="text-xs text-stone-450">From: Swotta &lt;reports@swotta.app&gt;</p>
        <p className="mt-1 font-serif text-base text-cream-100">
          Michael&apos;s weekly report — 11-17 March
        </p>
      </div>

      <div className="space-y-5 p-5 md:p-6">
        {/* Summary */}
        <div>
          <p className="text-sm leading-relaxed text-stone-450">
            Michael completed <span className="text-cream-100">7 sessions</span> this
            week, covering 4 topics. His overall mastery increased from 63% to 67%.
          </p>
        </div>

        {/* Strengths */}
        <div className="rounded-lg border-l-[3px] border-teal-light bg-[#1A2E2A] py-3 pl-4 pr-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-teal-light">
            Strengths
          </p>
          <p className="mt-1.5 text-sm text-stone-450">
            Cell biology is now his strongest area —{" "}
            <span className="text-cream-100">89% mastery</span>. He conquered a
            recurring osmosis/diffusion confusion this week.
          </p>
        </div>

        {/* Areas to watch */}
        <div className="rounded-lg border-l-[3px] border-coral-light bg-[#2E1E1A] py-3 pl-4 pr-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-coral-light">
            Areas to watch
          </p>
          <p className="mt-1.5 text-sm text-stone-450">
            Genetics remains at <span className="text-cream-100">42% mastery</span> —
            he&apos;s been avoiding it. A brief conversation about what feels
            difficult could help.
          </p>
        </div>

        {/* Insight */}
        <div className="rounded-lg bg-[#171614] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-550">
            Confidence insight
          </p>
          <p className="mt-1.5 text-sm text-stone-450">
            Michael consistently underestimates himself on ecology — he rated
            himself 2/5 but scored 80%+ three sessions in a row.{" "}
            <span className="italic text-cream-100">
              He knows more than he thinks.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
