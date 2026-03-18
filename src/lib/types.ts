// Branded ID types for type safety across engine boundaries
type Brand<T, B extends string> = T & { readonly __brand: B };

export type LearnerId = Brand<string, "LearnerId">;
export type TopicId = Brand<string, "TopicId">;
export type QualificationVersionId = Brand<
  string,
  "QualificationVersionId"
>;
export type SessionId = Brand<string, "SessionId">;
export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">;
export type ChunkId = Brand<string, "ChunkId">;
export type BlockId = Brand<string, "BlockId">;
export type AttemptId = Brand<string, "AttemptId">;

// Enums (match DB custom types in src/db/schema/enums.ts)

export type BlockType =
  | "retrieval_drill"
  | "explanation"
  | "worked_example"
  | "timed_problems"
  | "essay_planning"
  | "source_analysis"
  | "mistake_review"
  | "reentry";

export type RetentionOutcome = "remembered" | "partial" | "forgotten";

export type ReviewReason =
  | "scheduled"
  | "decay"
  | "misconception"
  | "exam_approaching";

export type ScopeType = "private" | "household" | "class" | "org" | "system";

// Composite types used across engine interfaces

export interface TopicMastery {
  topicId: TopicId;
  topicName: string;
  masteryLevel: number;
  confidence: number;
  nextReviewAt: Date | null;
  streak: number;
  isOverdue: boolean;
}

export interface StudyBlock {
  id: BlockId;
  learnerId: LearnerId;
  topicId: TopicId;
  topicName: string;
  blockType: BlockType;
  durationMinutes: number;
  priority: number;
  reason: string;
}

export interface AttemptOutcome {
  blockId: BlockId;
  score: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  helpRequested: boolean;
  helpTiming: "before_attempt" | "after_attempt" | null;
  misconceptions: DetectedMisconception[];
  retentionOutcome: RetentionOutcome | null;
  durationMinutes: number;
  rawInteraction: Record<string, unknown> | null;
}

export interface DetectedMisconception {
  topicId: TopicId;
  ruleId: string | null;
  description: string;
  severity: 1 | 2 | 3;
}

export interface RetrievalResult {
  chunkId: ChunkId;
  content: string;
  score: number;
  topicId: TopicId | null;
  sourceFileName: string;
  sourceFileId: string;
}

export interface LearnerQualification {
  learnerId: LearnerId;
  qualificationVersionId: QualificationVersionId;
  qualificationName: string;
  examBoardCode: string;
  targetGrade: string | null;
  examDate: Date | null;
  status: "active" | "completed" | "dropped";
}

export interface PolicyValue {
  scopeType: "global" | "qualification" | "org" | "class" | "learner";
  scopeId: string | null;
  key: string;
  value: unknown;
}

export interface WeeklyReportData {
  learnerId: LearnerId;
  periodStart: Date;
  periodEnd: Date;
  sessionsCompleted: number;
  totalStudyMinutes: number;
  topicsReviewed: number;
  masteryChanges: Array<{
    topicId: TopicId;
    topicName: string;
    before: number;
    after: number;
    delta: number;
  }>;
  flags: Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  summary: string;
}

export interface TopicTreeNode {
  id: TopicId;
  name: string;
  code: string | null;
  depth: number;
  children: TopicTreeNode[];
  edges: Array<{
    toTopicId: TopicId;
    edgeType: "prerequisite" | "builds_on" | "related";
  }>;
}

export interface QualificationSeed {
  subject: { name: string; slug: string };
  examBoard: { name: string; code: string };
  level: string;
  versionCode: string;
  firstExamYear: number;
  specUrl?: string;
  components: Array<{
    name: string;
    code: string;
    weightPercent: number;
    durationMinutes?: number;
    totalMarks?: number;
    isExam: boolean;
  }>;
  topics: Array<TopicSeedNode>;
  commandWords: Array<{
    word: string;
    definition: string;
    expectedDepth: number;
  }>;
  questionTypes: Array<{
    name: string;
    description?: string;
    typicalMarks?: number;
    markSchemePattern?: string;
  }>;
  misconceptionRules?: Array<{
    topicCode: string;
    description: string;
    triggerPatterns: string[];
    correctionGuidance: string;
    severity?: number;
  }>;
}

export interface TopicSeedNode {
  name: string;
  code?: string;
  estimatedHours?: number;
  description?: string;
  children?: TopicSeedNode[];
  edges?: Array<{
    toCode: string;
    type: "prerequisite" | "builds_on" | "related";
  }>;
}

export interface SchedulerConfig {
  maxBlocksPerSession: number;
  defaultSessionMinutes: number;
  examPressureWeightMultiplier: number;
  decayUrgencyDays: number;
}
