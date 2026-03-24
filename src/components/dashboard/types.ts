import type {
  StudyBlock,
} from "@/lib/types";

export interface DashboardQualification {
  id: string;
  qualificationVersionId: string;
  qualificationName: string;
  subjectName: string;
  examBoardCode: string;
  targetGrade: string | null;
  examDate: string | null;
}

export interface DashboardStats {
  totalSessions: number;
  totalStudyMinutes: number;
  averageMastery: number;
  topicsStudied: number;
  topicsTotal: number;
  currentStreak: number;
}

export interface MasteryTopic {
  topicId: string;
  topicName: string;
  masteryLevel: number;
  qualificationVersionId: string;
}

export interface DashboardData {
  learner: {
    id: string;
    displayName: string;
    yearGroup: number | null;
  };
  qualifications: DashboardQualification[];
  todayQueue: StudyBlock[];
  stats: DashboardStats;
  masteryTopics: MasteryTopic[];
}
