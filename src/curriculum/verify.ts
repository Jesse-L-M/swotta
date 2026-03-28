import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq } from "drizzle-orm";
import { getDiagnosticTopics, getQualificationName } from "@/engine/diagnostic";
import { getCoverageReport } from "@/engine/ingestion";
import { getTopicTree } from "@/engine/curriculum";
import { selectBlockType } from "@/engine/scheduler";
import {
  assessmentComponents,
  commandWords,
  examBoards,
  learners,
  misconceptionRules,
  organizations,
  qualifications,
  qualificationVersions,
  questionTypes,
  subjects,
  taskRules,
  topicEdges,
  topics,
  users,
} from "@/db/schema";
import { loadQualificationOptions } from "@/components/onboarding/data";
import type { Database } from "@/lib/db";
import type {
  LearnerId,
  QualificationVersionId,
  TopicId,
  TopicTreeNode,
} from "@/lib/types";
import {
  getLegacySeedStats,
  loadSyntheticSourceMappingTopicIds,
  prepareCurriculumSeedInput,
  resolveCurriculumDb,
  seedPreparedCurriculum,
  type CurriculumSeedNote,
} from "./seed";
import type { LegacyQualificationSeed } from "./legacy";
import type { CurriculumPackageLifecycle } from "./schema";

export interface CurriculumVerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface CurriculumVerificationResult {
  ok: boolean;
  mode: "dry_run";
  packageId: string | null;
  lifecycle: CurriculumPackageLifecycle | null;
  normalizedFrom: "package" | "legacy_seed" | null;
  qualificationVersionId: string | null;
  qualificationVersionPersistence: "existing" | "dry_run_only" | null;
  adapterNotes: CurriculumSeedNote[];
  limitations: string[];
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

const VERIFY_ROLLBACK = Symbol("verify-rollback");

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

async function findExistingQualificationVersionId(
  db: Database,
  seedData: LegacyQualificationSeed
): Promise<QualificationVersionId | null> {
  const [row] = await db
    .select({ id: qualificationVersions.id })
    .from(qualificationVersions)
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .innerJoin(subjects, eq(qualifications.subjectId, subjects.id))
    .innerJoin(
      examBoards,
      eq(qualificationVersions.examBoardId, examBoards.id)
    )
    .where(
      and(
        eq(subjects.slug, seedData.subject.slug),
        eq(
          qualifications.level,
          seedData.level as typeof qualifications.$inferSelect.level
        ),
        eq(examBoards.code, seedData.examBoard.code),
        eq(qualificationVersions.versionCode, seedData.versionCode)
      )
    )
    .limit(1);

  return (row?.id as QualificationVersionId | undefined) ?? null;
}

async function withTemporaryLearner<T>(
  db: Database,
  run: (tx: Database, learnerId: LearnerId) => Promise<T>
): Promise<T> {
  let result: T | undefined;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: `Curriculum Verify ${suffix}`,
          type: "household",
          slug: `curriculum-verify-${suffix}`,
        })
        .returning({ id: organizations.id });

      const [user] = await tx
        .insert(users)
        .values({
          firebaseUid: `curriculum-verify-${suffix}`,
          email: `curriculum-verify-${suffix}@example.com`,
          name: "Curriculum Verify User",
        })
        .returning({ id: users.id });

      const [learner] = await tx
        .insert(learners)
        .values({
          userId: user.id,
          orgId: org.id,
          displayName: "Curriculum Verify Learner",
          yearGroup: 10,
        })
        .returning({ id: learners.id });

      result = await run(tx as unknown as Database, learner.id as LearnerId);
      throw VERIFY_ROLLBACK;
    });
  } catch (error) {
    if (error !== VERIFY_ROLLBACK) {
      throw error;
    }
  }

  if (result === undefined) {
    throw new Error("Failed to produce a temporary verification learner");
  }

  return result;
}

async function withRollbackTransaction(
  db: Database,
  run: (tx: Database) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await run(tx as unknown as Database);
      throw VERIFY_ROLLBACK;
    });
  } catch (error) {
    if (error !== VERIFY_ROLLBACK) {
      throw error;
    }
  }
}

async function verifySchedulerAssumptions(
  db: Database,
  qualificationVersionId: QualificationVersionId
): Promise<string> {
  const rows = await db
    .select({
      topicId: taskRules.topicId,
      blockType: taskRules.blockType,
      difficultyMin: taskRules.difficultyMin,
      difficultyMax: taskRules.difficultyMax,
    })
    .from(taskRules)
    .innerJoin(topics, eq(taskRules.topicId, topics.id))
    .where(eq(topics.qualificationVersionId, qualificationVersionId));

  if (rows.length === 0) {
    return "no task rules to exercise";
  }

  for (const row of rows) {
    const targetDifficulty = Math.max(
      row.difficultyMin,
      Math.min(row.difficultyMax, row.difficultyMin)
    );
    const masteryLevel = targetDifficulty / 5;
    const selected = await selectBlockType(
      row.topicId as TopicId,
      masteryLevel,
      0,
      0,
      db
    );

    if (selected !== row.blockType) {
      throw new Error(
        `Expected scheduler to select ${row.blockType} for topic ${row.topicId} at difficulty ${targetDifficulty}, got ${selected}`
      );
    }
  }

  return `rules=${rows.length}`;
}

async function verifySourceCoverageAssumptions(
  db: Database,
  qualificationVersionId: QualificationVersionId,
  expectedMappedTopicIds: TopicId[]
): Promise<string> {
  if (expectedMappedTopicIds.length === 0) {
    throw new Error(
      "Synthetic source mappings were not materialized for source-side verification"
    );
  }

  const coverageRows = await withTemporaryLearner(
    db,
    async (tx, learnerId) => {
      return getCoverageReport(
        learnerId,
        qualificationVersionId,
        { db: tx }
      );
    }
  );
  const expectedTopicIds = new Set(expectedMappedTopicIds);
  const coverageByTopicId = new Map(
    coverageRows.map((row) => [row.topicId, row] as const)
  );
  const missingTopicNames = [...expectedTopicIds].flatMap((topicId) => {
    const coverage = coverageByTopicId.get(topicId);
    if (coverage?.hasSources) {
      return [];
    }

    return [coverage?.topicName ?? topicId];
  });

  if (missingTopicNames.length > 0) {
    throw new Error(
      `Coverage report did not expose synthetic mapped topic(s): ${missingTopicNames.join(", ")}`
    );
  }

  const coveredTopicCount = coverageRows.filter((row) => row.hasSources).length;
  return `visibleSyntheticTopics=${expectedTopicIds.size} totalCoveredTopics=${coveredTopicCount}`;
}

export async function verifyCurriculumInput(
  input: unknown,
  options: { db?: Database } = {}
): Promise<CurriculumVerificationResult> {
  const checks: CurriculumVerificationCheck[] = [];
  const result: CurriculumVerificationResult = {
    ok: false,
    mode: "dry_run",
    packageId: null,
    lifecycle: null,
    normalizedFrom: null,
    qualificationVersionId: null,
    qualificationVersionPersistence: null,
    adapterNotes: [],
    limitations: [],
    checks,
  };

  let prepared: ReturnType<typeof prepareCurriculumSeedInput>;
  let targetDb: Database;
  let existingQualificationVersionId: QualificationVersionId | null = null;
  let qualificationVersionId: QualificationVersionId;
  let expectedStats: ReturnType<typeof getLegacySeedStats>;

  try {
    prepared = prepareCurriculumSeedInput(input);
    result.packageId = prepared.packageId;
    result.lifecycle = prepared.lifecycle;
    result.normalizedFrom = prepared.normalizedFrom;
    result.adapterNotes = prepared.adapterNotes;
    targetDb = await resolveCurriculumDb(options.db);
    existingQualificationVersionId = await findExistingQualificationVersionId(
      targetDb,
      prepared.seedData
    );
    if (
      prepared.normalizedFrom === "package" &&
      prepared.curriculumPackage.sourceMappings.length > 0
    ) {
      result.limitations.push(
        "Source verification uses synthetic source artifacts and the coverage query. It does not re-run extraction, chunking, embeddings, or classifier mapping."
      );
    } else if (
      prepared.normalizedFrom === "package" &&
      prepared.curriculumPackage.sourceMappings.length === 0
    ) {
      result.limitations.push(
        "No source-side verification ran because the package has no source mapping hints."
      );
    }

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

  await withRollbackTransaction(targetDb, async (verificationDb) => {
    try {
      const seedResult = await seedPreparedCurriculum(prepared, {
        db: verificationDb,
      });
      qualificationVersionId =
        seedResult.qualificationVersionId as QualificationVersionId;
      result.qualificationVersionId = qualificationVersionId;
      result.qualificationVersionPersistence = existingQualificationVersionId
        ? "existing"
        : "dry_run_only";

      expectedStats = getLegacySeedStats(prepared.seedData);
      const actualCounts = await loadSeededCounts(
        verificationDb,
        qualificationVersionId
      );

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
      return;
    }

    try {
      const topicTree = await getTopicTree(verificationDb, qualificationVersionId);
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
      return;
    }

    try {
      const [qualificationName, diagnosticTopics, qualificationOptions] =
        await Promise.all([
          getQualificationName(verificationDb, qualificationVersionId),
          getDiagnosticTopics(verificationDb, qualificationVersionId),
          loadQualificationOptions(verificationDb),
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
        throw new Error(
          "Seeded qualification did not appear in loadQualificationOptions"
        );
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
      return;
    }

    try {
      const repeatSeed = await seedPreparedCurriculum(prepared, {
        db: verificationDb,
      });
      const repeatedCounts = await loadSeededCounts(
        verificationDb,
        qualificationVersionId
      );

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
      return;
    }

    if (
      prepared.normalizedFrom === "package" &&
      prepared.curriculumPackage.taskRules.length > 0
    ) {
      try {
        const detail = await verifySchedulerAssumptions(
          verificationDb,
          qualificationVersionId
        );
        checks.push({
          name: "scheduler assumptions cohere",
          ok: true,
          detail,
        });
      } catch (error) {
        checks.push({
          name: "scheduler assumptions cohere",
          ok: false,
          detail: asErrorMessage(error),
        });
        return;
      }
    }

    if (
      prepared.normalizedFrom === "package" &&
      prepared.curriculumPackage.sourceMappings.length > 0
    ) {
      try {
        const expectedMappedTopicIds = await loadSyntheticSourceMappingTopicIds(
          verificationDb,
          qualificationVersionId
        );
        const detail = await verifySourceCoverageAssumptions(
          verificationDb,
          qualificationVersionId,
          expectedMappedTopicIds as TopicId[]
        );
        checks.push({
          name: "synthetic source coverage query sees mapped topics",
          ok: true,
          detail,
        });
      } catch (error) {
        checks.push({
          name: "synthetic source coverage query sees mapped topics",
          ok: false,
          detail: asErrorMessage(error),
        });
        return;
      }
    }

    result.ok = true;
  });

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
    "Mode: dry-run (seed rolled back after checks)",
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
    if (result.qualificationVersionPersistence === "dry_run_only") {
      lines.push(
        `Qualification version (dry-run only): ${result.qualificationVersionId}`
      );
    } else if (result.qualificationVersionPersistence === "existing") {
      lines.push(
        `Qualification version (existing): ${result.qualificationVersionId}`
      );
    } else {
      lines.push(`Qualification version: ${result.qualificationVersionId}`);
    }
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

  if (result.limitations.length > 0) {
    lines.push("Limitations:");
    for (const limitation of result.limitations) {
      lines.push(`- ${limitation}`);
    }
  }

  return lines.join("\n");
}
