export function SpecTreeMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-[0_8px_24px_rgba(26,25,23,0.1)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-cream-200 px-5 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-coral/40" />
        <div className="h-2.5 w-2.5 rounded-full bg-stone-450/30" />
        <div className="h-2.5 w-2.5 rounded-full bg-teal/40" />
        <span className="ml-3 text-xs text-stone-450">
          AQA GCSE Biology (8461)
        </span>
      </div>

      <div className="p-5 md:p-6">
        {/* Spec header */}
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold">Specification overview</h4>
          <span className="text-xs text-stone-450">75 topics loaded</span>
        </div>

        {/* Topic tree */}
        <div className="mt-4 space-y-1">
          {/* Unit 1: Cell Biology */}
          <div className="rounded-lg bg-cream-50 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Cell Biology</span>
              <span className="text-xs font-medium text-teal">78%</span>
            </div>
            <div className="mt-2 space-y-1.5 border-l-2 border-cream-200 pl-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">Cell structure</span>
                <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                  Mastered
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">
                  Transport in cells
                </span>
                <span className="font-mono text-[10px] text-stone-450">67%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">Cell division</span>
                <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-medium text-coral">
                  Review due
                </span>
              </div>
            </div>
          </div>

          {/* Unit 2: Organisation */}
          <div className="rounded-lg bg-cream-50 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Organisation</span>
              <span className="text-xs font-medium text-teal">81%</span>
            </div>
            <div className="mt-2 space-y-1.5 border-l-2 border-cream-200 pl-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">
                  Principles of organisation
                </span>
                <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                  Mastered
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">
                  Animal tissues &amp; organs
                </span>
                <span className="font-mono text-[10px] text-stone-450">81%</span>
              </div>
            </div>
          </div>

          {/* Unit 3: Infection */}
          <div className="rounded-lg bg-cream-50 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Infection &amp; response
              </span>
              <span className="text-xs font-medium text-coral">42%</span>
            </div>
            <div className="mt-2 space-y-1.5 border-l-2 border-cream-200 pl-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">
                  Communicable diseases
                </span>
                <span className="font-mono text-[10px] text-stone-450">54%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-650">
                  Non-communicable diseases
                </span>
                <span className="font-mono text-[10px] text-stone-450">31%</span>
              </div>
            </div>
          </div>

          {/* Unit 4: Bioenergetics */}
          <div className="rounded-lg bg-cream-50 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Bioenergetics</span>
              <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[10px] font-medium text-stone-450">
                New
              </span>
            </div>
          </div>
        </div>

        {/* Footer stat */}
        <div className="mt-4 flex items-center justify-between border-t border-cream-200 pt-3">
          <span className="text-xs text-stone-450">4 units &middot; 12 topics &middot; 75 sub-topics</span>
          <span className="text-xs font-medium text-teal">Overall: 67%</span>
        </div>
      </div>
    </div>
  );
}
