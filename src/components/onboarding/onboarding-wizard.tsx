"use client";

import { useState, useTransition } from "react";
import type {
  SubjectOption,
  QualificationOption,
  SelectedQualification,
} from "./types";
import { validateOnboardingSelection } from "./utils";
import { StepIndicator } from "./step-indicator";
import { SubjectPicker } from "./subject-picker";
import { QualificationPicker } from "./qualification-picker";
import { ExamDateEntry } from "./exam-date-entry";
import { completeOnboarding } from "@/app/(student)/onboarding/actions";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
  learnerId: string;
  subjects: SubjectOption[];
  qualifications: QualificationOption[];
}

const STEPS = ["Subjects", "Qualifications", "Exam dates"];

export function OnboardingWizard({
  learnerId,
  subjects,
  qualifications,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<SelectedQualification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSubject(id: string) {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleQualification(versionId: string) {
    setSelectedVersionIds((prev) => {
      const next = prev.includes(versionId)
        ? prev.filter((v) => v !== versionId)
        : [...prev, versionId];

      setSelections((curr) => {
        const existing = new Set(curr.map((s) => s.qualificationVersionId));
        const result = curr.filter((s) => next.includes(s.qualificationVersionId));
        for (const vid of next) {
          if (!existing.has(vid)) {
            const q = qualifications.find((q) => q.qualificationVersionId === vid);
            if (q) {
              result.push({
                qualificationVersionId: vid,
                qualificationName: q.qualificationName,
                examBoardCode: q.examBoardCode,
                subjectName: q.subjectName,
                targetGrade: "",
                examDate: "",
              });
            }
          }
        }
        return result;
      });

      return next;
    });
  }

  function updateSelection(
    qualificationVersionId: string,
    field: "targetGrade" | "examDate",
    value: string
  ) {
    setSelections((prev) =>
      prev.map((s) =>
        s.qualificationVersionId === qualificationVersionId
          ? { ...s, [field]: value }
          : s
      )
    );
  }

  function handleNext() {
    setError(null);
    if (step === 0 && selectedSubjectIds.length === 0) {
      setError("Select at least one subject");
      return;
    }
    if (step === 1 && selectedVersionIds.length === 0) {
      setError("Select at least one qualification");
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function handleComplete() {
    setError(null);
    const validationError = validateOnboardingSelection(selections);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      const result = await completeOnboarding(
        learnerId,
        selections.map((s) => ({
          qualificationVersionId: s.qualificationVersionId,
          targetGrade: s.targetGrade,
          examDate: s.examDate,
        }))
      );
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1A2E]">
          Set up your studies
        </h1>
        <p className="mt-2 text-[#6B7280]">
          We&apos;ll create a personalised study plan based on your subjects and
          exam dates.
        </p>
      </div>

      <div className="mb-8">
        <StepIndicator steps={STEPS} currentStep={step} />
      </div>

      <div className="rounded-2xl border border-[#E8E4DB] bg-white p-6 shadow-sm">
        {step === 0 && (
          <SubjectPicker
            subjects={subjects}
            selected={selectedSubjectIds}
            onToggle={toggleSubject}
          />
        )}
        {step === 1 && (
          <QualificationPicker
            qualifications={qualifications}
            selectedSubjectIds={selectedSubjectIds}
            selectedVersionIds={selectedVersionIds}
            onToggle={toggleQualification}
          />
        )}
        {step === 2 && (
          <ExamDateEntry
            qualifications={qualifications}
            selectedVersionIds={selectedVersionIds}
            selections={selections}
            onUpdate={updateSelection}
          />
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-[#F97066]">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg border border-[#E8E4DB] px-4 py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#F5F2EC]"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending}
              className={cn(
                "rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700",
                isPending && "opacity-50"
              )}
            >
              {isPending ? "Setting up..." : "Complete setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
