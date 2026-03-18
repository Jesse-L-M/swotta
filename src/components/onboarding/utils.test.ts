import { describe, test, expect } from "vitest";
import {
  validateExamDate,
  validateTargetGrade,
  validateOnboardingSelection,
  getQualLevelLabel,
  groupQualificationsBySubject,
  filterQualificationsBySubjects,
  formatQualificationLabel,
} from "./utils";
import type { QualificationOption, SelectedQualification } from "./types";

describe("validateExamDate", () => {
  const now = new Date(2026, 2, 18);

  test("returns error for empty date", () => {
    expect(validateExamDate("", now)).toBe("Exam date is required");
  });

  test("returns error for invalid date", () => {
    expect(validateExamDate("not-a-date", now)).toBe("Invalid date");
  });

  test("returns error for past date", () => {
    expect(validateExamDate("2026-01-01", now)).toBe(
      "Exam date must be in the future"
    );
  });

  test("returns error for today", () => {
    expect(validateExamDate("2026-03-18", now)).toBe(
      "Exam date must be in the future"
    );
  });

  test("returns null for future date", () => {
    expect(validateExamDate("2026-06-15", now)).toBeNull();
  });

  test("returns null for tomorrow", () => {
    expect(validateExamDate("2026-03-19", now)).toBeNull();
  });
});

describe("validateTargetGrade", () => {
  test("returns error for empty grade", () => {
    expect(validateTargetGrade("")).toBe("Target grade is required");
    expect(validateTargetGrade("   ")).toBe("Target grade is required");
  });

  test("returns error for grade over 10 chars", () => {
    expect(validateTargetGrade("12345678901")).toBe(
      "Grade must be 10 characters or fewer"
    );
  });

  test("returns null for valid grades", () => {
    expect(validateTargetGrade("7")).toBeNull();
    expect(validateTargetGrade("A*")).toBeNull();
    expect(validateTargetGrade("Dist*")).toBeNull();
  });
});

describe("validateOnboardingSelection", () => {
  const now = new Date(2026, 2, 18);

  test("returns error for empty selections", () => {
    expect(validateOnboardingSelection([])).toBe(
      "Select at least one qualification"
    );
  });

  test("returns error for invalid exam date", () => {
    const selections: SelectedQualification[] = [
      {
        qualificationVersionId: "v1",
        qualificationName: "GCSE Biology",
        examBoardCode: "AQA",
        subjectName: "Biology",
        targetGrade: "7",
        examDate: "",
      },
    ];
    const error = validateOnboardingSelection(selections);
    expect(error).toContain("Biology");
    expect(error).toContain("required");
  });

  test("returns error for invalid target grade", () => {
    const selections: SelectedQualification[] = [
      {
        qualificationVersionId: "v1",
        qualificationName: "GCSE Biology",
        examBoardCode: "AQA",
        subjectName: "Biology",
        targetGrade: "",
        examDate: "2026-06-15",
      },
    ];
    const error = validateOnboardingSelection(selections);
    expect(error).toContain("Biology");
    expect(error).toContain("required");
  });

  test("returns null for valid selections", () => {
    const selections: SelectedQualification[] = [
      {
        qualificationVersionId: "v1",
        qualificationName: "GCSE Biology",
        examBoardCode: "AQA",
        subjectName: "Biology",
        targetGrade: "7",
        examDate: "2026-06-15",
      },
      {
        qualificationVersionId: "v2",
        qualificationName: "GCSE Chemistry",
        examBoardCode: "AQA",
        subjectName: "Chemistry",
        targetGrade: "8",
        examDate: "2026-06-20",
      },
    ];
    expect(validateOnboardingSelection(selections)).toBeNull();
  });
});

describe("getQualLevelLabel", () => {
  test("returns human-readable labels for known levels", () => {
    expect(getQualLevelLabel("GCSE")).toBe("GCSE");
    expect(getQualLevelLabel("AS")).toBe("AS Level");
    expect(getQualLevelLabel("A-Level")).toBe("A Level");
    expect(getQualLevelLabel("IB")).toBe("IB");
    expect(getQualLevelLabel("BTEC")).toBe("BTEC");
    expect(getQualLevelLabel("Scottish_National")).toBe("Scottish National");
    expect(getQualLevelLabel("Scottish_Higher")).toBe("Scottish Higher");
  });

  test("returns the level string for unknown levels", () => {
    expect(getQualLevelLabel("Unknown")).toBe("Unknown");
  });
});

describe("groupQualificationsBySubject", () => {
  const quals: QualificationOption[] = [
    {
      qualificationVersionId: "v1",
      qualificationName: "GCSE Biology",
      subjectId: "s1",
      subjectName: "Biology",
      examBoardCode: "AQA",
      examBoardName: "AQA",
      level: "GCSE",
      versionCode: "8461",
    },
    {
      qualificationVersionId: "v2",
      qualificationName: "GCSE Biology",
      subjectId: "s1",
      subjectName: "Biology",
      examBoardCode: "OCR",
      examBoardName: "OCR",
      level: "GCSE",
      versionCode: "J247",
    },
    {
      qualificationVersionId: "v3",
      qualificationName: "GCSE Chemistry",
      subjectId: "s2",
      subjectName: "Chemistry",
      examBoardCode: "AQA",
      examBoardName: "AQA",
      level: "GCSE",
      versionCode: "8462",
    },
  ];

  test("groups qualifications by subject ID", () => {
    const grouped = groupQualificationsBySubject(quals);
    expect(grouped.size).toBe(2);
    expect(grouped.get("s1")!.length).toBe(2);
    expect(grouped.get("s2")!.length).toBe(1);
  });

  test("returns empty map for empty input", () => {
    expect(groupQualificationsBySubject([]).size).toBe(0);
  });
});

describe("filterQualificationsBySubjects", () => {
  const quals: QualificationOption[] = [
    {
      qualificationVersionId: "v1",
      qualificationName: "GCSE Biology",
      subjectId: "s1",
      subjectName: "Biology",
      examBoardCode: "AQA",
      examBoardName: "AQA",
      level: "GCSE",
      versionCode: "8461",
    },
    {
      qualificationVersionId: "v2",
      qualificationName: "GCSE Chemistry",
      subjectId: "s2",
      subjectName: "Chemistry",
      examBoardCode: "AQA",
      examBoardName: "AQA",
      level: "GCSE",
      versionCode: "8462",
    },
  ];

  test("filters to selected subjects only", () => {
    const filtered = filterQualificationsBySubjects(quals, ["s1"]);
    expect(filtered.length).toBe(1);
    expect(filtered[0].subjectId).toBe("s1");
  });

  test("returns empty for no matching subjects", () => {
    expect(filterQualificationsBySubjects(quals, ["s99"]).length).toBe(0);
  });

  test("returns all when all subjects selected", () => {
    expect(filterQualificationsBySubjects(quals, ["s1", "s2"]).length).toBe(2);
  });
});

describe("formatQualificationLabel", () => {
  test("formats qualification name with exam board code", () => {
    const q: QualificationOption = {
      qualificationVersionId: "v1",
      qualificationName: "GCSE Biology",
      subjectId: "s1",
      subjectName: "Biology",
      examBoardCode: "AQA",
      examBoardName: "AQA",
      level: "GCSE",
      versionCode: "8461",
    };
    expect(formatQualificationLabel(q)).toBe("GCSE Biology (AQA)");
  });
});
