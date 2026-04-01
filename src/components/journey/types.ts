import type { TopicId } from "@/lib/types";

export interface MisconceptionThread {
  id: string;
  description: string;
  topicId: TopicId;
  topicName: string;
  severity: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
  resolved: boolean;
  resolvedAt: Date | null;
}

export interface JourneyMilestone {
  id: string;
  description: string;
  topicName: string;
  resolvedAt: Date;
  occurrenceCount: number;
}

export interface JourneyStats {
  sessionsCompleted: number;
  totalStudyMinutes: number;
  sessionsThisWeek: number;
  studyMinutesThisWeek: number;
  lastSessionAt: Date | null;
  misconceptionsTotal: number;
  misconceptionsConquered: number;
  specCoveragePercent: number;
  topicsCovered: number;
  totalTopics: number;
}

export interface JourneyData {
  conquered: MisconceptionThread[];
  active: MisconceptionThread[];
  milestones: JourneyMilestone[];
  stats: JourneyStats;
}
