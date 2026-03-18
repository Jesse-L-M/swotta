"use client";

import type { QualificationOption, SelectedQualification } from "./types";
import { formatQualificationLabel, getQualLevelLabel } from "./utils";

interface ExamDateEntryProps {
  qualifications: QualificationOption[];
  selectedVersionIds: string[];
  selections: SelectedQualification[];
  onUpdate: (qualificationVersionId: string, field: "targetGrade" | "examDate", value: string) => void;
}

export function ExamDateEntry({
  qualifications,
  selectedVersionIds,
  selections,
  onUpdate,
}: ExamDateEntryProps) {
  const selected = qualifications.filter((q) =>
    selectedVersionIds.includes(q.qualificationVersionId)
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-serif)] text-xl text-[#1A1A2E]">
          Set your exam dates
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Enter your exam dates and target grades so we can prioritise your
          study plan.
        </p>
      </div>

      <div className="space-y-4">
        {selected.map((q) => {
          const sel = selections.find(
            (s) => s.qualificationVersionId === q.qualificationVersionId
          );
          return (
            <div
              key={q.qualificationVersionId}
              className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4"
            >
              <p className="text-sm font-medium text-[#1A1A2E]">
                {formatQualificationLabel(q)}
              </p>
              <p className="text-xs text-[#6B7280]">
                {getQualLevelLabel(q.level)}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`exam-date-${q.qualificationVersionId}`}
                    className="block text-xs font-medium text-[#6B7280]"
                  >
                    Exam date
                  </label>
                  <input
                    id={`exam-date-${q.qualificationVersionId}`}
                    type="date"
                    value={sel?.examDate ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        q.qualificationVersionId,
                        "examDate",
                        e.target.value
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-[#E8E4DB] bg-white px-3 py-2 text-sm text-[#1A1A2E] outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`target-grade-${q.qualificationVersionId}`}
                    className="block text-xs font-medium text-[#6B7280]"
                  >
                    Target grade
                  </label>
                  <input
                    id={`target-grade-${q.qualificationVersionId}`}
                    type="text"
                    placeholder="e.g. 7, A*, B"
                    value={sel?.targetGrade ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        q.qualificationVersionId,
                        "targetGrade",
                        e.target.value
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-[#E8E4DB] bg-white px-3 py-2 text-sm text-[#1A1A2E] outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
