"use client";

import type { SubjectOption } from "./types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface SubjectPickerProps {
  subjects: SubjectOption[];
  selected: string[];
  onToggle: (subjectId: string) => void;
}

export function SubjectPicker({
  subjects,
  selected,
  onToggle,
}: SubjectPickerProps) {
  const selectedSet = new Set(selected);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          What are you studying?
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Select the subjects you&apos;re currently taking.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects.map((subject) => {
          const isSelected = selectedSet.has(subject.id);
          return (
            <button
              key={subject.id}
              type="button"
              onClick={() => onToggle(subject.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                isSelected
                  ? "border-teal-400 bg-teal-50 text-teal-700"
                  : "border-[#E8E4DB] bg-white text-[#1A1A2E] hover:border-teal-200 hover:bg-teal-50/30"
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  isSelected
                    ? "border-teal-600 bg-teal-600"
                    : "border-[#D1D5DB]"
                )}
              >
                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
              </div>
              {subject.name}
            </button>
          );
        })}
      </div>

      {subjects.length === 0 && (
        <p className="py-8 text-center text-sm text-[#6B7280]">
          No subjects available. Contact your school administrator.
        </p>
      )}
    </div>
  );
}
