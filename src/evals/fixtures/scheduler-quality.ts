export interface SchedulerEvalTopicFixture {
  id: string;
  name: string;
  masteryLevel: number;
  streak: number;
  nextReviewOffsetDays: number;
  importanceWeight: number;
  tags: string[];
}

export interface SchedulerEvalScenario {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  studyDays: number;
  examDateOffsetDays: number;
  randomSeed: number;
  topics: SchedulerEvalTopicFixture[];
}

export const SCHEDULER_EVAL_FIXTURES: SchedulerEvalScenario[] = [
  {
    id: "exam-crunch-biology",
    title: "Exam-crunch learner with two urgent low-mastery gaps",
    summary:
      "Mixed profile with imminent exam pressure, overdue weak topics, and two high-mastery topics that should eventually flip into harder practice.",
    provenance:
      "Synthetic scheduler fixture committed in src/evals/fixtures/scheduler-quality.ts on 2026-03-30. Built from the next-study-block hypotheses in EVALS.md.",
    studyDays: 14,
    examDateOffsetDays: 12,
    randomSeed: 7,
    topics: [
      {
        id: "topic-sched-1",
        name: "Cell transport",
        masteryLevel: 0.18,
        streak: 0,
        nextReviewOffsetDays: -18,
        importanceWeight: 1.4,
        tags: ["urgent_gap", "initially_overdue"],
      },
      {
        id: "topic-sched-2",
        name: "Mitosis",
        masteryLevel: 0.24,
        streak: 0,
        nextReviewOffsetDays: -10,
        importanceWeight: 1.3,
        tags: ["urgent_gap", "initially_overdue"],
      },
      {
        id: "topic-sched-3",
        name: "Enzymes",
        masteryLevel: 0.52,
        streak: 1,
        nextReviewOffsetDays: -2,
        importanceWeight: 1.0,
        tags: ["initially_overdue"],
      },
      {
        id: "topic-sched-4",
        name: "Homeostasis",
        masteryLevel: 0.77,
        streak: 3,
        nextReviewOffsetDays: 2,
        importanceWeight: 1.2,
        tags: ["exam_ready"],
      },
      {
        id: "topic-sched-5",
        name: "Respiration",
        masteryLevel: 0.66,
        streak: 2,
        nextReviewOffsetDays: 5,
        importanceWeight: 1.0,
        tags: [],
      },
    ],
  },
  {
    id: "gap-recovery-after-break",
    title: "Learner returning after a long gap",
    summary:
      "Profile dominated by stale reviews and weak streaks, where a good scheduler should front-load reentry and explanation blocks rather than bouncing randomly.",
    provenance:
      "Synthetic scheduler fixture committed in src/evals/fixtures/scheduler-quality.ts on 2026-03-30. Built to exercise the overdue and reentry parts of the scheduler.",
    studyDays: 21,
    examDateOffsetDays: 35,
    randomSeed: 17,
    topics: [
      {
        id: "topic-sched-6",
        name: "Photosynthesis",
        masteryLevel: 0.21,
        streak: 0,
        nextReviewOffsetDays: -25,
        importanceWeight: 1.2,
        tags: ["urgent_gap", "initially_overdue"],
      },
      {
        id: "topic-sched-7",
        name: "Ecology",
        masteryLevel: 0.37,
        streak: 0,
        nextReviewOffsetDays: -20,
        importanceWeight: 1.0,
        tags: ["initially_overdue"],
      },
      {
        id: "topic-sched-8",
        name: "Inheritance",
        masteryLevel: 0.48,
        streak: 1,
        nextReviewOffsetDays: -7,
        importanceWeight: 1.1,
        tags: ["initially_overdue"],
      },
      {
        id: "topic-sched-9",
        name: "Variation",
        masteryLevel: 0.62,
        streak: 2,
        nextReviewOffsetDays: 4,
        importanceWeight: 0.9,
        tags: [],
      },
      {
        id: "topic-sched-10",
        name: "Hormones",
        masteryLevel: 0.74,
        streak: 3,
        nextReviewOffsetDays: 6,
        importanceWeight: 1.0,
        tags: ["exam_ready"],
      },
    ],
  },
  {
    id: "balanced-half-term",
    title: "Balanced learner with a broad syllabus still to touch",
    summary:
      "Broader, less extreme profile that checks whether the scheduler still preserves coverage while lifting urgent gaps earlier than the naive baselines.",
    provenance:
      "Synthetic scheduler fixture committed in src/evals/fixtures/scheduler-quality.ts on 2026-03-30. Designed to keep the harness honest on coverage rather than only on crisis cases.",
    studyDays: 18,
    examDateOffsetDays: 24,
    randomSeed: 29,
    topics: [
      {
        id: "topic-sched-11",
        name: "Diffusion",
        masteryLevel: 0.31,
        streak: 0,
        nextReviewOffsetDays: -8,
        importanceWeight: 1.1,
        tags: ["urgent_gap", "initially_overdue"],
      },
      {
        id: "topic-sched-12",
        name: "Osmosis",
        masteryLevel: 0.45,
        streak: 1,
        nextReviewOffsetDays: -3,
        importanceWeight: 1.0,
        tags: ["initially_overdue"],
      },
      {
        id: "topic-sched-13",
        name: "Active transport",
        masteryLevel: 0.53,
        streak: 1,
        nextReviewOffsetDays: 1,
        importanceWeight: 1.1,
        tags: [],
      },
      {
        id: "topic-sched-14",
        name: "Organisation",
        masteryLevel: 0.68,
        streak: 2,
        nextReviewOffsetDays: 3,
        importanceWeight: 0.9,
        tags: [],
      },
      {
        id: "topic-sched-15",
        name: "Infection response",
        masteryLevel: 0.8,
        streak: 4,
        nextReviewOffsetDays: 4,
        importanceWeight: 1.0,
        tags: ["exam_ready"],
      },
      {
        id: "topic-sched-16",
        name: "Bioenergetics",
        masteryLevel: 0.4,
        streak: 1,
        nextReviewOffsetDays: 0,
        importanceWeight: 1.2,
        tags: ["urgent_gap"],
      },
    ],
  },
];
