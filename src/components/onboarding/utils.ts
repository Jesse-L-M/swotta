import type { QualificationOption, SelectedQualification } from "./types";

export function validateExamDate(date: string, now?: Date): string | null {
  if (!date) return "Exam date is required";
  const ref = now ?? new Date();
  const examDate = new Date(date + "T00:00:00");
  if (isNaN(examDate.getTime())) return "Invalid date";
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (examDate <= refDay) return "Exam date must be in the future";
  return null;
}

export function validateTargetGrade(grade: string): string | null {
  if (!grade.trim()) return "Target grade is required";
  if (grade.trim().length > 10) return "Grade must be 10 characters or fewer";
  return null;
}

export function validateOnboardingSelection(
  selections: SelectedQualification[]
): string | null {
  if (selections.length === 0) return "Select at least one qualification";
  for (const s of selections) {
    const dateError = validateExamDate(s.examDate);
    if (dateError)
      return `${s.subjectName}: ${dateError}`;
    const gradeError = validateTargetGrade(s.targetGrade);
    if (gradeError)
      return `${s.subjectName}: ${gradeError}`;
  }
  return null;
}

export function getQualLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    GCSE: "GCSE",
    AS: "AS Level",
    "A-Level": "A Level",
    IB: "IB",
    BTEC: "BTEC",
    Scottish_National: "Scottish National",
    Scottish_Higher: "Scottish Higher",
  };
  return labels[level] ?? level;
}

export function groupQualificationsBySubject(
  quals: QualificationOption[]
): Map<string, QualificationOption[]> {
  const grouped = new Map<string, QualificationOption[]>();
  for (const q of quals) {
    const key = q.subjectId;
    const existing = grouped.get(key) ?? [];
    existing.push(q);
    grouped.set(key, existing);
  }
  return grouped;
}

export function filterQualificationsBySubjects(
  quals: QualificationOption[],
  subjectIds: string[]
): QualificationOption[] {
  const set = new Set(subjectIds);
  return quals.filter((q) => set.has(q.subjectId));
}

export function formatQualificationLabel(q: QualificationOption): string {
  return `${q.qualificationName} (${q.examBoardCode})`;
}
