export interface SubjectOption {
  id: string;
  name: string;
  slug: string;
}

export interface QualificationOption {
  qualificationVersionId: string;
  qualificationName: string;
  subjectId: string;
  subjectName: string;
  examBoardCode: string;
  examBoardName: string;
  level: string;
  versionCode: string;
}

export interface SelectedQualification {
  qualificationVersionId: string;
  qualificationName: string;
  examBoardCode: string;
  subjectName: string;
  targetGrade: string;
  examDate: string;
}

export interface OnboardingData {
  subjects: SubjectOption[];
  qualifications: QualificationOption[];
}
