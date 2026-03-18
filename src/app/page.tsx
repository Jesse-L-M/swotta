import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream-50 text-stone-750 antialiased">
      {/* Nav — minimal, breathes */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 md:px-8">
        <span className="font-serif text-xl tracking-tight">Swotta</span>
        <div className="flex items-center gap-8">
          <Link
            href="/login"
            className="text-sm text-stone-650 transition-colors hover:text-stone-750"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-dark"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero — big, asymmetric, unhurried */}
      <section className="mx-auto max-w-5xl px-6 pb-32 pt-20 md:px-8 md:pb-40 md:pt-32">
        <h1 className="max-w-[18ch] font-serif text-5xl leading-[1.15] tracking-[-0.02em] md:text-7xl md:leading-[1.08]">
          Stop wondering what to revise.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-stone-650 md:text-xl md:leading-relaxed">
          Swotta reads your actual exam spec, learns how you think, and tells
          you exactly what to study next. Not a chatbot. Not a revision guide.
          An academic operating system.
        </p>
        <Link
          href="/signup"
          className="mt-10 inline-block rounded-lg bg-teal px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-teal-dark"
        >
          Get started — it&apos;s free
        </Link>
      </section>

      {/* Single statement — the problem, not a grid */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-5xl px-6 py-28 md:px-8 md:py-36">
          <p className="max-w-2xl font-serif text-2xl leading-snug text-stone-650 md:text-3xl md:leading-snug">
            Right now your revision is scattered across six apps, none of which
            know your spec, none of which talk to each other, and none of which
            can tell you — or your parents — what you actually understand.
          </p>
        </div>
      </section>

      {/* How it works — vertical steps, not a 4-col grid */}
      <section className="border-t border-cream-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-28 md:px-8 md:py-36">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
            How Swotta works
          </h2>
          <div className="mt-16 space-y-16 md:mt-20 md:space-y-20">
            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:gap-8">
              <span className="font-serif text-5xl text-teal md:text-6xl">
                01
              </span>
              <div>
                <h3 className="text-lg font-semibold">Add your subjects</h3>
                <p className="mt-2 max-w-lg text-base leading-relaxed text-stone-650">
                  Pick your exam board and qualification. Swotta loads the entire
                  specification — every topic, every command word, every
                  assessment component. It knows what a 6-mark
                  &ldquo;evaluate&rdquo; question requires.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:gap-8">
              <span className="font-serif text-5xl text-teal md:text-6xl">
                02
              </span>
              <div>
                <h3 className="text-lg font-semibold">
                  A conversation, not a test
                </h3>
                <p className="mt-2 max-w-lg text-base leading-relaxed text-stone-650">
                  A short diagnostic conversation maps what you know and what
                  you don&apos;t. Within fifteen minutes, Swotta has a model of
                  your understanding — not a score, a real picture.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:gap-8">
              <span className="font-serif text-5xl text-teal md:text-6xl">
                03
              </span>
              <div>
                <h3 className="text-lg font-semibold">
                  Your daily plan, built for you
                </h3>
                <p className="mt-2 max-w-lg text-base leading-relaxed text-stone-650">
                  Each morning, Swotta builds a session based on what needs
                  attention most — retrieval drills, worked examples, exam
                  technique practice. It adapts as exams get closer.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:gap-8">
              <span className="font-serif text-5xl text-teal md:text-6xl">
                04
              </span>
              <div>
                <h3 className="text-lg font-semibold">
                  Watch misconceptions disappear
                </h3>
                <p className="mt-2 max-w-lg text-base leading-relaxed text-stone-650">
                  Track your learning journey over weeks. See which
                  misconceptions you&apos;ve conquered, which topics you&apos;ve
                  mastered, and feel the difference when revision isn&apos;t
                  random.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What makes it different — sparse, left-aligned accents */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-5xl px-6 py-28 md:px-8 md:py-36">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
            Not another revision app
          </h2>
          <div className="mt-16 space-y-12 md:mt-20">
            <div className="max-w-2xl border-l-2 border-teal pl-6">
              <h3 className="text-lg font-semibold">
                Grounded on your actual exam spec
              </h3>
              <p className="mt-2 text-base leading-relaxed text-stone-650">
                Every question, every session, every piece of feedback is
                anchored to the real AQA, OCR, or Edexcel specification. Not
                generic knowledge. Your qualification, your mark scheme, your
                command words.
              </p>
            </div>
            <div className="max-w-2xl border-l-2 border-teal pl-6">
              <h3 className="text-lg font-semibold">
                Remembers how you think
              </h3>
              <p className="mt-2 text-base leading-relaxed text-stone-650">
                Swotta builds a model of your understanding — your
                misconceptions, your confidence calibration, the topics you
                avoid. It notices when you know more than you think. It adapts
                every session.
              </p>
            </div>
            <div className="max-w-2xl border-l-2 border-teal pl-6">
              <h3 className="text-lg font-semibold">
                Gets smarter as exams approach
              </h3>
              <p className="mt-2 text-base leading-relaxed text-stone-650">
                Eight weeks out: exploration and depth. Four weeks:
                consolidation and drills. Final week: confidence and calm.
                Swotta shifts its entire personality to match what you need
                right now.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For parents — dark panel, restrained */}
      <section className="bg-stone-750 text-cream-100">
        <div className="mx-auto max-w-5xl px-6 py-28 md:px-8 md:py-36">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-450">
            For parents
          </p>
          <h2 className="mt-4 max-w-[20ch] font-serif text-3xl leading-snug text-cream-100 md:text-4xl md:leading-snug">
            Finally see what&apos;s really happening
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-450">
            Weekly reports that go beyond &ldquo;3 hours studied.&rdquo; See
            which topics are improving, where misconceptions recur, whether your
            child is confident or struggling — and what you can actually do
            about it.
          </p>
          <div className="mt-12 space-y-4 text-sm text-stone-450">
            <p>
              <span className="mr-3 inline-block h-1.5 w-1.5 rounded-full bg-teal" />
              Gap analysis — exactly which topics need work
            </p>
            <p>
              <span className="mr-3 inline-block h-1.5 w-1.5 rounded-full bg-teal" />
              Confidence calibration — when they&apos;re over- or
              under-estimating
            </p>
            <p>
              <span className="mr-3 inline-block h-1.5 w-1.5 rounded-full bg-teal" />
              Actionable insights — not just data, but what to say
            </p>
          </div>
          <Link
            href="/signup"
            className="mt-12 inline-block rounded-lg bg-teal px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-teal-dark"
          >
            Set up your family account
          </Link>
        </div>
      </section>

      {/* Final CTA — simple, confident */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-5xl px-6 py-32 text-center md:px-8 md:py-40">
          <h2 className="mx-auto max-w-[20ch] font-serif text-3xl leading-snug md:text-5xl md:leading-snug">
            Revision that actually works
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-stone-650">
            Built for GCSE and A-Level students. Grounded on your exam spec.
            Adapts to how you learn.
          </p>
          <Link
            href="/signup"
            className="mt-10 inline-block rounded-lg bg-teal px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-teal-dark"
          >
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* Footer — quiet */}
      <footer className="border-t border-cream-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 md:px-8">
          <span className="font-serif text-base text-stone-550">Swotta</span>
          <div className="flex gap-6 text-sm text-stone-550">
            <Link
              href="/login"
              className="transition-colors hover:text-stone-750"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="transition-colors hover:text-stone-750"
            >
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
