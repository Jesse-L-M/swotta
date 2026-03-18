export function SessionMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-[0_8px_24px_rgba(26,25,23,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cream-200 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-teal" />
          <span className="text-sm font-medium">Genetics: DNA structure</span>
        </div>
        <span className="font-mono text-xs text-stone-450">12:34</span>
      </div>

      <div className="space-y-4 p-5 md:p-6">
        {/* AI message */}
        <div className="max-w-[85%]">
          <div className="rounded-lg rounded-tl-sm bg-cream-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-stone-750">
              Let&apos;s work on DNA structure. This is a 6-mark
              <span className="font-medium text-teal"> &ldquo;describe&rdquo; </span>
              question — that means you need to state the key features clearly,
              with specific terminology. Aim for 3 distinct points with detail.
            </p>
          </div>
          <p className="mt-1 text-xs text-stone-450">Swotta</p>
        </div>

        {/* Student message */}
        <div className="flex justify-end">
          <div className="max-w-[85%]">
            <div className="rounded-lg rounded-tr-sm bg-teal px-4 py-3">
              <p className="text-sm leading-relaxed text-white">
                DNA is a double helix made of nucleotides. Each nucleotide has a
                sugar, phosphate group and a base. The bases pair up A-T and C-G...
              </p>
            </div>
            <p className="mt-1 text-right text-xs text-stone-450">Michael</p>
          </div>
        </div>

        {/* AI feedback */}
        <div className="max-w-[85%]">
          <div className="rounded-lg rounded-tl-sm bg-cream-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-stone-750">
              Good start — you&apos;ve got the double helix, nucleotide
              components, and complementary base pairing. For full marks,
              add:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-stone-650">
              <li className="flex gap-2">
                <span className="text-teal">+</span> Sugar-phosphate backbone
                forms the &ldquo;sides&rdquo;
              </li>
              <li className="flex gap-2">
                <span className="text-teal">+</span> Bases joined by hydrogen
                bonds
              </li>
              <li className="flex gap-2">
                <span className="text-teal">+</span> Strands run antiparallel
              </li>
            </ul>
          </div>
        </div>

        {/* Confidence prompt */}
        <div className="rounded-lg border border-teal/20 bg-[#E4F0ED] px-4 py-3">
          <p className="text-xs font-medium text-teal">
            How confident do you feel about DNA structure now?
          </p>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium ${
                  n === 3
                    ? "bg-teal text-white"
                    : "border border-cream-200 text-stone-450"
                }`}
              >
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
