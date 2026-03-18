"use client";

import type { QualificationOption } from "./types";
import {
  getQualLevelLabel,
  filterQualificationsBySubjects,
  groupQualificationsBySubject,
  formatQualificationLabel,
} from "./utils";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface QualificationPickerProps {
  qualifications: QualificationOption[];
  selectedSubjectIds: string[];
  selectedVersionIds: string[];
  onToggle: (qualificationVersionId: string) => void;
}

export function QualificationPicker({
  qualifications,
  selectedSubjectIds,
  selectedVersionIds,
  onToggle,
}: QualificationPickerProps) {
  const filtered = filterQualificationsBySubjects(
    qualifications,
    selectedSubjectIds
  );
  const grouped = groupQualificationsBySubject(filtered);
  const selectedSet = new Set(selectedVersionIds);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          Choose your qualifications
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Select the specific exam board and qualification for each subject.
        </p>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([subjectId, quals]) => (
          <div key={subjectId}>
            <h3 className="mb-2 text-sm font-semibold text-[#1A1A2E]">
              {quals[0].subjectName}
            </h3>
            <div className="space-y-2">
              {quals.map((q) => {
                const isSelected = selectedSet.has(q.qualificationVersionId);
                return (
                  <button
                    key={q.qualificationVersionId}
                    type="button"
                    onClick={() => onToggle(q.qualificationVersionId)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      isSelected
                        ? "border-teal-400 bg-teal-50"
                        : "border-[#E8E4DB] bg-white hover:border-teal-200 hover:bg-teal-50/30"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-teal-600 bg-teal-600"
                          : "border-[#D1D5DB]"
                      )}
                    >
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1A1A2E]">
                        {formatQualificationLabel(q)}
                      </p>
                      <p className="text-xs text-[#6B7280]">
                        {getQualLevelLabel(q.level)} &middot; {q.versionCode}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {grouped.size === 0 && (
        <p className="py-8 text-center text-sm text-[#6B7280]">
          No qualifications available for your selected subjects.
        </p>
      )}
    </div>
  );
}
