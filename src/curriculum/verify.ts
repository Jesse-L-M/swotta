import { readFile } from "node:fs/promises";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { getDiagnosticTopics, getQualificationName } from "@/engine/diagnostic";
import { getTopicTree } from "@/engine/curriculum";
import {
  assessmentComponents,
  commandWords,
  misconceptionRules,
  questionTypes,
  topicEdges,
  topics,
} from "@/db/schema";
import { loadQualificationOptions } from "@/components/onboarding/data";
import type { Database } from "@/lib/db";
import type { QualificationVersionId, TopicTreeNode } from "@/lib/types";
import {
  getLegacySeedStats,
  prepareCurriculumSeedInput,
  resolveCurriculumDb,
  seedPreparedCurriculum,
  type CurriculumSeedNote,
} from "./seed";
import type { CurriculumPackageLifecycle } from "./schema";

export interface CurriculumVerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface CurriculumVerificationResult {
  ok: boolean;
  packageId: string | null;
  lifecycle: CurriculumPackageLifecycle | null;
  normalizedFrom: "package" | "legacy_seed" | null;
  qualificationVersionId: string | null;
  adapterNotes: CurriculumSeedNote[];
  checks: CurriculumVerificationCheck[];
}

interface SeededCounts {
  components: number;
  topics: number;
  edges: number;
  commandWords: number;
  questionTypes: number;
  misconceptionRules: number;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flattenTopicTree(nodes: TopicTreeNode[]): TopicTreeNode[] {
  const flattened: TopicTreeNode[] = [];

  for (const node of nodes) {
    flattened.push(node);
    flattened.push(...flattenTopicTree(node.children));
  }

  return flattened;
}

async function loadSeededCounts(
  db: Database,
  qualificationVersionId: QualificationVersionId
): Promise<SeededCounts> {
  const [
    componentRows,
    topicRows,
    edgeRows,
    commandWordRows,
    questionTypeRows,
    misconceptionRuleRows,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(assessmentComponents)
      .where(eq(assessmentComponents.qualificationVersionId, qualificationVersionId)),
    db
      .select({ count: count() })
      .from(topics)
      .where(eq(topics.qualificationVersionId, qualificationVersionId)),
    db
      .select({ count: count() })
      .from(topicEdges)
      .innerJoin(topics, eq(topicEdges.fromTopicId, topics.id))
      .where(eq(topics.qualificationVersionId, qualificationVersionId)),
    db
      .select({ count: count() })
      .from(commandWords)
      .where(eq(commandWords.qualificationVersionId, qualificationVersionId)),
    db
      .select({ count: count() })
      .from(questionTypes)
      .where(eq(questionTypes.qualificationVersionId, qualificationVersionId)),
    db
      .select({ count: count() })
      .from(misconceptionRules)
      .innerJoin(topics, eq(misconceptionRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, qualificationVersionId)),
  ]);

  return {
    components: Number(componentRows[0]?.count ?? 0),
    topics: Number(topicRows[0]?.count ?? 0),
    edges: Number(edgeRows[0]?.count ?? 0),
    commandWords: Number(commandWordRows[0]?.count ?? 0),
    questionTypes: Number(questionTypeRows[0]?.count ?? 0),
    misconceptionRules: Number(misconceptionRuleRows[0]?.count ?? 0),
  };
}

export async function verifyCurriculumInput(
  input: unknown,
  options: { db?: Database } = {}
): Promise<CurriculumVerificationResult> {
  const checks: CurriculumVerificationCheck[] = [];
  const result: CurriculumVerificationResult = {
    ok: false,
    packageId: null,
    lifecycle: null,
    normalizedFrom: null,
    qualificationVersionId: null,
    adapterNotes: [],
    checks,
  };

  let prepared: ReturnType<typeof prepareCurriculumSeedInput>;
  let targetDb: Database;
  let qualificationVersionId: QualificationVersionId;
  let expectedStats: ReturnType<typeof getLegacySeedStats>;

  try {
    prepared = prepareCurriculumSeedInput(input);
    result.packageId = prepared.packageId;
    result.lifecycle = prepared.lifecycle;
    result.normalizedFrom = prepared.normalizedFrom;
    result.adapterNotes = prepared.adapterNotes;
    targetDb = await resolveCurriculumDb(options.db);

    checks.push({
      name: "package validates",
      ok: true,
      detail: `warnings=${prepared.validationReport.warnings.length}`,
    });
  } catch (error) {
    checks.push({
      name: "package validates",
      ok: false,
      detail: asErrorMessage(error),
    });
    return result;
  }

  try {
    const seedResult = await seedPreparedCurriculum(prepared, { db: targetDb });
    qualificationVersionId =
      seedResult.qualificationVersionId as QualificationVersionId;
    result.qualificationVersionId = qualificationVersionId;

    expectedStats = getLegacySeedStats(prepared.seedData);
    const actualCounts = await loadSeededCounts(targetDb, qualificationVersionId);

    if (
      actualCounts.components !== prepared.seedData.components.length ||
      actualCounts.topics !== expectedStats.topics ||
      actualCounts.edges !== expectedStats.edges ||
      actualCounts.commandWords !== expectedStats.commandWords ||
      actualCounts.questionTypes !== expectedStats.questionTypes ||
      actualCounts.misconceptionRules !== expectedStats.misconceptionRules
    ) {
      throw new Error(
        `Seeded row counts did not match expectations: expected components=${prepared.seedData.components.length} topics=${expectedStats.topics} edges=${expectedStats.edges} commandWords=${expectedStats.commandWords} questionTypes=${expectedStats.questionTypes} misconceptionRules=${expectedStats.misconceptionRules}; got components=${actualCounts.components} topics=${actualCounts.topics} edges=${actualCounts.edges} commandWords=${actualCounts.commandWords} questionTypes=${actualCounts.questionTypes} misconceptionRules=${actualCounts.misconceptionRules}`
      );
    }

    checks.push({
      name: "seed succeeds",
      ok: true,
      detail: `components=${seedResult.componentsCreated} topics=${seedResult.topicsCreated} edges=${seedResult.edgesCreated}`,
    });
  } catch (error) {
    checks.push({
      name: "seed succeeds",
      ok: false,
      detail: asErrorMessage(error),
    });
    return result;
  }

  try {
    const topicTree = await getTopicTree(targetDb, qualificationVersionId);
    const flattenedTree = flattenTopicTree(topicTree);

    if (topicTree.length !== expectedStats.rootTopics) {
      throw new Error(
        `Expected ${expectedStats.rootTopics} root topic(s), got ${topicTree.length}`
      );
    }

    if (flattenedTree.length !== expectedStats.topics) {
      throw new Error(
        `Expected ${expectedStats.topics} topic(s) in the loaded tree, got ${flattenedTree.length}`
      );
    }

    checks.push({
      name: "topic tree loads",
      ok: true,
      detail: `roots=${topicTree.length} topics=${flattenedTree.length}`,
    });
  } catch (error) {
    checks.push({
      name: "topic tree loads",
      ok: false,
      detail: asErrorMessage(error),
    });
    return result;
  }

  try {
    const [qualificationName, diagnosticTopics, qualificationOptions] =
      await Promise.all([
        getQualificationName(targetDb, qualificationVersionId),
        getDiagnosticTopics(targetDb, qualificationVersionId),
        loadQualificationOptions(targetDb),
      ]);

    const expectedQualificationName = `${prepared.seedData.level} ${prepared.seedData.subject.name}`;
    if (qualificationName !== expectedQualificationName) {
      throw new Error(
        `Expected qualification name ${expectedQualificationName}, got ${qualificationName ?? "<missing>"}`
      );
    }

    if (diagnosticTopics.length !== expectedStats.rootTopics) {
      throw new Error(
        `Expected ${expectedStats.rootTopics} diagnostic topic(s), got ${diagnosticTopics.length}`
      );
    }

    const seededOption = qualificationOptions.find(
      (option) => option.qualificationVersionId === qualificationVersionId
    );
    if (!seededOption) {
      throw new Error("Seeded qualification did not appear in loadQualificationOptions");
    }

    if (
      seededOption.subjectName !== prepared.seedData.subject.name ||
      seededOption.examBoardCode !== prepared.seedData.examBoard.code ||
      seededOption.versionCode !== prepared.seedData.versionCode
    ) {
      throw new Error(
        `Seeded qualification option did not match expected metadata: subject=${seededOption.subjectName} board=${seededOption.examBoardCode} version=${seededOption.versionCode}`
      );
    }

    checks.push({
      name: "curriculum queries cohere",
      ok: true,
      detail: `qualificationName=${qualificationName} diagnosticTopics=${diagnosticTopics.length}`,
    });
  } catch (error) {
    checks.push({
      name: "curriculum queries cohere",
      ok: false,
      detail: asErrorMessage(error),
    });
    return result;
  }

  try {
    const repeatSeed = await seedPreparedCurriculum(prepared, { db: targetDb });
    const repeatedCounts = await loadSeededCounts(targetDb, qualificationVersionId);

    if (
      repeatSeed.qualificationVersionId !== qualificationVersionId ||
      repeatSeed.componentsCreated !== 0 ||
      repeatSeed.topicsCreated !== 0 ||
      repeatSeed.edgesCreated !== 0
    ) {
      throw new Error(
        `Repeat seed was not idempotent: qualificationVersionId=${repeatSeed.qualificationVersionId} components=${repeatSeed.componentsCreated} topics=${repeatSeed.topicsCreated} edges=${repeatSeed.edgesCreated}`
      );
    }

    if (
      repeatedCounts.components !== prepared.seedData.components.length ||
      repeatedCounts.topics !== expectedStats.topics ||
      repeatedCounts.edges !== expectedStats.edges ||
      repeatedCounts.commandWords !== expectedStats.commandWords ||
      repeatedCounts.questionTypes !== expectedStats.questionTypes ||
      repeatedCounts.misconceptionRules !== expectedStats.misconceptionRules
    ) {
      throw new Error("Repeat seed changed seeded row counts");
    }

    checks.push({
      name: "repeat seed is idempotent",
      ok: true,
      detail: "second run created no additional rows",
    });
  } catch (error) {
    checks.push({
      name: "repeat seed is idempotent",
      ok: false,
      detail: asErrorMessage(error),
    });
    return result;
  }

  result.ok = true;
  return result;
}

export async function verifyCurriculumFile(
  filePath: string,
  options: { db?: Database } = {}
): Promise<CurriculumVerificationResult> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const fileContents = await readFile(absolutePath, "utf8");
  const input = JSON.parse(fileContents) as unknown;

  return verifyCurriculumInput(input, options);
}

export function formatVerificationResult(
  result: CurriculumVerificationResult
): string {
  const lines = [
    `Verify: ${result.ok ? "PASS" : "FAILED"}`,
  ];

  if (result.packageId) {
    lines.push(`Package: ${result.packageId}`);
  }

  if (result.lifecycle) {
    lines.push(`Lifecycle: ${result.lifecycle}`);
  }

  if (result.normalizedFrom) {
    lines.push(`Input: ${result.normalizedFrom}`);
  }

  if (result.qualificationVersionId) {
    lines.push(`Qualification version: ${result.qualificationVersionId}`);
  }

  lines.push("Checks:");
  for (const check of result.checks) {
    lines.push(`- ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  if (result.adapterNotes.length > 0) {
    lines.push("Notes:");
    for (const note of result.adapterNotes) {
      lines.push(`- ${note.message}`);
    }
  }

  return lines.join("\n");
}
