import { buildSystemPrompt } from "@/ai/study-modes";
import { makeMetric, mean, normalize, round, scoreForbiddenKeywordAbsence, scoreKeywordCoverage } from "@/evals/core/scoring";
import { withIsolatedEvalDb } from "@/evals/core/test-db";
import type { EvalScenarioResult, EvalSuiteResult } from "@/evals/core/types";
import {
  POLICY_ADHERENCE_EVAL_FIXTURES,
  type PolicyAdherenceEvalScenario,
} from "@/evals/fixtures/policy-adherence";
import { assembleLearnerContext } from "@/engine/memory";
import { createTestLearner, createTestOrg, createTestQualification } from "@/test/fixtures";
import { classes, enrollments, learnerTopicState, policies, learnerQualifications } from "@/db/schema";
import type { BlockId, LearnerId, TopicId } from "@/lib/types";

function makeBlock(
  learnerId: string,
  topicId: string,
  scenario: PolicyAdherenceEvalScenario
) {
  return {
    id: `eval-policy-${scenario.id}` as BlockId,
    learnerId: learnerId as LearnerId,
    topicId: topicId as TopicId,
    topicName: scenario.block.topicName,
    blockType: scenario.block.blockType,
    durationMinutes: scenario.block.durationMinutes,
    priority: 1,
    reason: scenario.block.reason,
  };
}

async function runScenario(
  scenario: PolicyAdherenceEvalScenario
): Promise<EvalScenarioResult> {
  return withIsolatedEvalDb(async (db) => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qualification = await createTestQualification();
    const targetTopic = qualification.topics[1] ?? qualification.topics[0]!;

    const [classroom] = await db
      .insert(classes)
      .values({
        orgId: org.id,
        name: "Eval Policies",
        academicYear: "2025-2026",
      })
      .returning();

    await db.insert(enrollments).values({
      learnerId: learner.id,
      classId: classroom.id,
    });

    await db.insert(learnerQualifications).values({
      learnerId: learner.id,
      qualificationVersionId: qualification.qualificationVersionId,
      status: "active",
    });

    await db.insert(learnerTopicState).values({
      learnerId: learner.id,
      topicId: targetTopic.id,
      masteryLevel: "0.47",
      confidence: "0.43",
      streak: 0,
    });

    await db.insert(policies).values(
      scenario.policies.map((policy) => ({
        scopeType: policy.scopeType,
        scopeId:
          policy.scopeType === "global"
            ? null
            : policy.scopeType === "org"
              ? org.id
              : policy.scopeType === "class"
                ? classroom.id
                : policy.scopeType === "qualification"
                  ? qualification.qualificationVersionId
                  : learner.id,
        key: policy.key,
        value: policy.value,
      }))
    );

    const assembledContext = await assembleLearnerContext(
      db,
      learner.id as LearnerId,
      targetTopic.id as TopicId
    );
    const block = makeBlock(learner.id, targetTopic.id, scenario);
    const prompt = await buildSystemPrompt(block, assembledContext, []);
    const blankPrompt = await buildSystemPrompt(block, { ...assembledContext, policies: [] }, []);

    const resolvedPoliciesByKey = new Map(
      assembledContext.policies.map((policy) => [policy.key, policy])
    );

    const resolutionAccuracy =
      scenario.expectations.expectedPolicies.filter((expectedPolicy) => {
        const actual = resolvedPoliciesByKey.get(expectedPolicy.key);
        return (
          actual?.scopeType === expectedPolicy.scopeType &&
          normalize(String(actual.value)) === normalize(expectedPolicy.value)
        );
      }).length / scenario.expectations.expectedPolicies.length;

    const policyCountAccuracy =
      assembledContext.policies.length === scenario.expectations.expectedPolicies.length
        ? 1
        : 0;
    const overrideSuppression = scoreForbiddenKeywordAbsence(
      prompt,
      scenario.expectations.forbiddenValues
    );
    const promptPolicyVisibility = scoreKeywordCoverage(
      prompt,
      scenario.expectations.promptKeywords
    );
    const blankPolicyVisibility = scoreKeywordCoverage(
      blankPrompt,
      scenario.expectations.promptKeywords
    );

    const liveTotal =
      mean([
        resolutionAccuracy,
        policyCountAccuracy,
        overrideSuppression,
        promptPolicyVisibility,
      ]) * 100;
    const blankTotal =
      mean([0, 0, 1, blankPolicyVisibility]) * 100;

    const liveDetails = assembledContext.policies
      .map((policy) => ({
        key: policy.key,
        scopeType: policy.scopeType,
        value: String(policy.value),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));

    return {
      id: scenario.id,
      title: scenario.title,
      summary: scenario.summary,
      provenance: scenario.provenance,
      highlights: [
        `Expected winning keys: ${scenario.expectations.expectedPolicies.map((policy) => policy.key).join(", ")}`,
        `Forbidden values: ${scenario.expectations.forbiddenValues.join("; ") || "none"}`,
      ],
      variants: [
        {
          id: "resolved_policy_context",
          label: "Resolved policy context",
          summary: `${liveDetails.length} winning policies reached the prompt after live scope resolution.`,
          totalScore: round(liveTotal),
          metrics: [
            makeMetric(
              "resolution_accuracy",
              "Policy resolution accuracy",
              resolutionAccuracy * 100
            ),
            makeMetric(
              "policy_count_accuracy",
              "Policy count accuracy",
              policyCountAccuracy * 100
            ),
            makeMetric(
              "override_suppression",
              "Override suppression",
              overrideSuppression * 100
            ),
            makeMetric(
              "prompt_policy_visibility",
              "Prompt policy visibility",
              promptPolicyVisibility * 100
            ),
          ],
          highlights: liveDetails.map(
            (policy) => `${policy.key} -> ${policy.scopeType}: ${policy.value}`
          ),
          details: {
            resolvedPolicies: liveDetails,
          },
        },
        {
          id: "policyless_baseline",
          label: "Policyless baseline",
          summary: "The same prompt built without resolved policy context.",
          totalScore: round(blankTotal),
          metrics: [
            makeMetric("resolution_accuracy", "Policy resolution accuracy", 0),
            makeMetric("policy_count_accuracy", "Policy count accuracy", 0),
            makeMetric("override_suppression", "Override suppression", 100),
            makeMetric(
              "prompt_policy_visibility",
              "Prompt policy visibility",
              blankPolicyVisibility * 100
            ),
          ],
          highlights: ["No policies included in the prompt."],
          details: {
            resolvedPolicies: [],
          },
        },
      ],
    };
  });
}

export async function runPolicyAdherenceSuite(): Promise<EvalSuiteResult> {
  const scenarios: EvalScenarioResult[] = [];

  for (const scenario of POLICY_ADHERENCE_EVAL_FIXTURES) {
    scenarios.push(await runScenario(scenario));
  }

  const liveVariants = scenarios.map((scenario) => scenario.variants[0]!);
  const baselineVariants = scenarios.map((scenario) => scenario.variants[1]!);

  return {
    id: "policy-adherence",
    title: "Policy Adherence",
    description:
      "Measures whether live multi-scope policy resolution produces the expected winning policy set and whether those constraints remain visible in the resulting study prompt, compared with the same prompt built without policies.",
    headlineMetrics: [
      makeMetric(
        "live_policy_score",
        "Live policy-adherence score",
        mean(liveVariants.map((variant) => variant.totalScore ?? 0))
      ),
      makeMetric(
        "score_delta",
        "Score lift vs policyless baseline",
        mean(
          liveVariants.map(
            (variant, index) =>
              (variant.totalScore ?? 0) - (baselineVariants[index]?.totalScore ?? 0)
          )
        )
      ),
      makeMetric(
        "resolution_accuracy",
        "Average policy resolution accuracy",
        mean(
          liveVariants.map(
            (variant) =>
              variant.metrics.find((metric) => metric.id === "resolution_accuracy")
                ?.value ?? 0
          )
        )
      ),
      makeMetric(
        "override_suppression",
        "Average override suppression",
        mean(
          liveVariants.map(
            (variant) =>
              variant.metrics.find((metric) => metric.id === "override_suppression")
                ?.value ?? 0
          )
        )
      ),
    ],
    scenarios,
    proves: [
      "The suite exercises the live resolveAllPolicies plus assembleLearnerContext path against committed multi-scope fixtures.",
      "It catches regressions where the wrong scope wins, where extra policies leak through, or where overridden values still appear in the prompt.",
      "It shows whether the final tutoring prompt actually carries the resolved policy cues the model would need to obey.",
    ],
    doesNotProve: [
      "It does not prove model obedience after generation starts; it proves policy resolution and prompt injection, not downstream Claude behavior.",
      "It does not cover every possible policy key or future policy-specific business logic.",
    ],
  };
}
