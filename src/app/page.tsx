"use client";

import Link from "next/link";
import { FadeIn, FadeInStagger, FadeInChild } from "@/components/landing/fade-in";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { SessionMockup } from "@/components/landing/session-mockup";
import { ParentReportMockup } from "@/components/landing/parent-report-mockup";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream-50 text-stone-750 antialiased">
      {/* Nav */}
      <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-8 md:px-8">
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
            className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white shadow-[0_1px_3px_rgba(26,25,23,0.05)] transition-all hover:bg-teal-dark hover:shadow-[0_2px_8px_rgba(26,25,23,0.08)]"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero — massive, confident */}
      <section className="mx-auto max-w-[1120px] px-6 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <FadeIn>
          <h1 className="max-w-[15ch] font-serif text-[3.5rem] leading-[1.1] tracking-[-0.02em] md:text-[5.5rem] md:leading-[1.05] md:tracking-[-0.03em]">
            Stop wondering what to revise.
          </h1>
        </FadeIn>
        <FadeIn delay={0.15}>
          <p className="mt-8 max-w-lg text-lg leading-[1.7] text-stone-650">
            Swotta reads your actual exam spec, learns how you think, and tells
            you exactly what to study next. Not a chatbot. Not a revision
            guide. An academic operating system.
          </p>
        </FadeIn>
        <FadeIn delay={0.3}>
          <Link
            href="/signup"
            className="mt-10 inline-block rounded-md bg-teal px-7 py-3.5 text-base font-medium text-white shadow-[0_2px_8px_rgba(45,122,110,0.3)] transition-all hover:bg-teal-dark hover:shadow-[0_4px_16px_rgba(45,122,110,0.4)]"
          >
            Get started — it&apos;s free
          </Link>
        </FadeIn>
      </section>

      {/* Product showcase — the dashboard */}
      <section className="mx-auto max-w-[1120px] px-6 pb-32 md:px-8 md:pb-40">
        <FadeIn y={40}>
          <div className="mx-auto max-w-3xl">
            <DashboardMockup />
          </div>
        </FadeIn>
      </section>

      {/* Problem — single serif statement */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <FadeIn>
            <p className="max-w-[38ch] font-serif text-[1.75rem] leading-[1.4] text-stone-650 md:text-[2.25rem] md:leading-[1.35]">
              Right now your revision is scattered across six apps, none of
              which know your spec, and none of which can tell your parents
              what you actually understand.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* How it works — with session mockup */}
      <section className="border-t border-cream-200 bg-white">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <FadeIn>
            <h2 className="font-serif text-[1.75rem] leading-[1.3] md:text-[2.5rem]">
              How Swotta works
            </h2>
          </FadeIn>

          <div className="mt-16 grid gap-16 md:mt-20 lg:grid-cols-[1fr_1fr] lg:gap-12">
            {/* Steps */}
            <FadeInStagger className="space-y-12" staggerDelay={0.12}>
              {[
                {
                  num: "01",
                  title: "Add your subjects",
                  desc: "Pick your exam board and qualification. Swotta loads the entire specification — every topic, every command word, every assessment component.",
                },
                {
                  num: "02",
                  title: "A conversation, not a test",
                  desc: "A short diagnostic maps what you know and what you don't. Within fifteen minutes, Swotta has a real picture of your understanding.",
                },
                {
                  num: "03",
                  title: "Your daily plan, built for you",
                  desc: "Each morning, a session tailored to what needs attention most — retrieval drills, worked examples, exam technique. It adapts as exams approach.",
                },
                {
                  num: "04",
                  title: "Watch misconceptions disappear",
                  desc: "Track your journey over weeks. See which misconceptions you've conquered, which topics you've mastered.",
                },
              ].map((step) => (
                <FadeInChild key={step.num}>
                  <div className="flex gap-5">
                    <span className="font-serif text-3xl text-teal/50">
                      {step.num}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-stone-650">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </FadeInChild>
              ))}
            </FadeInStagger>

            {/* Session mockup */}
            <FadeIn delay={0.2} y={32}>
              <div className="lg:mt-4">
                <SessionMockup />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Differentiators — sparse, confident */}
      <section className="border-t border-cream-200">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <FadeIn>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-450">
              Not another revision app
            </p>
            <h2 className="mt-3 font-serif text-[1.75rem] leading-[1.3] md:text-[2.5rem]">
              What makes Swotta different
            </h2>
          </FadeIn>

          <FadeInStagger className="mt-14 space-y-10 md:mt-18" staggerDelay={0.12}>
            <FadeInChild>
              <div className="max-w-2xl border-l-2 border-teal py-1 pl-6">
                <h3 className="font-serif text-lg">
                  Grounded on your actual exam spec
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-stone-650">
                  Every question, every session, every piece of feedback is
                  anchored to the real AQA, OCR, or Edexcel specification. Your
                  qualification, your mark scheme, your command words.
                </p>
              </div>
            </FadeInChild>
            <FadeInChild>
              <div className="max-w-2xl border-l-2 border-teal py-1 pl-6">
                <h3 className="font-serif text-lg">
                  Remembers how you think
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-stone-650">
                  Your misconceptions, your confidence calibration, the topics
                  you avoid. It notices when you know more than you think. Every
                  session is shaped by every session before it.
                </p>
              </div>
            </FadeInChild>
            <FadeInChild>
              <div className="max-w-2xl border-l-2 border-teal py-1 pl-6">
                <h3 className="font-serif text-lg">
                  Gets smarter as exams approach
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-stone-650">
                  Eight weeks out: exploration and depth. Four weeks:
                  consolidation and drills. Final week: confidence and calm. The
                  system shifts to match what you need right now.
                </p>
              </div>
            </FadeInChild>
          </FadeInStagger>
        </div>
      </section>

      {/* For parents — dark panel with report mockup */}
      <section className="bg-stone-750 text-cream-100">
        <div className="mx-auto max-w-[1120px] px-6 py-28 md:px-8 md:py-36">
          <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-12">
            <FadeIn>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-450">
                  For parents
                </p>
                <h2 className="mt-3 font-serif text-[1.75rem] leading-[1.3] text-cream-100 md:text-[2.5rem]">
                  Finally see what&apos;s really happening
                </h2>
                <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-stone-450">
                  Weekly reports that go beyond &ldquo;3 hours studied.&rdquo;
                  See which topics are improving, where misconceptions recur,
                  whether your child is confident or struggling — and what you
                  can actually do about it.
                </p>
                <div className="mt-10 space-y-3 text-sm text-stone-450">
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Gap analysis — exactly which topics need work
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Confidence calibration — when they over- or under-estimate
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-light" />
                    Actionable insights — not just data, but what to say
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="mt-10 inline-block rounded-md bg-teal px-7 py-3.5 text-base font-medium text-white shadow-[0_2px_8px_rgba(45,122,110,0.3)] transition-all hover:bg-teal-dark hover:shadow-[0_4px_16px_rgba(45,122,110,0.4)]"
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

      {/* Final CTA — teal surface, celebratory */}
      <section className="bg-[#D6EBE7]">
        <div className="mx-auto max-w-[1120px] px-6 py-28 text-center md:px-8 md:py-36">
          <FadeIn>
            <h2 className="mx-auto max-w-[20ch] font-serif text-[1.75rem] leading-[1.3] text-stone-750 md:text-[3rem] md:leading-[1.2]">
              Revision that actually works
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-stone-650">
              Built for GCSE and A-Level students. Grounded on your exam spec.
              Adapts to how you learn.
            </p>
            <Link
              href="/signup"
              className="mt-10 inline-block rounded-md bg-teal px-7 py-3.5 text-base font-medium text-white shadow-[0_2px_8px_rgba(45,122,110,0.3)] transition-all hover:bg-teal-dark hover:shadow-[0_4px_16px_rgba(45,122,110,0.4)]"
            >
              Get started — it&apos;s free
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-cream-200 bg-cream-50">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-8 md:px-8">
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
