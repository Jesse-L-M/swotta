import { buildSystemPrompt, type LearnerContext } from "@/ai/study-modes";
import { makeMetric, mean, round, scoreKeywordCoverage, unique } from "@/evals/core/scoring";
import { withIsolatedEvalDb } from "@/evals/core/test-db";
import type { EvalScenarioResult, EvalSuiteResult } from "@/evals/core/types";
import {
  SOURCE_GROUNDING_EVAL_FIXTURES,
  type SourceGroundingEvalScenario,
} from "@/evals/fixtures/source-grounding";
import { retrieveChunks, vectorToString } from "@/engine/ingestion";
import { createTestLearner, createTestOrg, createTestQualification, createTestUser } from "@/test/fixtures";
import {
  sourceCollections,
  sourceFiles,
  sourceChunks,
  chunkEmbeddings,
  sourceMappings,
  classes,
  enrollments,
} from "@/db/schema";
import type { BlockId, LearnerId, RetrievalResult, TopicId } from "@/lib/types";
import { getTestDb } from "@/test/setup";

function expandEmbedding(seed: [number, number]): number[] {
  const vector = new Array(1024).fill(0);
  vector[0] = seed[0];
  vector[1] = seed[1];
  return vector;
}

function makeBlock(
  learnerId: string,
  topicId: string,
  scenario: SourceGroundingEvalScenario
) {
  return {
    id: `eval-source-${scenario.id}` as BlockId,
    learnerId: learnerId as LearnerId,
    topicId: topicId as TopicId,
    topicName: scenario.block.topicName,
    blockType: scenario.block.blockType,
    durationMinutes: scenario.block.durationMinutes,
    priority: 1,
    reason: scenario.block.reason,
  };
}

async function seedScenario(
  db: ReturnType<typeof getTestDb>,
  scenario: SourceGroundingEvalScenario
): Promise<{
  learnerId: string;
  topicId: string;
  learnerContext: LearnerContext;
}> {
  const org = await createTestOrg();
  const learnerUser = await createTestUser();
  const peerUser = await createTestUser();
  const learner = await createTestLearner(org.id, { userId: learnerUser.id });
  const peerLearner = await createTestLearner(org.id, { userId: peerUser.id });
  const qualification = await createTestQualification();
  const targetTopic = qualification.topics[1] ?? qualification.topics[0]!;
  const distractorTopic =
    qualification.topics.find((topic) => topic.id !== targetTopic.id) ?? targetTopic;

  const [classroom] = await db
    .insert(classes)
    .values({
      orgId: org.id,
      name: "Eval Biology",
      academicYear: "2025-2026",
    })
    .returning();

  await db.insert(enrollments).values({
    learnerId: learner.id,
    classId: classroom.id,
  });

  for (const [index, chunkFixture] of scenario.chunks.entries()) {
    const collection =
      chunkFixture.scope === "private"
        ? (
            await db
              .insert(sourceCollections)
              .values({
        scope: "private",
        learnerId:
          chunkFixture.owner === "peer" ? peerLearner.id : learner.id,
        name: `${chunkFixture.filename} collection`,
              })
              .returning()
          )[0]!
        : chunkFixture.scope === "class"
          ? (
              await db
                .insert(sourceCollections)
                .values({
                  scope: "class",
                  classId: classroom.id,
                  name: `${chunkFixture.filename} class collection`,
                })
                .returning()
            )[0]!
          : chunkFixture.scope === "org"
            ? (
                await db
                  .insert(sourceCollections)
                  .values({
                    scope: "org",
                    orgId: org.id,
                    name: `${chunkFixture.filename} org collection`,
                  })
                  .returning()
              )[0]!
            : (
                await db
                  .insert(sourceCollections)
                  .values({
                    scope: "system",
                    name: `${chunkFixture.filename} system collection`,
                  })
                  .returning()
              )[0]!;

    const uploadedByUserId =
      chunkFixture.owner === "peer" ? peerUser.id : learnerUser.id;

    const [file] = await db
      .insert(sourceFiles)
      .values({
        collectionId: collection.id,
        uploadedByUserId,
        filename: chunkFixture.filename,
        mimeType: "application/pdf",
        storagePath: `eval/${scenario.id}/${chunkFixture.filename}`,
        sizeBytes: 512,
        status: "ready",
      })
      .returning();

    const [chunk] = await db
      .insert(sourceChunks)
      .values({
        fileId: file.id,
        content: chunkFixture.content,
        chunkIndex: index,
        tokenCount: 40,
      })
      .returning();

    await db.insert(chunkEmbeddings).values({
      chunkId: chunk.id,
      embedding: vectorToString(expandEmbedding(chunkFixture.embedding)),
      model: "eval-source-grounding",
    });

    await db.insert(sourceMappings).values({
      chunkId: chunk.id,
      topicId:
        chunkFixture.topic === "target" ? targetTopic.id : distractorTopic.id,
      confidence: chunkFixture.confidence.toFixed(2),
      mappingMethod: "auto",
    });
  }

  return {
    learnerId: learner.id,
    topicId: targetTopic.id,
    learnerContext: scenario.learnerContext,
  };
}

function scoreRetrievedSources(
  scenario: SourceGroundingEvalScenario,
  retrieved: RetrievalResult[]
): {
  retrievalRecall: number;
  retrievalPrecision: number;
  forbiddenLeakRate: number;
  topSourceMatch: number;
  promptGrounding: number;
  prompt: string;
  retrievedSourceNames: string[];
} {
  const retrievedSourceNames = retrieved.map((chunk) => chunk.sourceFileName);
  const retrievedSet = new Set(retrievedSourceNames);
  const expectedHits = scenario.expectations.expectedRetrievedSources.filter((name) =>
    retrievedSet.has(name)
  ).length;
  const forbiddenHits = scenario.expectations.forbiddenSources.filter((name) =>
    retrievedSet.has(name)
  ).length;
  const relevantRetrieved = retrievedSourceNames.filter((name) =>
    scenario.expectations.expectedRetrievedSources.includes(name)
  ).length;

  return {
    retrievalRecall:
      scenario.expectations.expectedRetrievedSources.length === 0
        ? 1
        : expectedHits / scenario.expectations.expectedRetrievedSources.length,
    retrievalPrecision:
      retrieved.length === 0 ? 0 : relevantRetrieved / retrieved.length,
    forbiddenLeakRate:
      scenario.expectations.forbiddenSources.length === 0
        ? 0
        : forbiddenHits / scenario.expectations.forbiddenSources.length,
    topSourceMatch:
      retrieved[0]?.sourceFileName === scenario.expectations.expectedTopSource
        ? 1
        : 0,
    promptGrounding: 0,
    prompt: "",
    retrievedSourceNames,
  };
}

async function runScenario(
  scenario: SourceGroundingEvalScenario
): Promise<EvalScenarioResult> {
  return withIsolatedEvalDb(async (db) => {
    const { learnerId, topicId, learnerContext } = await seedScenario(db, scenario);
    const retrieved = await retrieveChunks(
      learnerId as LearnerId,
      scenario.query,
      {
        topicIds: [topicId as TopicId],
        limit: 3,
      },
      {
        db,
        generateEmbedding: async () => expandEmbedding(scenario.queryEmbedding),
      }
    );

    const block = makeBlock(learnerId, topicId, scenario);
    const prompt = await buildSystemPrompt(block, learnerContext, retrieved);
    const blankPrompt = await buildSystemPrompt(block, learnerContext, []);

    const liveScores = scoreRetrievedSources(scenario, retrieved);
    liveScores.promptGrounding = scoreKeywordCoverage(
      prompt,
      scenario.expectations.groundingKeywords
    );
    liveScores.prompt = prompt;

    const blankScores = scoreRetrievedSources(scenario, []);
    blankScores.promptGrounding = scoreKeywordCoverage(
      blankPrompt,
      scenario.expectations.groundingKeywords
    );
    blankScores.prompt = blankPrompt;

    const buildVariant = (
      id: string,
      label: string,
      scores: typeof liveScores,
      sourceCount: number
    ) => {
      const totalScore =
        mean([
          scores.retrievalRecall,
          scores.retrievalPrecision,
          1 - scores.forbiddenLeakRate,
          scores.topSourceMatch,
          scores.promptGrounding,
        ]) * 100;

      return {
        id,
        label,
        summary: `${sourceCount} retrieved chunks with ${scores.retrievalRecall.toFixed(2)} recall against the committed source expectations.`,
        totalScore: round(totalScore),
        metrics: [
          makeMetric(
            "retrieval_recall",
            "Expected source recall",
            scores.retrievalRecall * 100
          ),
          makeMetric(
            "retrieval_precision",
            "Retrieved-source precision",
            scores.retrievalPrecision * 100
          ),
          makeMetric(
            "scope_safety",
            "Scope safety",
            (1 - scores.forbiddenLeakRate) * 100
          ),
          makeMetric(
            "top_source_match",
            "Top source match",
            scores.topSourceMatch * 100
          ),
          makeMetric(
            "prompt_grounding",
            "Prompt grounding",
            scores.promptGrounding * 100
          ),
        ],
        highlights: [
          `Retrieved sources: ${unique(scores.retrievedSourceNames).join(", ") || "none"}`,
          `Expected top source: ${scenario.expectations.expectedTopSource}`,
          `Forbidden sources seen: ${
            unique(
              scores.retrievedSourceNames.filter((sourceName) =>
                scenario.expectations.forbiddenSources.includes(sourceName)
              )
            ).join(", ") || "none"
          }`,
        ],
        details: {
          retrievedSources: unique(scores.retrievedSourceNames),
          expectedSources: scenario.expectations.expectedRetrievedSources,
          forbiddenSources: scenario.expectations.forbiddenSources,
        },
      };
    };

    return {
      id: scenario.id,
      title: scenario.title,
      summary: scenario.summary,
      provenance: scenario.provenance,
      highlights: [
        `Query: ${scenario.query}`,
        `Grounding keywords: ${scenario.expectations.groundingKeywords.join("; ")}`,
      ],
      variants: [
        buildVariant("retrieval_enabled", "Retrieval enabled", liveScores, retrieved.length),
        buildVariant("no_source_retrieval", "No source retrieval", blankScores, 0),
      ],
    };
  });
}

export async function runSourceGroundingQualitySuite(): Promise<EvalSuiteResult> {
  const scenarios: EvalScenarioResult[] = [];

  for (const scenario of SOURCE_GROUNDING_EVAL_FIXTURES) {
    scenarios.push(await runScenario(scenario));
  }

  const liveVariants = scenarios.map((scenario) => scenario.variants[0]!);
  const blankVariants = scenarios.map((scenario) => scenario.variants[1]!);
  const scoreDelta = mean(
    liveVariants.map(
      (variant, index) => (variant.totalScore ?? 0) - (blankVariants[index]?.totalScore ?? 0)
    )
  );
  const liveScopeSafety = mean(
    liveVariants.map(
      (variant) =>
        (variant.metrics.find((metric) => metric.id === "scope_safety")?.value ?? 0) / 100
    )
  );
  const livePromptGrounding = mean(
    liveVariants.map(
      (variant) =>
        (variant.metrics.find((metric) => metric.id === "prompt_grounding")?.value ?? 0) / 100
    )
  );

  return {
    id: "source-grounding-quality",
    title: "Source Grounding Quality",
    description:
      "Measures whether the live retrieval path pulls the right accessible source chunks for a topic and carries those cues into the study prompt, compared with the same prompt built without retrieved sources.",
    headlineMetrics: [
      makeMetric("live_source_score", "Live source-grounding score", mean(liveVariants.map((variant) => variant.totalScore ?? 0))),
      makeMetric("score_delta", "Score lift vs no retrieval", scoreDelta),
      makeMetric("scope_safety", "Average scope safety", liveScopeSafety * 100),
      makeMetric("prompt_grounding", "Average prompt grounding", livePromptGrounding * 100),
    ],
    scenarios,
    proves: [
      "The committed eval fixtures exercise the real retrieveChunks codepath with deterministic embeddings, topic filters, and access scopes.",
      "The suite catches regressions where the wrong accessible chunk outranks the intended learner material or where a forbidden source leaks into retrieval.",
      "The resulting prompt stays grounded in retrieved source language, not just in generic topic labels.",
    ],
    doesNotProve: [
      "It does not prove that Claude will always cite or explain the retrieved material well after generation starts.",
      "It does not measure real learner engagement or session completion on live traffic.",
    ],
  };
}
