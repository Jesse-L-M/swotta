import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FAF6F0] text-[#1A1917] dark:bg-[#171614] dark:text-[#F0ECE4]">
      {/* Skip to content */}
      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#2D7A6E] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Navigation */}
      <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-6">
        <span className="font-serif text-2xl tracking-tight">Swotta</span>
        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm font-medium text-[#5C5950] transition-colors hover:text-[#1A1917] dark:text-[#A09B90] dark:hover:text-[#F0ECE4]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#2D7A6E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256860] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7A6E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF6F0] dark:bg-[#4DAFA0] dark:text-[#171614] dark:hover:bg-[#3D9F90] dark:focus-visible:ring-[#4DAFA0] dark:focus-visible:ring-offset-[#171614]"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section id="hero" className="mx-auto max-w-[1120px] px-6 pb-24 pt-16 md:pb-32 md:pt-24">
        <div className="max-w-2xl">
          <h1 className="font-serif text-[2.5rem] leading-[1.2] tracking-[-0.01em] md:text-[3.5rem] md:leading-[1.1] md:tracking-[-0.02em]">
            Stop wondering what to revise.{" "}
            <span className="italic text-[#2D7A6E] dark:text-[#4DAFA0]">Start knowing.</span>
          </h1>
          <p className="mt-6 text-[1.125rem] leading-[1.7] text-[#5C5950] dark:text-[#A09B90]">
            Swotta reads your actual exam spec, learns how you think, and builds
            a revision plan that adapts every day. No guesswork. No wasted
            sessions. Just the right work, at the right time.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-[#2D7A6E] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#256860] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7A6E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF6F0] dark:bg-[#4DAFA0] dark:text-[#171614] dark:hover:bg-[#3D9F90] dark:focus-visible:ring-[#4DAFA0] dark:focus-visible:ring-offset-[#171614]"
          >
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-[#E5E0D6] bg-white dark:border-[#302E28] dark:bg-[#222120]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 md:py-28">
          <h2 className="font-serif text-[1.75rem] leading-[1.3] md:text-[2rem]">
            You already know the problem
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2 lg:gap-12">
            <div className="rounded-r-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] py-4 pl-5 pr-4 dark:border-[#E8836A] dark:bg-[#2E1E1A]">
              <p className="text-[0.9375rem] font-medium text-[#1A1917] dark:text-[#F0ECE4]">
                Your notes are everywhere
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                Google Docs, Notion, loose sheets, screenshots of the
                whiteboard. Nothing connects to what you actually need to know
                for the exam.
              </p>
            </div>
            <div className="rounded-r-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] py-4 pl-5 pr-4 dark:border-[#E8836A] dark:bg-[#2E1E1A]">
              <p className="text-[0.9375rem] font-medium text-[#1A1917] dark:text-[#F0ECE4]">
                Revision guides don&apos;t know you
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                They cover everything equally. But you don&apos;t need
                everything equally. You need the topics slipping through the
                cracks.
              </p>
            </div>
            <div className="rounded-r-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] py-4 pl-5 pr-4 dark:border-[#E8836A] dark:bg-[#2E1E1A]">
              <p className="text-[0.9375rem] font-medium text-[#1A1917] dark:text-[#F0ECE4]">
                ChatGPT doesn&apos;t know your spec
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                It makes things up. It doesn&apos;t know AQA from OCR. It
                can&apos;t tell you what a 6-mark &ldquo;evaluate&rdquo;
                question actually requires.
              </p>
            </div>
            <div className="rounded-r-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] py-4 pl-5 pr-4 dark:border-[#E8836A] dark:bg-[#2E1E1A]">
              <p className="text-[0.9375rem] font-medium text-[#1A1917] dark:text-[#F0ECE4]">
                Your parents are in the dark
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                &ldquo;How&apos;s revision going?&rdquo; &ldquo;Fine.&rdquo;
                They want to help but have no idea what&apos;s actually
                happening.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#E5E0D6] dark:border-[#302E28]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 md:py-28">
          <h2 className="font-serif text-[1.75rem] leading-[1.3] md:text-[2rem]">
            How Swotta works
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="font-serif text-[2rem] leading-none text-[#2D7A6E] dark:text-[#4DAFA0]">01.</span>
              <h3 className="mt-3 text-[1.0625rem] font-semibold">
                Add your subjects
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                Pick your exam board and qualification. Swotta loads the full
                specification — every topic, every command word, every
                assessment component.
              </p>
            </div>
            <div>
              <span className="font-serif text-[2rem] leading-none text-[#2D7A6E] dark:text-[#4DAFA0]">02.</span>
              <h3 className="mt-3 text-[1.0625rem] font-semibold">
                Swotta learns what you know
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                A short diagnostic conversation maps your strengths and gaps.
                Every session after that updates your mastery model in real time.
              </p>
            </div>
            <div>
              <span className="font-serif text-[2rem] leading-none text-[#2D7A6E] dark:text-[#4DAFA0]">03.</span>
              <h3 className="mt-3 text-[1.0625rem] font-semibold">
                Get your daily plan
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                Each day, Swotta builds a session tailored to you — retrieval
                drills, worked examples, exam technique — based on what needs
                attention most.
              </p>
            </div>
            <div>
              <span className="font-serif text-[2rem] leading-none text-[#2D7A6E] dark:text-[#4DAFA0]">04.</span>
              <h3 className="mt-3 text-[1.0625rem] font-semibold">
                Watch yourself improve
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                Track mastery across every topic. See misconceptions get
                conquered. Feel the difference when revision isn&apos;t random.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What makes it different */}
      <section className="border-t border-[#E5E0D6] bg-white dark:border-[#302E28] dark:bg-[#222120]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 md:py-28">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-[#5C5950] dark:text-[#A09B90]">
            Not another revision app
          </p>
          <h2 className="mt-2 font-serif text-[1.75rem] leading-[1.3] md:text-[2rem]">
            What makes Swotta different
          </h2>
          {/* Lead differentiator — full width */}
          <div className="mt-12 rounded-xl border border-[#E5E0D6] bg-[#FAF6F0] p-6 md:p-8 dark:border-[#302E28] dark:bg-[#171614]">
            <div className="mb-4 inline-block rounded-full bg-[#E4F0ED] px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#2D7A6E] dark:bg-[#1A2E2A] dark:text-[#4DAFA0]">
              Grounded
            </div>
            <h3 className="font-serif text-[1.25rem] leading-[1.3] md:text-[1.5rem]">
              Built on your actual exam spec
            </h3>
            <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
              Every question, every session, every piece of feedback is
              anchored to the real AQA, OCR, or Edexcel specification. Not
              generic knowledge — your qualification, your mark scheme, your
              command words. Swotta knows what a 6-mark &ldquo;evaluate&rdquo;
              question requires because it&apos;s read the spec.
            </p>
          </div>
          {/* Supporting differentiators */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-[#E5E0D6] bg-[#FAF6F0] p-6 dark:border-[#302E28] dark:bg-[#171614]">
              <div className="mb-4 inline-block rounded-full bg-[#E4F0ED] px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#2D7A6E] dark:bg-[#1A2E2A] dark:text-[#4DAFA0]">
                Adaptive
              </div>
              <h3 className="text-[1.0625rem] font-semibold">
                Remembers how you think
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                Swotta builds a model of your understanding — not just what you
                got right, but your misconceptions, your confidence calibration,
                and how you learn best. It adapts every session.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E0D6] bg-[#FAF6F0] p-6 dark:border-[#302E28] dark:bg-[#171614]">
              <div className="mb-4 inline-block rounded-full bg-[#E4F0ED] px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#2D7A6E] dark:bg-[#1A2E2A] dark:text-[#4DAFA0]">
                Connected
              </div>
              <h3 className="text-[1.0625rem] font-semibold">
                Tells your parents something useful
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5950] dark:text-[#A09B90]">
                No more &ldquo;how&apos;s revision going?&rdquo;
                &ldquo;fine.&rdquo; Parents get weekly reports with real
                insights — what&apos;s improving, what needs attention, and
                how they can actually help.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For Parents — dark panel in both modes */}
      <section className="border-t border-[#E5E0D6] bg-[#1A1917] text-[#F0ECE4] dark:border-[#302E28]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 md:py-28">
          <div className="max-w-xl">
            <div className="mb-4 inline-block rounded-full bg-[#F0ECE4]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#949085] dark:text-[#A09B90]">
              For parents
            </div>
            <h2 className="font-serif text-[1.75rem] leading-[1.3] text-[#F0ECE4] md:text-[2rem]">
              Finally see what&apos;s really happening
            </h2>
            <p className="mt-6 text-base leading-[1.7] text-[#949085] dark:text-[#A09B90]">
              Weekly reports that go beyond &ldquo;3 hours studied.&rdquo; See
              which topics are improving, where misconceptions keep recurring,
              whether your child is confident or struggling — and what to do
              about it.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-[#A09B90]">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2D7A6E] dark:bg-[#4DAFA0]" />
                Gap analysis — see exactly which topics need work
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2D7A6E] dark:bg-[#4DAFA0]" />
                Confidence calibration — know when they&apos;re over- or
                under-estimating
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2D7A6E] dark:bg-[#4DAFA0]" />
                Actionable insights — not just data, but what it means and
                what to say
              </li>
            </ul>
            <Link
              href="/signup"
              className="mt-10 inline-block rounded-lg bg-[#2D7A6E] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#3D8A7E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7A6E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A1917] dark:bg-[#4DAFA0] dark:text-[#171614] dark:hover:bg-[#3D9F90] dark:focus-visible:ring-[#4DAFA0]"
            >
              Set up your family account
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#E5E0D6] dark:border-[#302E28]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 text-center md:py-28">
          <h2 className="font-serif text-[1.75rem] leading-[1.3] md:text-[2.5rem] md:leading-[1.2]">
            Revision that actually{" "}
            <span className="italic text-[#2D7A6E] dark:text-[#4DAFA0]">works</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-[1.7] text-[#5C5950] dark:text-[#A09B90]">
            Built for GCSE and A-Level students. Grounded on your exam spec.
            Adapts to how you learn. Free to start.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-[#2D7A6E] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#256860] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7A6E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF6F0] dark:bg-[#4DAFA0] dark:text-[#171614] dark:hover:bg-[#3D9F90] dark:focus-visible:ring-[#4DAFA0] dark:focus-visible:ring-offset-[#171614]"
          >
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E5E0D6] dark:border-[#302E28]">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <span className="font-serif text-lg tracking-tight text-[#5C5950] dark:text-[#A09B90]">
            Swotta
          </span>
          <div className="flex items-center gap-6 text-sm text-[#949085] dark:text-[#A09B90]">
            <Link href="/login" className="transition-colors hover:text-[#1A1917] dark:hover:text-[#F0ECE4]">
              Log in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-[#1A1917] dark:hover:text-[#F0ECE4]">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
