"use client";

import Link from "next/link";
import { FadeIn, FadeInStagger, FadeInChild } from "@/components/landing/fade-in";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { SessionMockup } from "@/components/landing/session-mockup";
import { ParentReportMockup } from "@/components/landing/parent-report-mockup";
import { SpecTreeMockup } from "@/components/landing/spec-tree-mockup";
import { ExamPhaseMockup } from "@/components/landing/exam-phase-mockup";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream-50 text-stone-750 antialiased">
      {/* Nav — fixed, blurred, like Anthropic */}
      <nav className="fixed top-0 z-50 w-full border-b border-cream-200/60 bg-cream-50/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4 md:px-8">
          <span className="font-serif text-xl tracking-tight">Swotta</span>
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              className="flex min-h-[44px] items-center text-sm text-stone-650 transition-colors hover:text-stone-750"
            >
              How it works
            </a>
            <a
              href="#for-parents"
              className="flex min-h-[44px] items-center text-sm text-stone-650 transition-colors hover:text-stone-750"
            >
              For parents
            </a>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="flex min-h-[44px] items-center text-sm text-stone-650 transition-colors hover:text-stone-750"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex min-h-[44px] items-center rounded-lg bg-stone-750 px-5 py-2.5 text-sm font-medium text-cream-50 transition-colors hover:bg-stone-650"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — 2-col, massive serif headline, dashboard on right */}
      <section className="pt-28 md:pt-36">
        <div className="mx-auto max-w-[1120px] px-6 pb-24 md:px-8 md:pb-32">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <FadeIn>
                <h1 className="text-balance font-serif text-[3.25rem] leading-[1.08] tracking-[-0.02em] md:text-[4.25rem] lg:text-[5rem] lg:leading-[1.05] lg:tracking-[-0.03em]">
                  Know exactly what to study next.
                </h1>
              </FadeIn>
              <FadeIn delay={0.15}>
                <p className="mt-8 max-w-[440px] text-lg leading-[1.7] text-stone-650">
                  Swotta reads your exam specification, learns how you think, and
                  builds a revision plan that adapts every day.
                </p>
              </FadeIn>
              <FadeIn delay={0.3}>
                <Link
                  href="/signup"
                  className="mt-10 inline-block rounded-lg bg-teal px-7 py-3.5 text-base font-medium text-white shadow-[0_2px_8px_rgba(45,122,110,0.25)] transition-all hover:bg-teal-dark hover:shadow-[0_4px_16px_rgba(45,122,110,0.35)]"
                >
                  Get started &mdash; it&apos;s free
                </Link>
              </FadeIn>
            </div>
            <FadeIn delay={0.2} y={32}>
              <DashboardMockup />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Statement — centered serif, large, like Anthropic's pacing breaks */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-[1120px] px-6 py-32 md:px-8 md:py-40">
          <FadeIn>
            <p className="mx-auto max-w-[36ch] text-center text-balance font-serif text-[1.75rem] leading-[1.4] text-stone-650 md:text-[2.5rem] md:leading-[1.35]">
              Six revision apps. None of them know your spec. None of them talk
              to each other.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Feature 1 — Built on your exam spec */}
      <section id="how-it-works" className="bg-white">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <FadeIn>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal">
                  Curriculum-first
                </p>
                <h2 className="mt-4 text-balance font-serif text-[2rem] leading-[1.2] md:text-[2.75rem]">
                  Built on your actual exam spec
                </h2>
                <p className="mt-6 max-w-md text-[0.9375rem] leading-[1.7] text-stone-650">
                  Pick your exam board and qualification. Swotta loads the entire
                  specification &mdash; every topic, every command word, every
                  assessment objective. Your revision is always grounded in what
                  the examiner actually wants.
                </p>
              </FadeIn>
            </div>
            <FadeIn delay={0.15} y={32}>
              <SpecTreeMockup />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Feature 2 — Learns how you think */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <FadeIn y={32} className="order-2 lg:order-1">
              <SessionMockup />
            </FadeIn>
            <div className="order-1 lg:order-2">
              <FadeIn>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal">
                  Personalised
                </p>
                <h2 className="mt-4 text-balance font-serif text-[2rem] leading-[1.2] md:text-[2.75rem]">
                  Remembers how you think
                </h2>
                <p className="mt-6 max-w-md text-[0.9375rem] leading-[1.7] text-stone-650">
                  Your misconceptions, your confidence gaps, the topics you
                  avoid. Every session is shaped by every session before it.
                  Swotta notices patterns you can&apos;t see yourself.
                </p>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3 — Adapts as exams approach */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <FadeIn>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal">
                  Adaptive
                </p>
                <h2 className="mt-4 text-balance font-serif text-[2rem] leading-[1.2] md:text-[2.75rem]">
                  Gets smarter as exams approach
                </h2>
                <p className="mt-6 max-w-md text-[0.9375rem] leading-[1.7] text-stone-650">
                  Eight weeks out: depth and exploration. Four weeks:
                  consolidation and drills. Final week: confidence and calm. The
                  system shifts to match what your exams demand right now.
                </p>
              </FadeIn>
            </div>
            <FadeIn delay={0.15} y={32}>
              <ExamPhaseMockup />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Statement 2 — another pacing break */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-[1120px] px-6 py-32 md:px-8 md:py-40">
          <FadeIn>
            <p className="mx-auto max-w-[32ch] text-center text-balance font-serif text-[1.75rem] leading-[1.4] text-stone-650 md:text-[2.5rem] md:leading-[1.35]">
              Not a chatbot. Not a flashcard app.{" "}
              <span className="text-stone-750">
                An academic operating system.
              </span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* For parents — dark panel */}
      <section id="for-parents" className="bg-stone-750 text-cream-100">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <div className="grid items-center gap-16 lg:grid-cols-[1fr_1fr] lg:gap-12">
            <FadeIn>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-450">
                  For parents
                </p>
                <h2 className="mt-4 text-balance font-serif text-[2rem] leading-[1.2] text-cream-100 md:text-[2.75rem]">
                  Finally see what&apos;s really happening
                </h2>
                <p className="mt-6 max-w-md text-[0.9375rem] leading-[1.7] text-stone-450">
                  Weekly reports that go beyond &ldquo;studied for 3
                  hours.&rdquo; Which topics are improving. Where misconceptions
                  persist. What you can actually do about it.
                </p>
                <div className="mt-8 space-y-3 text-sm text-stone-450">
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Gap analysis &mdash; exactly which topics need work
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Confidence calibration &mdash; when they over- or
                    under-estimate
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Actionable insights &mdash; not just data, but what to say
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="mt-10 inline-block rounded-lg bg-teal px-7 py-3.5 text-base font-medium text-white shadow-[0_2px_8px_rgba(45,122,110,0.3)] transition-all hover:bg-teal-dark hover:shadow-[0_4px_16px_rgba(45,122,110,0.4)]"
                >
                  Set up your family account
                </Link>
              </div>
            </FadeIn>

            <FadeIn delay={0.2} y={32}>
              <ParentReportMockup />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* CTA — teal surface, centered */}
      <section className="bg-[#D6EBE7]">
        <div className="mx-auto max-w-[1120px] px-6 py-28 text-center md:px-8 md:py-36">
          <FadeIn>
            <h2 className="mx-auto max-w-[20ch] text-balance font-serif text-[2rem] leading-[1.2] text-stone-750 md:text-[3rem] md:leading-[1.15]">
              Revision that knows you.
            </h2>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-stone-650">
              Built for GCSE and A-Level students. Grounded on your exam spec.
              Adapts to how you learn.
            </p>
            <Link
              href="/signup"
              className="mt-10 inline-block rounded-lg bg-stone-750 px-7 py-3.5 text-base font-medium text-cream-50 transition-all hover:bg-stone-650"
            >
              Get started &mdash; it&apos;s free
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* Footer — rich, dark, multi-column like Anthropic */}
      <footer className="bg-stone-750 text-stone-450">
        <div className="mx-auto max-w-[1120px] px-6 py-16 md:px-8 md:py-20">
          <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            {/* Brand column */}
            <div>
              <span className="font-serif text-lg text-cream-100">Swotta</span>
              <p className="mt-3 max-w-[240px] text-sm leading-relaxed">
                The academic operating system for GCSE and A-Level students.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-550">
                Product
              </p>
              <div className="mt-4 space-y-2.5 text-sm">
                <a
                  href="#how-it-works"
                  className="block transition-colors hover:text-cream-100"
                >
                  How it works
                </a>
                <a
                  href="#for-parents"
                  className="block transition-colors hover:text-cream-100"
                >
                  For parents
                </a>
                <Link
                  href="/signup"
                  className="block transition-colors hover:text-cream-100"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="block transition-colors hover:text-cream-100"
                >
                  Log in
                </Link>
              </div>
            </div>

            {/* Subjects */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-550">
                Subjects
              </p>
              <div className="mt-4 space-y-2.5 text-sm">
                <span className="block">GCSE Biology</span>
                <span className="block">GCSE Chemistry</span>
                <span className="block">GCSE Physics</span>
                <span className="block text-stone-550">More coming soon</span>
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-550">
                Company
              </p>
              <div className="mt-4 space-y-2.5 text-sm">
                <span className="block">About</span>
                <span className="block">Privacy</span>
                <span className="block">Terms</span>
                <span className="block">Contact</span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 flex items-center justify-between border-t border-[#302E28] pt-8">
            <p className="text-xs text-stone-550">
              &copy; {new Date().getFullYear()} Swotta
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
