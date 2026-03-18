import { eq, and, count, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  learnerQualifications,
  learnerTopicState,
  topics,
  studySessions,
  studyBlocks,
  misconceptionEvents,
  qualificationVersions,
  qualifications,
} from "@/db/schema";
import type {
  LearnerId,
  QualificationVersionId,
  TopicId,
  BlockType,
} from "@/lib/types";

// --- Types ---

export type ExamPhaseName =
  | "exploration"
  | "consolidation"
  | "revision"
  | "confidence";

export interface SchedulerWeights {
  blockTypeWeights: Record<BlockType, number>;
  newTopicWeight: number;
  weakTopicWeight: number;
  reviewTopicWeight: number;
  sessionMinutesMultiplier: number;
}

export interface ToneModifiers {
  encouragement: "high" | "medium" | "low";
  urgency: "high" | "medium" | "low";
  positivity: "high" | "medium" | "low";
  directness: "high" | "medium" | "low";
  description: string;
}

export interface AnxietySignals {
  enabled: boolean;
  triggers: string[];
}

export interface ExamPhase {
  phase: ExamPhaseName;
  weeksToExam: number;
  daysToExam: number;
  examDate: Date;
  schedulerWeights: SchedulerWeights;
  toneModifiers: ToneModifiers;
  anxietySignals: AnxietySignals;
}

export interface PostExamSummary {
  qualificationName: string;
  examDate: Date;
  sessionsCompleted: number;
  totalStudyMinutes: number;
  misconceptionsTotal: number;
  misconceptionsResolved: number;
  specCoveragePercent: number;
  topicsCovered: number;
  totalTopics: number;
  averageMastery: number;
  strongestTopics: Array<{
    topicId: TopicId;
    topicName: string;
    mastery: number;
  }>;
  weakestTopics: Array<{
    topicId: TopicId;
    topicName: string;
    mastery: number;
  }>;
}

// --- Pure functions ---

export function calculateDaysToExam(now: Date, examDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const nowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const examStart = new Date(
    examDate.getFullYear(),
    examDate.getMonth(),
    examDate.getDate()
  );
  return Math.round((examStart.getTime() - nowStart.getTime()) / msPerDay);
}

export function determinePhase(daysToExam: number): ExamPhaseName {
  if (daysToExam >= 56) return "exploration";
  if (daysToExam >= 28) return "consolidation";
  if (daysToExam >= 7) return "revision";
  return "confidence";
}

export function getSchedulerWeightsForPhase(
  phase: ExamPhaseName
): SchedulerWeights {
  switch (phase) {
    case "exploration":
      return {
        blockTypeWeights: {
          retrieval_drill: 1.0,
          explanation: 1.3,
          worked_example: 1.2,
          timed_problems: 0.5,
          essay_planning: 1.4,
          source_analysis: 1.2,
          mistake_review: 0.8,
          reentry: 1.0,
        },
        newTopicWeight: 1.5,
        weakTopicWeight: 1.0,
        reviewTopicWeight: 1.0,
        sessionMinutesMultiplier: 1.2,
      };
    case "consolidation":
      return {
        blockTypeWeights: {
          retrieval_drill: 1.5,
          explanation: 0.8,
          worked_example: 1.0,
          timed_problems: 1.3,
          essay_planning: 1.0,
          source_analysis: 0.8,
          mistake_review: 1.3,
          reentry: 0.5,
        },
        newTopicWeight: 0.3,
        weakTopicWeight: 1.5,
        reviewTopicWeight: 1.3,
        sessionMinutesMultiplier: 1.0,
      };
    case "revision":
      return {
        blockTypeWeights: {
          retrieval_drill: 2.0,
          explanation: 0.3,
          worked_example: 0.5,
          timed_problems: 1.8,
          essay_planning: 0.5,
          source_analysis: 0.3,
          mistake_review: 1.5,
          reentry: 0.2,
        },
        newTopicWeight: 0.1,
        weakTopicWeight: 2.0,
        reviewTopicWeight: 1.5,
        sessionMinutesMultiplier: 0.7,
      };
    case "confidence":
      return {
        blockTypeWeights: {
          retrieval_drill: 1.5,
          explanation: 0.2,
          worked_example: 0.3,
          timed_problems: 0.5,
          essay_planning: 0.2,
          source_analysis: 0.2,
          mistake_review: 0.3,
          reentry: 0.1,
        },
        newTopicWeight: 0.0,
        weakTopicWeight: 0.3,
        reviewTopicWeight: 0.5,
        sessionMinutesMultiplier: 0.5,
      };
  }
}

export function getToneModifiersForPhase(
  phase: ExamPhaseName
): ToneModifiers {
  switch (phase) {
    case "exploration":
      return {
        encouragement: "medium",
        urgency: "low",
        positivity: "medium",
        directness: "medium",
        description:
          "Curious and exploratory. Take your time to understand deeply. There's no rush — build strong foundations now.",
      };
    case "consolidation":
      return {
        encouragement: "medium",
        urgency: "medium",
        positivity: "medium",
        directness: "high",
        description:
          "Focused and purposeful. Let's strengthen what you know and fill the gaps that matter most.",
      };
    case "revision":
      return {
        encouragement: "high",
        urgency: "high",
        positivity: "medium",
        directness: "high",
        description:
          "Sharp and efficient. Every session counts. Retrieve, test, and lock in your knowledge.",
      };
    case "confidence":
      return {
        encouragement: "high",
        urgency: "low",
        positivity: "high",
        directness: "low",
        description:
          "Calm and reassuring. You've put in the work. Trust what you know. Light revision only.",
      };
  }
}

export function getAnxietySignalsForPhase(
  phase: ExamPhaseName
): AnxietySignals {
  if (phase === "confidence") {
    return {
      enabled: true,
      triggers: [
        "I can't do this",
        "I'm going to fail",
        "too hard",
        "give up",
        "I don't know anything",
        "panicking",
        "stressed",
        "anxious",
        "overwhelmed",
        "not ready",
        "hopeless",
        "scared",
      ],
    };
  }
  return { enabled: false, triggers: [] };
}

// --- DB functions ---

export async function getExamPhase(
  db: Database,
  learnerId: LearnerId,
  qualVersionId: QualificationVersionId,
  now?: Date
): Promise<ExamPhase> {
  const [enrollment] = await db
    .select()
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.qualificationVersionId, qualVersionId)
      )
    )
    .limit(1);

  if (!enrollment) {
    throw new Error(
      `No qualification enrollment found for learner ${learnerId}, qualification version ${qualVersionId}`
    );
  }

  if (!enrollment.examDate) {
    throw new Error(
      `No exam date set for learner ${learnerId}, qualification version ${qualVersionId}. Exam date is required for proximity calculations.`
    );
  }

  const examDate = new Date(enrollment.examDate + "T00:00:00");
  const currentDate = now ?? new Date();
  const daysToExam = calculateDaysToExam(currentDate, examDate);
  const weeksToExam = Math.max(0, Math.floor(daysToExam / 7));
  const phase = determinePhase(daysToExam);

  return {
    phase,
    weeksToExam,
    daysToExam,
    examDate,
    schedulerWeights: getSchedulerWeightsForPhase(phase),
    toneModifiers: getToneModifiersForPhase(phase),
    anxietySignals: getAnxietySignalsForPhase(phase),
  };
}

export async function generatePostExamSummary(
  db: Database,
  learnerId: LearnerId,
  qualVersionId: QualificationVersionId
): Promise<PostExamSummary> {
  const [enrollment] = await db
    .select({
      examDate: learnerQualifications.examDate,
      qualName: qualifications.name,
    })
    .from(learnerQualifications)
    .innerJoin(
      qualificationVersions,
      eq(
        learnerQualifications.qualificationVersionId,
        qualificationVersions.id
      )
    )
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.qualificationVersionId, qualVersionId)
      )
    )
    .limit(1);

  if (!enrollment) {
    throw new Error(
      `No qualification enrollment found for learner ${learnerId}, qualification version ${qualVersionId}`
    );
  }

  if (!enrollment.examDate) {
    throw new Error(
      `No exam date set for learner ${learnerId}, qualification version ${qualVersionId}`
    );
  }

  const examDate = new Date(enrollment.examDate + "T00:00:00");

  const qualTopics = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(eq(topics.qualificationVersionId, qualVersionId));

  const totalTopics = qualTopics.length;

  if (totalTopics === 0) {
    return {
      qualificationName: enrollment.qualName,
      examDate,
      sessionsCompleted: 0,
      totalStudyMinutes: 0,
      misconceptionsTotal: 0,
      misconceptionsResolved: 0,
      specCoveragePercent: 0,
      topicsCovered: 0,
      totalTopics: 0,
      averageMastery: 0,
      strongestTopics: [],
      weakestTopics: [],
    };
  }

  // Sessions completed for this qualification
  const [sessionStats] = await db
    .select({
      sessionsCompleted: count(),
      totalMinutes:
        sql<string>`coalesce(sum(${studySessions.totalDurationMinutes}), 0)`,
    })
    .from(studySessions)
    .innerJoin(studyBlocks, eq(studySessions.blockId, studyBlocks.id))
    .innerJoin(topics, eq(studyBlocks.topicId, topics.id))
    .where(
      and(
        eq(studySessions.learnerId, learnerId),
        eq(studySessions.status, "completed"),
        eq(topics.qualificationVersionId, qualVersionId)
      )
    );

  const sessionsCompleted = Number(sessionStats?.sessionsCompleted ?? 0);
  const totalStudyMinutes = Number(sessionStats?.totalMinutes ?? 0);

  // Misconceptions total
  const [totalMisc] = await db
    .select({ count: count() })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        eq(topics.qualificationVersionId, qualVersionId)
      )
    );

  // Misconceptions resolved
  const [resolvedMisc] = await db
    .select({ count: count() })
    .from(misconceptionEvents)
    .innerJoin(topics, eq(misconceptionEvents.topicId, topics.id))
    .where(
      and(
        eq(misconceptionEvents.learnerId, learnerId),
        eq(topics.qualificationVersionId, qualVersionId),
        eq(misconceptionEvents.resolved, true)
      )
    );

  const misconceptionsTotal = Number(totalMisc?.count ?? 0);
  const misconceptionsResolved = Number(resolvedMisc?.count ?? 0);

  // Topic mastery states
  const topicMastery = await db
    .select({
      topicId: learnerTopicState.topicId,
      topicName: topics.name,
      mastery: learnerTopicState.masteryLevel,
    })
    .from(learnerTopicState)
    .innerJoin(topics, eq(learnerTopicState.topicId, topics.id))
    .where(
      and(
        eq(learnerTopicState.learnerId, learnerId),
        eq(topics.qualificationVersionId, qualVersionId)
      )
    );

  const masteryValues = topicMastery.map((t) => Number(t.mastery));
  const topicsCovered = masteryValues.filter((m) => m > 0).length;
  const specCoveragePercent =
    totalTopics > 0
      ? Math.round((topicsCovered / totalTopics) * 100 * 10) / 10
      : 0;
  const averageMastery =
    masteryValues.length > 0
      ? Math.round(
          (masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length) *
            1000
        ) / 1000
      : 0;

  const sortedByMastery = topicMastery
    .map((t) => ({
      topicId: t.topicId as TopicId,
      topicName: t.topicName,
      mastery: Number(t.mastery),
    }))
    .sort((a, b) => b.mastery - a.mastery);

  const strongestTopics = sortedByMastery.slice(0, 5);
  const weakestTopics = [...sortedByMastery].reverse().slice(0, 5);

  return {
    qualificationName: enrollment.qualName,
    examDate,
    sessionsCompleted,
    totalStudyMinutes,
    misconceptionsTotal,
    misconceptionsResolved,
    specCoveragePercent,
    topicsCovered,
    totalTopics,
    averageMastery,
    strongestTopics,
    weakestTopics,
  };
}
