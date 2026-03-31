import biologyCurriculumPackage from "@/curriculum/__fixtures__/aqa-gcse-biology-8461/candidate-package.json";
import chemistryCurriculumPackage from "@/curriculum/__fixtures__/aqa-gcse-chemistry-8462/candidate-package.json";
import biologyPastPaperFixture from "@/engine/__fixtures__/past-papers/aqa-gcse-biology-8461.json";
import chemistryPastPaperFixture from "@/engine/__fixtures__/past-papers/aqa-gcse-chemistry-8462.json";
import { buildSystemPrompt } from "@/ai/study-modes";
import { makeMetric, mean, round, scoreKeywordCoverage } from "@/evals/core/scoring";
import { withIsolatedEvalDb } from "@/evals/core/test-db";
import type { EvalScenarioResult, EvalSuiteResult } from "@/evals/core/types";
import {
  PAST_PAPER_AWARE_EVAL_FIXTURES,
  type PastPaperAwareEvalScenario,
} from "@/evals/fixtures/past-paper-aware";
import { seedCurriculumInput } from "@/curriculum/seed";
import type {
  ApprovedCurriculumPackage,
  CandidateCurriculumPackage,
} from "@/curriculum/schema";
import {
  analyzePastPaperFixture,
  getPastPaperSessionIntelligence,
  loadQualificationPastPaperCatalog,
  seedPastPaperAnalyses,
} from "@/engine/past-paper";
import { topics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { BlockId, LearnerId, TopicId } from "@/lib/types";
import { getTestDb } from "@/test/setup";

function buildApprovedEnvelope(
  candidatePackage: CandidateCurriculumPackage,
  approvedAt: string
): ApprovedCurriculumPackage {
  return {
    ...structuredClone(candidatePackage),
    lifecycle: "approved",
    review: {
      status: "approved",
      approvedAt,
      reviewers: [
        {
          name: "Eval harness past-paper approval wrapper",
          role: "human",
          outcome: "approved",
          reviewedAt: approvedAt,
          notes:
            "Test-only approval wrapper used to seed the committed curriculum candidate fixtures for deterministic eval runs.",
        },
      ],
    },
  };
}

async function seedPastPaperFixtures(
  db: ReturnType<typeof getTestDb>
) {
  const biologySeeded = await seedCurriculumInput(
    buildApprovedEnvelope(
      biologyCurriculumPackage as CandidateCurriculumPackage,
      "2026-03-31T09:00:00.000Z"
    ),
    { db }
  );
  const chemistrySeeded = await seedCurriculumInput(
    buildApprovedEnvelope(
      chemistryCurriculumPackage as CandidateCurriculumPackage,
      "2026-03-31T09:15:00.000Z"
    ),
    { db }
  );

  const biologyAnalyses = analyzePastPaperFixture(
    await loadQualificationPastPaperCatalog(db, biologySeeded.qualificationVersionId),
    biologyPastPaperFixture
  );
  const chemistryAnalyses = analyzePastPaperFixture(
    await loadQualificationPastPaperCatalog(
      db,
      chemistrySeeded.qualificationVersionId
    ),
    chemistryPastPaperFixture
  );

  await seedPastPaperAnalyses(db, [...biologyAnalyses, ...chemistryAnalyses]);

  return {
    qualificationVersionIds: {
      "aqa-gcse-biology-8461": biologySeeded.qualificationVersionId,
      "aqa-gcse-chemistry-8462": chemistrySeeded.qualificationVersionId,
    },
  } as const;
}

async function loadTopicIdByCode(
  db: ReturnType<typeof getTestDb>,
  qualificationVersionId: string,
  topicCode: string
): Promise<string> {
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.qualificationVersionId, qualificationVersionId),
        eq(topics.code, topicCode)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error(`Could not find topic ${topicCode}`);
  }

  return row.id;
}

function makeBlock(
  topicId: string,
  scenario: PastPaperAwareEvalScenario
) {
  return {
    id: `eval-past-paper-${scenario.id}` as BlockId,
    learnerId: "eval-past-paper-learner" as LearnerId,
    topicId: topicId as TopicId,
    topicName: scenario.block.topicName,
    blockType: scenario.block.blockType,
    durationMinutes: scenario.block.durationMinutes,
    priority: 1,
    reason: scenario.block.reason,
  };
}

function buildFallbackExamContext(topicId: string, scenario: PastPaperAwareEvalScenario) {
  return {
    source: "fallback" as const,
    qualificationVersionId: null,
    topicId,
    topicName: scenario.block.topicName,
    reason:
      "No structured past-paper intelligence is available for this topic yet. Keep the session exam-relevant, but fall back to clean qualification-appropriate command-word and mark-allocation coaching.",
  };
}

async function runScenario(
  db: ReturnType<typeof getTestDb>,
  scenario: PastPaperAwareEvalScenario,
  seeded: Awaited<ReturnType<typeof seedPastPaperFixtures>>
): Promise<EvalScenarioResult> {
  const qualificationVersionId =
    seeded.qualificationVersionIds[scenario.qualificationFixture];
  const topicId = await loadTopicIdByCode(db, qualificationVersionId, scenario.topicCode);
  const examSession = await getPastPaperSessionIntelligence(db, {
    qualificationVersionId,
    topicId,
    referenceQuestionLimit: 3,
  });

  if (!examSession) {
    throw new Error(`Expected past-paper intelligence for ${scenario.id}`);
  }

  const block = makeBlock(topicId, scenario);
  const learnerContext = {
    masteryLevel: 0.58,
    knownMisconceptions: [],
    confirmedMemory: [],
    preferences: {},
    policies: [],
  };
  const prompt = await buildSystemPrompt(
    block,
    {
      ...learnerContext,
      examSession: { source: "past_paper" as const, ...examSession },
    },
    []
  );
  const fallbackPrompt = await buildSystemPrompt(
    block,
    {
      ...learnerContext,
      examSession: buildFallbackExamContext(topicId, scenario),
    },
    []
  );

  const commandWordGrounding = scoreKeywordCoverage(
    prompt,
    scenario.expectations.commandWordKeywords
  );
  const markGrounding = scoreKeywordCoverage(
    prompt,
    scenario.expectations.markKeywords
  );
  const signalGrounding = scoreKeywordCoverage(
    prompt,
    scenario.expectations.signalKeywords
  );
  const referenceQuestionGrounding = scoreKeywordCoverage(
    prompt,
    scenario.expectations.referenceKeywords
  );
  const fallbackCommandWordGrounding = scoreKeywordCoverage(
    fallbackPrompt,
    scenario.expectations.commandWordKeywords
  );
  const fallbackMarkGrounding = scoreKeywordCoverage(
    fallbackPrompt,
    scenario.expectations.markKeywords
  );
  const fallbackSignalGrounding = scoreKeywordCoverage(
    fallbackPrompt,
    scenario.expectations.signalKeywords
  );
  const fallbackReferenceGrounding = scoreKeywordCoverage(
    fallbackPrompt,
    scenario.expectations.referenceKeywords
  );

  const liveTotal =
    mean([
      commandWordGrounding,
      markGrounding,
      signalGrounding,
      referenceQuestionGrounding,
    ]) * 100;
  const fallbackTotal =
    mean([
      fallbackCommandWordGrounding,
      fallbackMarkGrounding,
      fallbackSignalGrounding,
      fallbackReferenceGrounding,
    ]) * 100;

  return {
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    provenance: scenario.provenance,
    highlights: [
      `Topic code: ${scenario.topicCode}`,
      `Reference questions found: ${examSession.referenceQuestions.length}`,
      `Command words found: ${examSession.commandWords.map((commandWord) => commandWord.word).join(", ")}`,
    ],
    variants: [
      {
        id: "past_paper_intelligence",
        label: "Past-paper intelligence",
        summary: `${examSession.questionCount} real question patterns grounded the prompt for this topic.`,
        totalScore: round(liveTotal),
        metrics: [
          makeMetric(
            "command_word_grounding",
            "Command-word grounding",
            commandWordGrounding * 100
          ),
          makeMetric(
            "mark_allocation_grounding",
            "Mark-allocation grounding",
            markGrounding * 100
          ),
          makeMetric(
            "signal_grounding",
            "Signal grounding",
            signalGrounding * 100
          ),
          makeMetric(
            "reference_question_grounding",
            "Reference-question grounding",
            referenceQuestionGrounding * 100
          ),
        ],
        highlights: [
          `Observed marks: ${examSession.marks.distinct.join(", ")} (avg ${examSession.marks.average})`,
          `Question types: ${examSession.questionTypes.map((questionType) => questionType.name).join(", ")}`,
          `Signals: ${examSession.markSchemeSignals
            .concat(examSession.examTechniqueSignals)
            .map((signal) => signal.label)
            .join(", ")}`,
        ],
        details: {
          examSession,
        },
      },
      {
        id: "fallback_exam_guidance",
        label: "Fallback exam guidance",
        summary:
          "The same prompt template with generic fallback exam coaching and no structured past-paper intelligence.",
        totalScore: round(fallbackTotal),
        metrics: [
          makeMetric(
            "command_word_grounding",
            "Command-word grounding",
            fallbackCommandWordGrounding * 100
          ),
          makeMetric(
            "mark_allocation_grounding",
            "Mark-allocation grounding",
            fallbackMarkGrounding * 100
          ),
          makeMetric(
            "signal_grounding",
            "Signal grounding",
            fallbackSignalGrounding * 100
          ),
          makeMetric(
            "reference_question_grounding",
            "Reference-question grounding",
            fallbackReferenceGrounding * 100
          ),
        ],
        highlights: [
          "Fallback reason only; no observed command-word counts or reference questions are injected.",
        ],
        details: {
          fallbackReason: buildFallbackExamContext(topicId, scenario).reason,
        },
      },
    ],
  };
}

export async function runPastPaperAwareTutoringSuite(): Promise<EvalSuiteResult> {
  return withIsolatedEvalDb(async (db) => {
    const seeded = await seedPastPaperFixtures(db);
    const scenarios: EvalScenarioResult[] = [];

    for (const scenario of PAST_PAPER_AWARE_EVAL_FIXTURES) {
      scenarios.push(await runScenario(db, scenario, seeded));
    }

    const liveVariants = scenarios.map((scenario) => scenario.variants[0]!);
    const fallbackVariants = scenarios.map((scenario) => scenario.variants[1]!);

    return {
      id: "past-paper-aware-tutoring",
      title: "Past-Paper-Aware Tutoring",
      description:
        "Measures whether the merged past-paper integration injects real topic-level question patterns, command words, mark allocations, and reference questions into exam-facing prompts, compared with the generic fallback exam guidance path.",
      headlineMetrics: [
        makeMetric(
          "live_exam_score",
          "Live past-paper score",
          mean(liveVariants.map((variant) => variant.totalScore ?? 0))
        ),
        makeMetric(
          "score_delta",
          "Score lift vs fallback guidance",
          mean(
            liveVariants.map(
              (variant, index) =>
                (variant.totalScore ?? 0) -
                (fallbackVariants[index]?.totalScore ?? 0)
            )
          )
        ),
        makeMetric(
          "signal_grounding",
          "Average signal grounding",
          mean(
            liveVariants.map(
              (variant) =>
                variant.metrics.find((metric) => metric.id === "signal_grounding")
                  ?.value ?? 0
            )
          )
        ),
        makeMetric(
          "reference_question_grounding",
          "Average reference-question grounding",
          mean(
            liveVariants.map(
              (variant) =>
                variant.metrics.find(
                  (metric) => metric.id === "reference_question_grounding"
                )?.value ?? 0
            )
          )
        ),
      ],
      scenarios,
      proves: [
        "The suite uses the merged curriculum and past-paper fixtures on main, then runs the live past-paper analysis and session-intelligence aggregation code.",
        "It catches regressions where exam-facing prompts lose real command-word counts, mark allocations, mark-scheme signals, or reference question structure for a topic.",
        "It keeps the comparison honest by scoring against the generic fallback exam-guidance path the product already uses when no structured paper intelligence exists.",
      ],
      doesNotProve: [
        "It does not prove student learning gains from past-paper-aware tutoring on live traffic.",
        "It does not cover topics that still have no past-paper analyses on main.",
      ],
    };
  });
}
