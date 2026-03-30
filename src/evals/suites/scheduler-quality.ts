import type { BlockType } from "@/lib/types";
import { calculateTopicPriority, selectBlockTypeSync } from "@/engine/scheduler";
import type { EvalMetric, EvalScenarioResult, EvalSuiteResult } from "@/evals/core/types";
import {
  SCHEDULER_EVAL_FIXTURES,
  type SchedulerEvalScenario,
  type SchedulerEvalTopicFixture,
} from "@/evals/fixtures/scheduler-quality";

type PolicyId = "swotta" | "random" | "overdue_only";

interface SimulatedTopicState extends SchedulerEvalTopicFixture {
  currentMastery: number;
  currentStreak: number;
  nextReviewDay: number;
  firstStudiedDay: number | null;
  timesStudied: number;
  initialMastery: number;
  initialOverdueDays: number;
}

interface DecisionTrace {
  day: number;
  topicId: string;
  topicName: string;
  blockType: BlockType;
  daysOverdue: number;
  priority: number | null;
}

interface PolicyRunResult {
  id: PolicyId;
  label: string;
  metrics: {
    weightedMasteryGain: number;
    topicCoverage: number;
    urgentGapLeadTime: number;
    overdueLeadTime: number;
    timedProblemShare: number;
  };
  blockMix: Record<BlockType, number>;
  decisions: DecisionTrace[];
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createInitialState(
  topic: SchedulerEvalTopicFixture
): SimulatedTopicState {
  return {
    ...topic,
    currentMastery: topic.masteryLevel,
    currentStreak: topic.streak,
    nextReviewDay: topic.nextReviewOffsetDays,
    firstStudiedDay: null,
    timesStudied: 0,
    initialMastery: topic.masteryLevel,
    initialOverdueDays: Math.max(0, -topic.nextReviewOffsetDays),
  };
}

function chooseBaselineBlockType(): BlockType {
  return "retrieval_drill";
}

function scoreSwottaCandidate(
  topic: SimulatedTopicState,
  day: number,
  examDateOffsetDays: number
): DecisionTrace {
  const daysOverdue = Math.max(0, day - topic.nextReviewDay);
  const daysUntilExam = Math.max(0, examDateOffsetDays - day);
  const priority = calculateTopicPriority(
    topic.currentMastery,
    daysOverdue,
    daysUntilExam
  );
  const blockType = selectBlockTypeSync(
    topic.currentMastery,
    topic.currentStreak,
    daysOverdue
  );

  return {
    day,
    topicId: topic.id,
    topicName: topic.name,
    blockType,
    daysOverdue,
    priority,
  };
}

function selectDecision(
  policyId: PolicyId,
  scenario: SchedulerEvalScenario,
  state: SimulatedTopicState[],
  day: number,
  rng: () => number
): DecisionTrace {
  if (policyId === "swotta") {
    return state
      .map((topic) => scoreSwottaCandidate(topic, day, scenario.examDateOffsetDays))
      .sort((left, right) => {
        if ((left.priority ?? 999) !== (right.priority ?? 999)) {
          return (left.priority ?? 999) - (right.priority ?? 999);
        }

        const leftTopic = state.find((topic) => topic.id === left.topicId)!;
        const rightTopic = state.find((topic) => topic.id === right.topicId)!;

        if (leftTopic.currentMastery !== rightTopic.currentMastery) {
          return leftTopic.currentMastery - rightTopic.currentMastery;
        }

        return left.topicName.localeCompare(right.topicName);
      })[0];
  }

  if (policyId === "overdue_only") {
    const chosen = [...state].sort((left, right) => {
      const leftOverdue = Math.max(0, day - left.nextReviewDay);
      const rightOverdue = Math.max(0, day - right.nextReviewDay);

      if (leftOverdue !== rightOverdue) {
        return rightOverdue - leftOverdue;
      }

      return left.nextReviewDay - right.nextReviewDay;
    })[0];

    return {
      day,
      topicId: chosen.id,
      topicName: chosen.name,
      blockType: chooseBaselineBlockType(),
      daysOverdue: Math.max(0, day - chosen.nextReviewDay),
      priority: null,
    };
  }

  const index = Math.floor(rng() * state.length);
  const chosen = state[index];

  return {
    day,
    topicId: chosen.id,
    topicName: chosen.name,
    blockType: chooseBaselineBlockType(),
    daysOverdue: Math.max(0, day - chosen.nextReviewDay),
    priority: null,
  };
}

function estimateMasteryGain(
  blockType: BlockType,
  mastery: number,
  daysOverdue: number,
  daysUntilExam: number
): number {
  if (blockType === "reentry") {
    return daysOverdue > 14 ? 0.15 : 0.08;
  }

  if (blockType === "explanation") {
    return mastery < 0.25 ? 0.16 : mastery < 0.5 ? 0.09 : 0.04;
  }

  if (blockType === "worked_example") {
    return mastery < 0.45 ? 0.12 : 0.06;
  }

  if (blockType === "timed_problems") {
    const base = mastery >= 0.7 ? 0.08 : 0.03;
    return daysUntilExam <= 14 && mastery >= 0.7 ? base + 0.03 : base;
  }

  return mastery >= 0.35 && mastery <= 0.8 ? 0.1 : 0.05;
}

function estimateSpacingDays(mastery: number, blockType: BlockType): number {
  if (blockType === "reentry") {
    return 4;
  }

  if (blockType === "timed_problems") {
    return 7;
  }

  return Math.round(3 + mastery * 9);
}

function decayUnstudiedTopics(
  state: SimulatedTopicState[],
  selectedTopicId: string,
  day: number
): void {
  for (const topic of state) {
    if (topic.id === selectedTopicId) {
      continue;
    }

    const daysOverdue = Math.max(0, day - topic.nextReviewDay);
    if (daysOverdue > 0) {
      topic.currentMastery = clamp(
        topic.currentMastery - Math.min(0.02, 0.005 * daysOverdue),
        0,
        1
      );
      topic.currentStreak = 0;
    }
  }
}

function applyDecision(
  scenario: SchedulerEvalScenario,
  state: SimulatedTopicState[],
  decision: DecisionTrace
): void {
  const topic = state.find((candidate) => candidate.id === decision.topicId);
  if (!topic) {
    return;
  }

  const daysUntilExam = Math.max(0, scenario.examDateOffsetDays - decision.day);
  const gain = estimateMasteryGain(
    decision.blockType,
    topic.currentMastery,
    decision.daysOverdue,
    daysUntilExam
  );

  topic.currentMastery = clamp(topic.currentMastery + gain, 0, 1);
  topic.currentStreak += 1;
  topic.timesStudied += 1;
  topic.firstStudiedDay ??= decision.day;
  topic.nextReviewDay =
    decision.day + estimateSpacingDays(topic.currentMastery, decision.blockType);

  decayUnstudiedTopics(state, topic.id, decision.day);
}

function collectMetrics(
  scenario: SchedulerEvalScenario,
  state: SimulatedTopicState[],
  decisions: DecisionTrace[]
): PolicyRunResult["metrics"] {
  const weightedMasteryGain = state.reduce((sum, topic) => {
    return sum + (topic.currentMastery - topic.initialMastery) * topic.importanceWeight;
  }, 0);

  const topicCoverage =
    state.filter((topic) => topic.timesStudied > 0).length / state.length;

  const urgentGapLeadTime = mean(
    state
      .filter((topic) => topic.tags.includes("urgent_gap"))
      .map((topic) => topic.firstStudiedDay ?? scenario.studyDays)
  );

  const overdueLeadTime = mean(
    state
      .filter((topic) => topic.tags.includes("initially_overdue"))
      .map((topic) => topic.firstStudiedDay ?? scenario.studyDays)
  );

  const examWindowStart = Math.max(0, scenario.examDateOffsetDays - 7);
  const examWindowDecisions = decisions.filter(
    (decision) => decision.day >= examWindowStart
  );
  const timedProblemShare =
    examWindowDecisions.length === 0
      ? 0
      : examWindowDecisions.filter(
          (decision) => decision.blockType === "timed_problems"
        ).length / examWindowDecisions.length;

  return {
    weightedMasteryGain: Number(weightedMasteryGain.toFixed(3)),
    topicCoverage: Number((topicCoverage * 100).toFixed(2)),
    urgentGapLeadTime: Number(urgentGapLeadTime.toFixed(2)),
    overdueLeadTime: Number(overdueLeadTime.toFixed(2)),
    timedProblemShare: Number((timedProblemShare * 100).toFixed(2)),
  };
}

function countBlockMix(decisions: DecisionTrace[]): Record<BlockType, number> {
  const mix: Record<BlockType, number> = {
    retrieval_drill: 0,
    explanation: 0,
    worked_example: 0,
    timed_problems: 0,
    essay_planning: 0,
    source_analysis: 0,
    mistake_review: 0,
    reentry: 0,
  };

  for (const decision of decisions) {
    mix[decision.blockType] += 1;
  }

  return mix;
}

function runPolicy(
  policyId: PolicyId,
  scenario: SchedulerEvalScenario
): PolicyRunResult {
  const rng = createSeededRandom(scenario.randomSeed);
  const state = scenario.topics.map((topic) => createInitialState(topic));
  const decisions: DecisionTrace[] = [];

  for (let day = 0; day < scenario.studyDays; day++) {
    const decision = selectDecision(policyId, scenario, state, day, rng);
    decisions.push(decision);
    applyDecision(scenario, state, decision);
  }

  const label =
    policyId === "swotta"
      ? "Swotta scheduler"
      : policyId === "random"
        ? "Random baseline"
        : "Overdue-only baseline";

  return {
    id: policyId,
    label,
    metrics: collectMetrics(scenario, state, decisions),
    blockMix: countBlockMix(decisions),
    decisions,
  };
}

function metric(
  id: string,
  label: string,
  value: number,
  unit: string,
  direction: EvalMetric["direction"]
): EvalMetric {
  return {
    id,
    label,
    value,
    unit,
    direction,
  };
}

function runScenario(scenario: SchedulerEvalScenario): EvalScenarioResult {
  const variants = [
    runPolicy("swotta", scenario),
    runPolicy("random", scenario),
    runPolicy("overdue_only", scenario),
  ];

  const swotta = variants[0];
  const random = variants[1];
  const overdueOnly = variants[2];

  return {
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    provenance: scenario.provenance,
    highlights: [
      `Swotta weighted mastery gain delta vs random: ${(swotta.metrics.weightedMasteryGain - random.metrics.weightedMasteryGain).toFixed(3)}.`,
      `Swotta urgent-gap lead time delta vs overdue-only: ${(overdueOnly.metrics.urgentGapLeadTime - swotta.metrics.urgentGapLeadTime).toFixed(2)} days.`,
    ],
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      summary: `Weighted gain ${variant.metrics.weightedMasteryGain.toFixed(3)}, coverage ${variant.metrics.topicCoverage.toFixed(2)}%, urgent gaps first touched on day ${variant.metrics.urgentGapLeadTime.toFixed(2)}.`,
      metrics: [
        metric(
          "weighted_mastery_gain",
          "Weighted mastery gain",
          variant.metrics.weightedMasteryGain,
          "gain",
          "higher"
        ),
        metric(
          "topic_coverage",
          "Topic coverage",
          variant.metrics.topicCoverage,
          "%",
          "higher"
        ),
        metric(
          "urgent_gap_lead_time",
          "Urgent-gap first-touch day",
          variant.metrics.urgentGapLeadTime,
          "days",
          "lower"
        ),
        metric(
          "overdue_lead_time",
          "Initially overdue first-touch day",
          variant.metrics.overdueLeadTime,
          "days",
          "lower"
        ),
        metric(
          "timed_problem_share",
          "Timed-problem share in exam window",
          variant.metrics.timedProblemShare,
          "%",
          "higher"
        ),
      ],
      highlights: [
        `Block mix: ${Object.entries(variant.blockMix)
          .filter(([, count]) => count > 0)
          .map(([blockType, count]) => `${blockType}=${count}`)
          .join(", ")}`,
        `First five decisions: ${variant.decisions
          .slice(0, 5)
          .map((decision) => `${decision.day}:${decision.topicName}/${decision.blockType}`)
          .join(" | ")}`,
      ],
      details: {
        metrics: variant.metrics,
        blockMix: variant.blockMix,
        decisions: variant.decisions,
      },
    })),
  };
}

export async function runSchedulerQualitySuite(): Promise<EvalSuiteResult> {
  const scenarios = SCHEDULER_EVAL_FIXTURES.map((scenario) => runScenario(scenario));

  const getVariantMetric = (
    variantIndex: number,
    metricId: string
  ): number[] =>
    scenarios.map((scenario) => {
      const metric = scenario.variants[variantIndex].metrics.find(
        (candidate) => candidate.id === metricId
      );
      return metric?.value ?? 0;
    });

  const swottaWeightedGain = mean(
    getVariantMetric(0, "weighted_mastery_gain")
  );
  const randomWeightedGain = mean(
    getVariantMetric(1, "weighted_mastery_gain")
  );
  const overdueWeightedGain = mean(
    getVariantMetric(2, "weighted_mastery_gain")
  );
  const swottaUrgentLeadTime = mean(
    getVariantMetric(0, "urgent_gap_lead_time")
  );
  const overdueUrgentLeadTime = mean(
    getVariantMetric(2, "urgent_gap_lead_time")
  );

  return {
    id: "scheduler-quality-vs-baselines",
    title: "Scheduler Quality vs Baselines",
    description:
      "Simulates fixed learner profiles over multiple study days and compares the current scheduler heuristics against deterministic random and overdue-only baselines.",
    headlineMetrics: [
      metric(
        "swotta_weighted_gain",
        "Swotta mean weighted mastery gain",
        Number(swottaWeightedGain.toFixed(3)),
        "gain",
        "higher"
      ),
      metric(
        "random_weighted_gain",
        "Random mean weighted mastery gain",
        Number(randomWeightedGain.toFixed(3)),
        "gain",
        "higher"
      ),
      metric(
        "overdue_weighted_gain",
        "Overdue-only mean weighted mastery gain",
        Number(overdueWeightedGain.toFixed(3)),
        "gain",
        "higher"
      ),
      metric(
        "swotta_urgent_gap_lead_time",
        "Swotta mean urgent-gap first-touch day",
        Number(swottaUrgentLeadTime.toFixed(2)),
        "days",
        "lower"
      ),
      metric(
        "overdue_urgent_gap_lead_time",
        "Overdue-only mean urgent-gap first-touch day",
        Number(overdueUrgentLeadTime.toFixed(2)),
        "days",
        "lower"
      ),
    ],
    scenarios,
    proves: [
      "The harness can replay committed learner-profile fixtures with deterministic ranking, block-type choice, decay, and scoring so scheduler runs are comparable over time.",
      "The reports show where Swotta beats or loses to simpler baselines on weighted mastery gain, coverage, and first-touch timing for urgent or overdue topics.",
    ],
    doesNotProve: [
      "It does not prove the current scheduler matches the richer future-state claims in EVALS.md such as policy-aware or source-aware scheduling, because those signals are not implemented in the engine yet.",
      "It does not replace live learner data. The gains come from a deterministic synthetic outcome model, so the numbers are for regression tracking and directional comparison rather than product truth.",
    ],
  };
}
