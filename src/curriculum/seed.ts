import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, or } from "drizzle-orm";
import { loadQualification, type LoadQualificationResult } from "@/engine/curriculum";
import { estimateBlockDuration } from "@/engine/scheduler";
import biologyLegacySeedJson from "@/data/seeds/gcse-biology-aqa.json";
import {
  assessmentComponents,
  assignments,
  chunkEmbeddings,
  commandWords as commandWordsTable,
  confidenceEvents,
  examBoards,
  learnerComponentState,
  learnerTopicState,
  misconceptionEvents,
  misconceptionRules as misconceptionRulesTable,
  retentionEvents,
  reviewQueue,
  qualifications,
  qualificationVersions,
  questionTypes as questionTypesTable,
  sourceChunks,
  sourceCollections,
  sourceFiles,
  sourceMappings as sourceMappingsTable,
  studyBlocks,
  subjects,
  taskRules as taskRulesTable,
  teacherNotes,
  topicEdges as topicEdgesTable,
  topics as topicsTable,
  users,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import type { BlockType } from "@/lib/types";
import type { LegacyQualificationSeed, LegacyQualificationTopicSeed } from "./legacy";
import { legacyQualificationSeedSchema } from "./legacy";
import type {
  CurriculumPackage,
  CurriculumPackageLifecycle,
  CurriculumTaskRule,
  CurriculumTopic,
} from "./schema";
import {
  formatValidationReport,
  validateCurriculumPackage,
  type CurriculumValidationReport,
} from "./validation";

type SeedInputKind = "package" | "legacy_seed";

const SYSTEM_CURRICULUM_USER = {
  firebaseUid: "curriculum-seed-system",
  email: "curriculum-seed-system@swotta.local",
  name: "Curriculum Seed System",
};

const AQA_GCSE_BIOLOGY_8461_PACKAGE_ID = "aqa-gcse-biology-8461";
const AQA_GCSE_BIOLOGY_8461_LEGACY_SEED = legacyQualificationSeedSchema.parse(
  biologyLegacySeedJson
);
const AQA_GCSE_BIOLOGY_8461_LEGACY_SNAPSHOT = buildExpectedCoreSnapshot(
  AQA_GCSE_BIOLOGY_8461_LEGACY_SEED
);
const AQA_GCSE_BIOLOGY_8461_COMPONENT_CODE_COMPATIBILITY: Record<string, string> =
  {
    "8461/1H": "paper-1",
    "8461/2H": "paper-2",
  };
const AQA_GCSE_BIOLOGY_8461_TOPIC_CODE_COMPATIBILITY: Record<string, string> = {
  "4.2.2.2": "4.2.2.1",
  "4.2.3": "4.2.2.2",
  "4.2.4": "4.2.3",
  "4.2.5": "4.2.2.6",
  "4.3.2": "4.3.1",
  "4.3.2.1": "4.3.1.7",
  "4.3.2.2": "4.3.1.8",
  "4.3.2.3": "4.3.1.9",
  "4.3.3": "4.3.2",
  "4.3.4": "4.3.3",
  "4.4.2.2": "4.4.2.1",
  "4.4.2.3": "4.4.2.2",
  "4.5.2.2": "4.5.2.1",
  "4.5.3.3": "4.5.3.4",
};

export interface CurriculumSeedNote {
  code: string;
  message: string;
}

export interface PreparedCurriculumSeed {
  packageId: string;
  lifecycle: CurriculumPackageLifecycle;
  normalizedFrom: SeedInputKind;
  validationReport: CurriculumValidationReport;
  curriculumPackage: CurriculumPackage;
  seedData: LegacyQualificationSeed;
  adapterNotes: CurriculumSeedNote[];
}

export interface CurriculumSeedResult
  extends PreparedCurriculumSeed,
    LoadQualificationResult {}

export interface LegacySeedStats {
  rootTopics: number;
  topics: number;
  edges: number;
  commandWords: number;
  questionTypes: number;
  misconceptionRules: number;
}

interface NormalizedTopicRecord {
  id?: string;
  key: string;
  path: string;
  parentPath: string | null;
  name: string;
  code: string | null;
  depth: number;
  sortOrder: number;
  description: string | null;
  estimatedHours: string | null;
}

interface TopicRecordSet {
  records: NormalizedTopicRecord[];
  keyToId: Map<string, string>;
  idToKey: Map<string, string>;
}

interface NormalizedComponentRecord {
  id?: string;
  code: string;
  name: string;
  weightPercent: number;
  durationMinutes: number | null;
  totalMarks: number | null;
  isExam: boolean;
}

interface ComponentRecordSet {
  records: NormalizedComponentRecord[];
  codeToId: Map<string, string>;
  idToCode: Map<string, string>;
}

interface NormalizedTaskRuleRecord {
  topicId: string;
  topicKey: string;
  blockType: BlockType;
  difficultyMin: number;
  difficultyMax: number;
  timeEstimateMinutes: number;
  instructions: string | null;
}

interface NormalizedSyntheticSourceMappingRecord {
  topicId: string | null;
  topicKey: string | null;
  componentId: string | null;
  componentCode: string | null;
  filename: string;
  storagePath: string;
  chunkIndex: number;
  content: string;
  confidence: string;
  mappingMethod: "manual" | "auto";
}

interface SyntheticSourceCollectionState {
  collectionId: string | null;
  fileCount: number;
  chunkCount: number;
  mappings: NormalizedSyntheticSourceMappingRecord[];
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortTopics(left: CurriculumTopic, right: CurriculumTopic): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.name.localeCompare(right.name);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  return value ?? null;
}

function normalizeNumericString(
  value: string | number | null | undefined
): string | null {
  if (value == null) {
    return null;
  }

  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `${numericValue}`;
}

function normalizeConfidenceValue(value: "low" | "medium" | "high"): string {
  switch (value) {
    case "low":
      return "0.55";
    case "medium":
      return "0.75";
    case "high":
      return "0.95";
  }
}

function mapTaskTypeToBlockType(
  taskType: CurriculumTaskRule["taskType"]
): BlockType {
  if (taskType === "mixed_practice") {
    return "retrieval_drill";
  }

  return taskType;
}

function buildTaskRuleInstructions(rule: CurriculumTaskRule): string {
  const lines = [rule.title, rule.guidance];
  for (const condition of rule.conditions) {
    lines.push(`Condition: ${condition}`);
  }
  return lines.join("\n");
}

function curriculumSupportCollectionName(
  qualificationVersionId: string
): string {
  return `curriculum-seed-${qualificationVersionId}`;
}

function curriculumSupportFilename(sourceId: string): string {
  return `curriculum-source-${sourceId}.txt`;
}

function curriculumSupportStoragePath(
  qualificationVersionId: string,
  sourceId: string
): string {
  return `curriculum/${qualificationVersionId}/${sourceId}.txt`;
}

function buildSyntheticChunkContent(
  sourceTitle: string,
  locator: string,
  excerptHint?: string
): string {
  const lines = [
    `Source: ${sourceTitle}`,
    `Locator: ${locator}`,
  ];
  if (excerptHint) {
    lines.push(`Hint: ${excerptHint}`);
  }
  return lines.join("\n");
}

function countApproximateTokens(content: string): number {
  return Math.max(1, content.trim().split(/\s+/).filter(Boolean).length);
}

function compareCollections<T>(
  label: string,
  actual: T[],
  expected: T[]
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `Seeded ${label} length mismatch. Expected ${expected.length}, got ${actual.length}`
    );
  }

  for (let index = 0; index < expected.length; index += 1) {
    const actualRow = JSON.stringify(actual[index]);
    const expectedRow = JSON.stringify(expected[index]);
    if (actualRow !== expectedRow) {
      throw new Error(
        `Seeded ${label} mismatch at index ${index}. Expected ${expectedRow}, got ${actualRow}`
      );
    }
  }
}

function collectionsEqual<T>(actual: T[], expected: T[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  return actual.every(
    (row, index) => JSON.stringify(row) === JSON.stringify(expected[index])
  );
}

function isSubsetCollection<T>(actual: T[], expected: T[]): boolean {
  const expectedCounts = new Map<string, number>();
  for (const row of expected) {
    const key = JSON.stringify(row);
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }

  for (const row of actual) {
    const key = JSON.stringify(row);
    const remaining = expectedCounts.get(key) ?? 0;
    if (remaining === 0) {
      return false;
    }
    expectedCounts.set(key, remaining - 1);
  }

  return true;
}

type CoreSnapshot = Omit<
  ReturnType<typeof buildExpectedCoreSnapshot>,
  "misconceptionRules"
> & {
  misconceptionRules: Array<{
    topicCode: string | null;
    description: string;
    triggerPatterns: string[];
    correctionGuidance: string;
    severity: number;
  }>;
};

function hasCoreSnapshotData(snapshot: CoreSnapshot): boolean {
  return (
    snapshot.components.length > 0 ||
    snapshot.topics.length > 0 ||
    snapshot.edges.length > 0 ||
    snapshot.commandWords.length > 0 ||
    snapshot.questionTypes.length > 0 ||
    snapshot.misconceptionRules.length > 0
  );
}

function getCoreSnapshotMismatch(
  actual: CoreSnapshot,
  expected: CoreSnapshot
): string | null {
  const comparisons: Array<{ label: string; compare: () => void }> = [
    {
      label: "components",
      compare: () => compareCollections("components", actual.components, expected.components),
    },
    {
      label: "topics",
      compare: () => compareCollections("topics", actual.topics, expected.topics),
    },
    {
      label: "edges",
      compare: () => compareCollections("edges", actual.edges, expected.edges),
    },
    {
      label: "command words",
      compare: () =>
        compareCollections("command words", actual.commandWords, expected.commandWords),
    },
    {
      label: "question types",
      compare: () =>
        compareCollections("question types", actual.questionTypes, expected.questionTypes),
    },
    {
      label: "misconception rules",
      compare: () =>
        compareCollections(
          "misconception rules",
          actual.misconceptionRules,
          expected.misconceptionRules
        ),
    },
  ];

  for (const comparison of comparisons) {
    try {
      comparison.compare();
    } catch (error) {
      return asErrorMessage(error);
    }
  }

  return null;
}

function createAdapterNotes(
  curriculumPackage: CurriculumPackage
): CurriculumSeedNote[] {
  const notes: CurriculumSeedNote[] = [];
  const seedableTaskRules = curriculumPackage.taskRules.filter((rule) =>
    Boolean(rule.topicId)
  );
  const globalTaskRuleCount =
    curriculumPackage.taskRules.length - seedableTaskRules.length;

  const annotationCount =
    (curriculumPackage.annotations?.markSchemePatterns.length ?? 0) +
    (curriculumPackage.annotations?.examTechniquePatterns.length ?? 0);
  if (annotationCount > 0) {
    notes.push({
      code: "annotations_not_seeded",
      message: `${annotationCount} annotation record(s) were not persisted because the current curriculum seed path does not store review annotations.`,
    });
  }

  if (globalTaskRuleCount > 0) {
    notes.push({
      code: "global_task_rules_not_seeded",
      message: `${globalTaskRuleCount} global task rule(s) were not persisted because the current scheduler table only supports topic-scoped task rules.`,
    });
  }

  const mixedPracticeCount = seedableTaskRules.filter(
    (rule) => rule.taskType === "mixed_practice"
  ).length;
  if (mixedPracticeCount > 0) {
    notes.push({
      code: "mixed_practice_mapped",
      message: `${mixedPracticeCount} mixed_practice task rule(s) were mapped to retrieval_drill for the current scheduler table.`,
    });
  }

  return notes;
}

function buildLegacyTopicsFromPackage(
  curriculumPackage: CurriculumPackage
): LegacyQualificationTopicSeed[] {
  const childrenByParentId = new Map<string | null, CurriculumTopic[]>();
  const topicCodeById = new Map<string, string>();
  const edgesByTopicId = new Map<
    string,
    Array<{
      toCode: string;
      type: "prerequisite" | "builds_on" | "related";
    }>
  >();

  for (const topic of curriculumPackage.topics) {
    const siblings = childrenByParentId.get(topic.parentId) ?? [];
    siblings.push(topic);
    childrenByParentId.set(topic.parentId, siblings);

    if (topic.code) {
      topicCodeById.set(topic.id, topic.code);
    }
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(sortTopics);
  }

  for (const edge of curriculumPackage.edges) {
    const fromCode = topicCodeById.get(edge.fromTopicId);
    const toCode = topicCodeById.get(edge.toTopicId);

    if (!fromCode) {
      throw new Error(
        `Cannot seed package edge from topic ${edge.fromTopicId} because that topic has no code for the legacy loader`
      );
    }

    if (!toCode) {
      throw new Error(
        `Cannot seed package edge to topic ${edge.toTopicId} because that topic has no code for the legacy loader`
      );
    }

    const edges = edgesByTopicId.get(edge.fromTopicId) ?? [];
    edges.push({ toCode, type: edge.type });
    edgesByTopicId.set(edge.fromTopicId, edges);
  }

  function buildNode(topic: CurriculumTopic): LegacyQualificationTopicSeed {
    const node: LegacyQualificationTopicSeed = {
      name: topic.name,
      code: topic.code,
      description: topic.description,
      estimatedHours: topic.estimatedHours,
    };

    const childTopics = childrenByParentId.get(topic.id) ?? [];
    if (childTopics.length > 0) {
      node.children = childTopics.map(buildNode);
    }

    const edges = edgesByTopicId.get(topic.id);
    if (edges && edges.length > 0) {
      node.edges = edges;
    }

    return node;
  }

  return (childrenByParentId.get(null) ?? []).map(buildNode);
}

function buildPackageTopicRecords(
  curriculumPackage: CurriculumPackage
): Array<NormalizedTopicRecord & { contractId: string }> {
  const childrenByParentId = new Map<string | null, CurriculumTopic[]>();
  for (const topic of curriculumPackage.topics) {
    const siblings = childrenByParentId.get(topic.parentId) ?? [];
    siblings.push(topic);
    childrenByParentId.set(topic.parentId, siblings);
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(sortTopics);
  }

  const records: Array<NormalizedTopicRecord & { contractId: string }> = [];

  function visit(
    topicsForParent: CurriculumTopic[],
    parentPath: string | null
  ): void {
    for (const topic of topicsForParent) {
      const pathSegments = parentPath ? [parentPath, `${topic.sortOrder}`] : [`${topic.sortOrder}`];
      const pathKey = pathSegments.join(".");
      records.push({
        contractId: topic.id,
        key: topic.code ?? pathKey,
        path: pathKey,
        parentPath,
        name: topic.name,
        code: topic.code ?? null,
        depth: topic.depth,
        sortOrder: topic.sortOrder,
        description: normalizeOptionalText(topic.description),
        estimatedHours: normalizeNumericString(topic.estimatedHours),
      });

      const children = childrenByParentId.get(topic.id) ?? [];
      if (children.length > 0) {
        visit(children, pathKey);
      }
    }
  }

  visit(childrenByParentId.get(null) ?? [], null);
  return records;
}

export function buildLegacySeedFromCurriculumPackage(
  curriculumPackage: CurriculumPackage
): LegacyQualificationSeed {
  if (curriculumPackage.qualification.firstExamYear == null) {
    throw new Error(
      "Cannot seed a curriculum package without qualification.firstExamYear because the legacy loader requires it"
    );
  }

  const topicCodeById = new Map(
    curriculumPackage.topics
      .filter((topic): topic is CurriculumTopic & { code: string } =>
        Boolean(topic.code)
      )
      .map((topic) => [topic.id, topic.code])
  );

  return {
    subject: {
      name: curriculumPackage.qualification.subject.name,
      slug: curriculumPackage.qualification.subject.slug,
    },
    examBoard: {
      name: curriculumPackage.qualification.examBoard.name,
      code: curriculumPackage.qualification.examBoard.code,
    },
    level: curriculumPackage.qualification.level,
    versionCode: curriculumPackage.qualification.versionCode,
    firstExamYear: curriculumPackage.qualification.firstExamYear,
    specUrl: curriculumPackage.qualification.specUrl,
    components: curriculumPackage.components.map((component) => ({
      name: component.name,
      code: component.code,
      weightPercent: component.weightPercent,
      durationMinutes: component.durationMinutes,
      totalMarks: component.totalMarks,
      isExam: component.isExam,
    })),
    topics: buildLegacyTopicsFromPackage(curriculumPackage),
    commandWords: curriculumPackage.commandWords.map((commandWord) => ({
      word: commandWord.word,
      definition: commandWord.definition,
      expectedDepth: commandWord.expectedDepth,
    })),
    questionTypes: curriculumPackage.questionTypes.map((questionType) => ({
      name: questionType.name,
      description: questionType.description,
      typicalMarks: questionType.typicalMarks,
      markSchemePattern: questionType.markSchemePattern,
    })),
    misconceptionRules:
      curriculumPackage.misconceptionRules.length > 0
        ? curriculumPackage.misconceptionRules.map((rule) => {
            const topicCode = topicCodeById.get(rule.topicId);
            if (!topicCode) {
              throw new Error(
                `Cannot seed misconception rule ${rule.id} because topic ${rule.topicId} has no code for the legacy loader`
              );
            }

            return {
              topicCode,
              description: rule.description,
              triggerPatterns: rule.triggerPatterns,
              correctionGuidance: rule.correctionGuidance,
              severity: rule.severity,
            };
          })
        : undefined,
  };
}

async function loadJsonFile(filePath: string): Promise<unknown> {
  const absolutePath = path.resolve(process.cwd(), filePath);

  try {
    const fileContents = await readFile(absolutePath, "utf8");
    return JSON.parse(fileContents) as unknown;
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${asErrorMessage(error)}`);
  }
}

async function findExistingQualificationVersionId(
  db: Database,
  seedData: LegacyQualificationSeed
): Promise<string | null> {
  const [row] = await db
    .select({ id: qualificationVersions.id })
    .from(qualificationVersions)
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .innerJoin(subjects, eq(qualifications.subjectId, subjects.id))
    .innerJoin(examBoards, eq(qualificationVersions.examBoardId, examBoards.id))
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

  return row?.id ?? null;
}

export function prepareCurriculumSeedInput(
  input: unknown
): PreparedCurriculumSeed {
  const validationReport = validateCurriculumPackage(input);

  if (!validationReport.ok || !validationReport.package) {
    throw new Error(formatValidationReport(validationReport));
  }

  if (
    validationReport.normalizedFrom === "package" &&
    validationReport.package.lifecycle !== "approved" &&
    validationReport.package.lifecycle !== "reference"
  ) {
    throw new Error(
      `curriculum seed requires an approved/reference package or a legacy seed JSON; received package lifecycle ${validationReport.package.lifecycle}`
    );
  }

  const seedData =
    validationReport.normalizedFrom === "legacy_seed"
      ? legacyQualificationSeedSchema.parse(input)
      : buildLegacySeedFromCurriculumPackage(validationReport.package);

  return {
    packageId: validationReport.package.metadata.packageId,
    lifecycle: validationReport.package.lifecycle,
    normalizedFrom: validationReport.normalizedFrom ?? "package",
    validationReport,
    curriculumPackage: validationReport.package,
    seedData,
    adapterNotes: createAdapterNotes(validationReport.package),
  };
}

export async function resolveCurriculumDb(
  explicitDb?: Database
): Promise<Database> {
  if (explicitDb) {
    return explicitDb;
  }

  const { db } = await import("@/lib/db");
  return db;
}

function flattenExpectedSeedTopics(
  nodes: LegacyQualificationTopicSeed[],
  parentPath: string | null = null,
  depth = 0
): NormalizedTopicRecord[] {
  const flattened: NormalizedTopicRecord[] = [];

  nodes.forEach((node, index) => {
    const sortOrder = index + 1;
    const pathKey = parentPath ? `${parentPath}.${sortOrder}` : `${sortOrder}`;
    flattened.push({
      key: node.code ?? pathKey,
      path: pathKey,
      parentPath,
      name: node.name,
      code: node.code ?? null,
      depth,
      sortOrder,
      description: normalizeOptionalText(node.description),
      estimatedHours: normalizeNumericString(node.estimatedHours),
    });

    if (node.children && node.children.length > 0) {
      flattened.push(
        ...flattenExpectedSeedTopics(node.children, pathKey, depth + 1)
      );
    }
  });

  return flattened;
}

async function loadActualTopicRecords(
  db: Database,
  qualificationVersionId: string
): Promise<TopicRecordSet> {
  const rows = await db
    .select({
      id: topicsTable.id,
      parentTopicId: topicsTable.parentTopicId,
      name: topicsTable.name,
      code: topicsTable.code,
      depth: topicsTable.depth,
      sortOrder: topicsTable.sortOrder,
      description: topicsTable.description,
      estimatedHours: topicsTable.estimatedHours,
    })
    .from(topicsTable)
    .where(eq(topicsTable.qualificationVersionId, qualificationVersionId));

  const rowsByParentId = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const siblings = rowsByParentId.get(row.parentTopicId) ?? [];
    siblings.push(row);
    rowsByParentId.set(row.parentTopicId, siblings);
  }

  for (const siblings of rowsByParentId.values()) {
    siblings.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.name.localeCompare(right.name);
    });
  }

  const records: NormalizedTopicRecord[] = [];
  const keyToId = new Map<string, string>();
  const idToKey = new Map<string, string>();

  function visit(parentId: string | null, parentPath: string | null): void {
    const siblings = rowsByParentId.get(parentId) ?? [];
    for (const row of siblings) {
      const pathKey = parentPath ? `${parentPath}.${row.sortOrder}` : `${row.sortOrder}`;
      const topicKey = row.code ?? pathKey;
      records.push({
        id: row.id,
        key: topicKey,
        path: pathKey,
        parentPath,
        name: row.name,
        code: row.code,
        depth: row.depth,
        sortOrder: row.sortOrder,
        description: normalizeOptionalText(row.description),
        estimatedHours: normalizeNumericString(row.estimatedHours),
      });
      keyToId.set(topicKey, row.id);
      idToKey.set(row.id, topicKey);
      visit(row.id, pathKey);
    }
  }

  visit(null, null);
  return { records, keyToId, idToKey };
}

async function loadActualComponentRecords(
  db: Database,
  qualificationVersionId: string
): Promise<ComponentRecordSet> {
  const rows = await db
    .select({
      id: assessmentComponents.id,
      code: assessmentComponents.code,
      name: assessmentComponents.name,
      weightPercent: assessmentComponents.weightPercent,
      durationMinutes: assessmentComponents.durationMinutes,
      totalMarks: assessmentComponents.totalMarks,
      isExam: assessmentComponents.isExam,
    })
    .from(assessmentComponents)
    .where(eq(assessmentComponents.qualificationVersionId, qualificationVersionId));

  const records = rows
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      weightPercent: row.weightPercent,
      durationMinutes: row.durationMinutes ?? null,
      totalMarks: row.totalMarks ?? null,
      isExam: row.isExam,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));

  return {
    records,
    codeToId: new Map(
      records.flatMap((record) => (record.id ? [[record.code, record.id] as const] : []))
    ),
    idToCode: new Map(
      records.flatMap((record) => (record.id ? [[record.id, record.code] as const] : []))
    ),
  };
}

function buildExpectedCoreSnapshot(seedData: LegacyQualificationSeed) {
  const topics = flattenExpectedSeedTopics(seedData.topics);
  const codeToKey = new Map(
    topics
      .filter((topic) => topic.code)
      .map((topic) => [topic.code as string, topic.key])
  );

  const edges: Array<{
    fromKey: string;
    fromCode: string;
    toKey: string;
    toCode: string;
    type: "prerequisite" | "builds_on" | "related";
  }> = [];

  for (const topic of flattenLegacyTopicSeedNodes(seedData.topics)) {
    if (!topic.code || !topic.edges) {
      continue;
    }
    for (const edge of topic.edges) {
      const fromKey = codeToKey.get(topic.code);
      const toKey = codeToKey.get(edge.toCode);
      if (!fromKey || !toKey) {
        continue;
      }
      edges.push({
        fromKey,
        fromCode: topic.code,
        toKey,
        toCode: edge.toCode,
        type: edge.type,
      });
    }
  }

  edges.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );

  const components = [...seedData.components]
    .map((component) => ({
      code: component.code,
      name: component.name,
      weightPercent: component.weightPercent,
      durationMinutes: component.durationMinutes ?? null,
      totalMarks: component.totalMarks ?? null,
      isExam: component.isExam,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));

  const commandWords = [...seedData.commandWords]
    .map((commandWord) => ({
      word: commandWord.word,
      definition: commandWord.definition,
      expectedDepth: commandWord.expectedDepth,
    }))
    .sort((left, right) => left.word.localeCompare(right.word));

  const questionTypes = [...seedData.questionTypes]
    .map((questionType) => ({
      name: questionType.name,
      description: questionType.description ?? null,
      typicalMarks: questionType.typicalMarks ?? null,
      markSchemePattern: questionType.markSchemePattern ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const misconceptionRules = [...(seedData.misconceptionRules ?? [])]
    .map((rule) => ({
      topicCode: rule.topicCode,
      description: rule.description,
      triggerPatterns: [...rule.triggerPatterns],
      correctionGuidance: rule.correctionGuidance,
      severity: rule.severity ?? 2,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

  return {
    components,
    topics,
    edges,
    commandWords,
    questionTypes,
    misconceptionRules,
  };
}

async function loadActualCoreSnapshot(
  db: Database,
  qualificationVersionId: string
) {
  const [topicRecords, componentRecords, edges, commandWords, questionTypes, misconceptionRules] =
    await Promise.all([
      loadActualTopicRecords(db, qualificationVersionId),
      loadActualComponentRecords(db, qualificationVersionId),
      db
        .select({
          fromTopicId: topicEdgesTable.fromTopicId,
          toTopicId: topicEdgesTable.toTopicId,
          type: topicEdgesTable.edgeType,
        })
        .from(topicEdgesTable)
        .innerJoin(topicsTable, eq(topicEdgesTable.fromTopicId, topicsTable.id))
        .where(eq(topicsTable.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          word: commandWordsTable.word,
          definition: commandWordsTable.definition,
          expectedDepth: commandWordsTable.expectedDepth,
        })
        .from(commandWordsTable)
        .where(eq(commandWordsTable.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          name: questionTypesTable.name,
          description: questionTypesTable.description,
          typicalMarks: questionTypesTable.typicalMarks,
          markSchemePattern: questionTypesTable.markSchemePattern,
        })
        .from(questionTypesTable)
        .where(eq(questionTypesTable.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          topicCode: topicsTable.code,
          description: misconceptionRulesTable.description,
          triggerPatterns: misconceptionRulesTable.triggerPatterns,
          correctionGuidance: misconceptionRulesTable.correctionGuidance,
          severity: misconceptionRulesTable.severity,
        })
        .from(misconceptionRulesTable)
        .innerJoin(topicsTable, eq(misconceptionRulesTable.topicId, topicsTable.id))
        .where(eq(topicsTable.qualificationVersionId, qualificationVersionId)),
    ]);

  return {
    components: componentRecords.records
      .map((component) => ({
        code: component.code,
        name: component.name,
        weightPercent: component.weightPercent,
        durationMinutes: component.durationMinutes,
        totalMarks: component.totalMarks,
        isExam: component.isExam,
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    topics: topicRecords.records.map(({ id: _id, ...topic }) => topic),
    edges: edges
      .map((edge) => ({
        fromKey: topicRecords.idToKey.get(edge.fromTopicId) ?? edge.fromTopicId,
        fromCode:
          topicRecords.records.find((topic) => topic.id === edge.fromTopicId)
            ?.code ?? edge.fromTopicId,
        toKey: topicRecords.idToKey.get(edge.toTopicId) ?? edge.toTopicId,
        toCode:
          topicRecords.records.find((topic) => topic.id === edge.toTopicId)
            ?.code ?? edge.toTopicId,
        type: edge.type,
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ),
    commandWords: commandWords
      .map((commandWord) => ({
        word: commandWord.word,
        definition: commandWord.definition,
        expectedDepth: commandWord.expectedDepth,
      }))
      .sort((left, right) => left.word.localeCompare(right.word)),
    questionTypes: questionTypes
      .map((questionType) => ({
        name: questionType.name,
        description: normalizeOptionalText(questionType.description),
        typicalMarks: questionType.typicalMarks ?? null,
        markSchemePattern: normalizeOptionalText(
          questionType.markSchemePattern
        ),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    misconceptionRules: misconceptionRules
      .map((rule) => ({
        topicCode: rule.topicCode,
        description: rule.description,
        triggerPatterns: [...rule.triggerPatterns],
        correctionGuidance: rule.correctionGuidance,
        severity: rule.severity,
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ),
    componentRecords,
    topicRecords,
  };
}

function resolveBiology8461CompatibleTopicCode(
  legacyCode: string,
  packageTopicCodes: Set<string>
): string | null {
  const explicitTarget = AQA_GCSE_BIOLOGY_8461_TOPIC_CODE_COMPATIBILITY[legacyCode];
  if (explicitTarget) {
    return explicitTarget;
  }

  return packageTopicCodes.has(legacyCode) ? legacyCode : null;
}

function resolveBiology8461CompatibleComponentCode(
  legacyCode: string,
  packageComponentCodes: Set<string>
): string | null {
  const explicitTarget =
    AQA_GCSE_BIOLOGY_8461_COMPONENT_CODE_COMPATIBILITY[legacyCode];
  if (explicitTarget) {
    return explicitTarget;
  }

  return packageComponentCodes.has(legacyCode) ? legacyCode : null;
}

function numericValue(value: string | number | null | undefined): number {
  if (value == null) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function pickMaxNumericValue<T extends string | number | null | undefined>(
  values: T[]
): T | null {
  let best: T | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const candidate = numericValue(value);
    if (candidate > bestValue) {
      best = value;
      bestValue = candidate;
    }
  }

  return best;
}

function pickLatestNonNullValue<T>(
  rows: Array<{ updatedAt?: Date | null; createdAt?: Date | null; value: T | null }>
): T | null {
  return [...rows]
    .sort((left, right) => {
      const leftTime =
        left.updatedAt?.getTime() ?? left.createdAt?.getTime() ?? 0;
      const rightTime =
        right.updatedAt?.getTime() ?? right.createdAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .find((row) => row.value != null)?.value ?? null;
}

function pickEarliestDate(
  values: Array<Date | null | undefined>
): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((value) => value.getTime())));
}

function pickLatestDate(
  values: Array<Date | null | undefined>
): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((value) => value.getTime())));
}

async function insertSeedComponentRecords(
  db: Database,
  qualificationVersionId: string,
  seedData: LegacyQualificationSeed
): Promise<ComponentRecordSet> {
  const records: NormalizedComponentRecord[] = [];

  for (const component of seedData.components) {
    const [inserted] = await db
      .insert(assessmentComponents)
      .values({
        qualificationVersionId,
        name: component.name,
        code: component.code,
        weightPercent: component.weightPercent,
        durationMinutes: component.durationMinutes ?? null,
        totalMarks: component.totalMarks ?? null,
        isExam: component.isExam,
      })
      .returning({ id: assessmentComponents.id });

    records.push({
      id: inserted.id,
      code: component.code,
      name: component.name,
      weightPercent: component.weightPercent,
      durationMinutes: component.durationMinutes ?? null,
      totalMarks: component.totalMarks ?? null,
      isExam: component.isExam,
    });
  }

  records.sort((left, right) => left.code.localeCompare(right.code));

  return {
    records,
    codeToId: new Map(
      records.flatMap((record) =>
        record.id ? [[record.code, record.id] as const] : []
      )
    ),
    idToCode: new Map(
      records.flatMap((record) =>
        record.id ? [[record.id, record.code] as const] : []
      )
    ),
  };
}

async function insertSeedTopicRecords(
  db: Database,
  qualificationVersionId: string,
  seedData: LegacyQualificationSeed
): Promise<TopicRecordSet> {
  const records: NormalizedTopicRecord[] = [];
  const keyToId = new Map<string, string>();
  const idToKey = new Map<string, string>();

  async function insertNodes(
    nodes: LegacyQualificationTopicSeed[],
    parentTopicId: string | null,
    parentPath: string | null,
    depth: number
  ): Promise<void> {
    for (const [index, node] of nodes.entries()) {
      const sortOrder = index + 1;
      const pathKey = parentPath ? `${parentPath}.${sortOrder}` : `${sortOrder}`;
      const topicKey = node.code ?? pathKey;
      const [inserted] = await db
        .insert(topicsTable)
        .values({
          qualificationVersionId,
          parentTopicId,
          name: node.name,
          code: node.code ?? null,
          depth,
          sortOrder,
          description: node.description ?? null,
          estimatedHours: node.estimatedHours?.toString() ?? null,
        })
        .returning({ id: topicsTable.id });

      records.push({
        id: inserted.id,
        key: topicKey,
        path: pathKey,
        parentPath,
        name: node.name,
        code: node.code ?? null,
        depth,
        sortOrder,
        description: normalizeOptionalText(node.description),
        estimatedHours: normalizeNumericString(node.estimatedHours),
      });
      keyToId.set(topicKey, inserted.id);
      idToKey.set(inserted.id, topicKey);

      if (node.children && node.children.length > 0) {
        await insertNodes(node.children, inserted.id, pathKey, depth + 1);
      }
    }
  }

  await insertNodes(seedData.topics, null, null, 0);
  return { records, keyToId, idToKey };
}

async function insertSeedTopicEdges(
  db: Database,
  topicRecords: TopicRecordSet,
  seedData: LegacyQualificationSeed
): Promise<number> {
  let edgesCreated = 0;

  for (const topic of flattenLegacyTopicSeedNodes(seedData.topics)) {
    if (!topic.code || !topic.edges) {
      continue;
    }

    const fromTopicId = topicRecords.keyToId.get(topic.code);
    if (!fromTopicId) {
      continue;
    }

    for (const edge of topic.edges) {
      const toTopicId = topicRecords.keyToId.get(edge.toCode);
      if (!toTopicId) {
        continue;
      }

      await db.insert(topicEdgesTable).values({
        fromTopicId,
        toTopicId,
        edgeType: edge.type,
      });
      edgesCreated += 1;
    }
  }

  return edgesCreated;
}

async function insertSeedCommandWords(
  db: Database,
  qualificationVersionId: string,
  seedData: LegacyQualificationSeed
): Promise<void> {
  for (const commandWord of seedData.commandWords) {
    await db.insert(commandWordsTable).values({
      qualificationVersionId,
      word: commandWord.word,
      definition: commandWord.definition,
      expectedDepth: commandWord.expectedDepth,
    });
  }
}

async function insertSeedQuestionTypes(
  db: Database,
  qualificationVersionId: string,
  seedData: LegacyQualificationSeed
): Promise<void> {
  for (const questionType of seedData.questionTypes) {
    await db.insert(questionTypesTable).values({
      qualificationVersionId,
      name: questionType.name,
      description: questionType.description ?? null,
      typicalMarks: questionType.typicalMarks ?? null,
      markSchemePattern: questionType.markSchemePattern ?? null,
    });
  }
}

async function insertSeedMisconceptionRules(
  db: Database,
  topicRecords: TopicRecordSet,
  seedData: LegacyQualificationSeed
): Promise<void> {
  for (const rule of seedData.misconceptionRules ?? []) {
    const topicId = topicRecords.keyToId.get(rule.topicCode);
    if (!topicId) {
      continue;
    }

    await db.insert(misconceptionRulesTable).values({
      topicId,
      description: rule.description,
      triggerPatterns: rule.triggerPatterns,
      correctionGuidance: rule.correctionGuidance,
      severity: rule.severity ?? 2,
    });
  }
}

function buildBiology8461TopicIdRemap(
  legacyTopicRecords: TopicRecordSet,
  packageTopicRecords: TopicRecordSet
): Map<string, string> {
  const packageTopicCodes = new Set(
    packageTopicRecords.records.flatMap((record) =>
      record.code ? [record.code] : []
    )
  );
  const remap = new Map<string, string>();

  for (const record of legacyTopicRecords.records) {
    if (!record.id) {
      continue;
    }

    if (!record.code) {
      throw new Error(
        `Legacy Biology topic ${record.name} has no code, so it cannot be remapped to the rebuilt package`
      );
    }

    const targetCode = resolveBiology8461CompatibleTopicCode(
      record.code,
      packageTopicCodes
    );
    if (!targetCode) {
      throw new Error(
        `Legacy Biology topic code ${record.code} has no rebuilt-package compatibility target`
      );
    }

    const targetId = packageTopicRecords.keyToId.get(targetCode);
    if (!targetId) {
      throw new Error(
        `Legacy Biology topic code ${record.code} maps to rebuilt topic code ${targetCode}, but that code was not inserted`
      );
    }

    remap.set(record.id, targetId);
  }

  return remap;
}

function buildBiology8461ComponentIdRemap(
  legacyComponentRecords: ComponentRecordSet,
  packageComponentRecords: ComponentRecordSet
): Map<string, string> {
  const packageComponentCodes = new Set(
    packageComponentRecords.records.map((record) => record.code)
  );
  const remap = new Map<string, string>();

  for (const record of legacyComponentRecords.records) {
    if (!record.id) {
      continue;
    }

    const targetCode = resolveBiology8461CompatibleComponentCode(
      record.code,
      packageComponentCodes
    );
    if (!targetCode) {
      throw new Error(
        `Legacy Biology component code ${record.code} has no rebuilt-package compatibility target`
      );
    }

    const targetId = packageComponentRecords.codeToId.get(targetCode);
    if (!targetId) {
      throw new Error(
        `Legacy Biology component code ${record.code} maps to rebuilt component code ${targetCode}, but that code was not inserted`
      );
    }

    remap.set(record.id, targetId);
  }

  return remap;
}

async function remapLearnerTopicStateRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select()
    .from(learnerTopicState)
    .where(inArray(learnerTopicState.topicId, legacyTopicIds));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const nextTopicId = topicIdRemap.get(row.topicId);
    if (!nextTopicId) {
      throw new Error(
        `learner_topic_state row ${row.id} references legacy topic ${row.topicId} with no rebuilt-topic remap`
      );
    }

    const key = `${row.learnerId}:${nextTopicId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const [key, groupRows] of groups.entries()) {
    const nextTopicId = key.split(":")[1]!;
    const [survivor, ...duplicates] = [...groupRows].sort((left, right) => {
      const leftTime = left.createdAt.getTime();
      const rightTime = right.createdAt.getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });

    await db
      .update(learnerTopicState)
      .set({
        topicId: nextTopicId,
        masteryLevel:
          pickMaxNumericValue(groupRows.map((row) => row.masteryLevel)) ??
          survivor.masteryLevel,
        confidence:
          pickMaxNumericValue(groupRows.map((row) => row.confidence)) ??
          survivor.confidence,
        easeFactor:
          pickMaxNumericValue(groupRows.map((row) => row.easeFactor)) ??
          survivor.easeFactor,
        intervalDays: Math.max(...groupRows.map((row) => row.intervalDays)),
        nextReviewAt: pickEarliestDate(
          groupRows.map((row) => row.nextReviewAt)
        ),
        lastReviewedAt: pickLatestDate(
          groupRows.map((row) => row.lastReviewedAt)
        ),
        reviewCount: groupRows.reduce(
          (total, row) => total + row.reviewCount,
          0
        ),
        streak: Math.max(...groupRows.map((row) => row.streak)),
        updatedAt:
          pickLatestDate(groupRows.map((row) => row.updatedAt)) ??
          survivor.updatedAt,
      })
      .where(eq(learnerTopicState.id, survivor.id));

    for (const duplicate of duplicates) {
      await db
        .delete(learnerTopicState)
        .where(eq(learnerTopicState.id, duplicate.id));
    }
  }
}

async function remapLearnerComponentStateRows(
  db: Database,
  componentIdRemap: Map<string, string>,
  legacyComponentIds: string[]
): Promise<void> {
  if (legacyComponentIds.length === 0) {
    return;
  }

  const rows = await db
    .select()
    .from(learnerComponentState)
    .where(inArray(learnerComponentState.componentId, legacyComponentIds));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const nextComponentId = componentIdRemap.get(row.componentId);
    if (!nextComponentId) {
      throw new Error(
        `learner_component_state row ${row.id} references legacy component ${row.componentId} with no rebuilt-component remap`
      );
    }

    const key = `${row.learnerId}:${nextComponentId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const [key, groupRows] of groups.entries()) {
    const nextComponentId = key.split(":")[1]!;
    const [survivor, ...duplicates] = [...groupRows].sort((left, right) => {
      const leftTime = left.createdAt.getTime();
      const rightTime = right.createdAt.getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });

    await db
      .update(learnerComponentState)
      .set({
        componentId: nextComponentId,
        predictedGrade:
          pickLatestNonNullValue(
            groupRows.map((row) => ({
              updatedAt: row.updatedAt,
              createdAt: row.createdAt,
              value: row.predictedGrade,
            }))
          ) ?? survivor.predictedGrade,
        predictedPercent:
          pickLatestNonNullValue(
            groupRows.map((row) => ({
              updatedAt: row.updatedAt,
              createdAt: row.createdAt,
              value: row.predictedPercent,
            }))
          ) ?? survivor.predictedPercent,
        confidence:
          pickMaxNumericValue(groupRows.map((row) => row.confidence)) ??
          survivor.confidence,
        lastAssessedAt: pickLatestDate(
          groupRows.map((row) => row.lastAssessedAt)
        ),
        updatedAt:
          pickLatestDate(groupRows.map((row) => row.updatedAt)) ??
          survivor.updatedAt,
      })
      .where(eq(learnerComponentState.id, survivor.id));

    for (const duplicate of duplicates) {
      await db
        .delete(learnerComponentState)
        .where(eq(learnerComponentState.id, duplicate.id));
    }
  }
}

async function remapMisconceptionEventRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[],
  legacyMisconceptionRuleIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({
      id: misconceptionEvents.id,
      topicId: misconceptionEvents.topicId,
      misconceptionRuleId: misconceptionEvents.misconceptionRuleId,
    })
    .from(misconceptionEvents)
    .where(inArray(misconceptionEvents.topicId, legacyTopicIds));

  for (const row of rows) {
    const nextTopicId = topicIdRemap.get(row.topicId);
    if (!nextTopicId) {
      throw new Error(
        `misconception_events row ${row.id} references legacy topic ${row.topicId} with no rebuilt-topic remap`
      );
    }

    await db
      .update(misconceptionEvents)
      .set({
        topicId: nextTopicId,
        misconceptionRuleId:
          row.misconceptionRuleId &&
          legacyMisconceptionRuleIds.includes(row.misconceptionRuleId)
            ? null
            : row.misconceptionRuleId,
      })
      .where(eq(misconceptionEvents.id, row.id));
  }
}

async function remapConfidenceEventRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: confidenceEvents.id, topicId: confidenceEvents.topicId })
    .from(confidenceEvents)
    .where(inArray(confidenceEvents.topicId, legacyTopicIds));

  for (const row of rows) {
    await db
      .update(confidenceEvents)
      .set({ topicId: topicIdRemap.get(row.topicId) ?? row.topicId })
      .where(eq(confidenceEvents.id, row.id));
  }
}

async function remapRetentionEventRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: retentionEvents.id, topicId: retentionEvents.topicId })
    .from(retentionEvents)
    .where(inArray(retentionEvents.topicId, legacyTopicIds));

  for (const row of rows) {
    await db
      .update(retentionEvents)
      .set({ topicId: topicIdRemap.get(row.topicId) ?? row.topicId })
      .where(eq(retentionEvents.id, row.id));
  }
}

async function remapStudyBlockRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: studyBlocks.id, topicId: studyBlocks.topicId })
    .from(studyBlocks)
    .where(inArray(studyBlocks.topicId, legacyTopicIds));

  for (const row of rows) {
    await db
      .update(studyBlocks)
      .set({ topicId: topicIdRemap.get(row.topicId) ?? row.topicId })
      .where(eq(studyBlocks.id, row.id));
  }
}

async function remapReviewQueueRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select()
    .from(reviewQueue)
    .where(inArray(reviewQueue.topicId, legacyTopicIds));

  const activeScheduledGroups = new Map<string, typeof rows>();

  for (const row of rows) {
    const nextTopicId = topicIdRemap.get(row.topicId);
    if (!nextTopicId) {
      throw new Error(
        `review_queue row ${row.id} references legacy topic ${row.topicId} with no rebuilt-topic remap`
      );
    }

    if (row.reason === "scheduled" && row.fulfilledAt === null) {
      const key = `${row.learnerId}:${nextTopicId}`;
      const group = activeScheduledGroups.get(key) ?? [];
      group.push(row);
      activeScheduledGroups.set(key, group);
      continue;
    }

    await db
      .update(reviewQueue)
      .set({ topicId: nextTopicId })
      .where(eq(reviewQueue.id, row.id));
  }

  for (const [key, groupRows] of activeScheduledGroups.entries()) {
    const nextTopicId = key.split(":")[1]!;
    const [survivor, ...duplicates] = [...groupRows].sort((left, right) => {
      if (left.dueAt.getTime() !== right.dueAt.getTime()) {
        return left.dueAt.getTime() - right.dueAt.getTime();
      }
      return left.id.localeCompare(right.id);
    });

    await db
      .update(reviewQueue)
      .set({
        topicId: nextTopicId,
        priority: Math.max(...groupRows.map((row) => row.priority)),
        dueAt:
          pickEarliestDate(groupRows.map((row) => row.dueAt)) ?? survivor.dueAt,
      })
      .where(eq(reviewQueue.id, survivor.id));

    for (const duplicate of duplicates) {
      await db.delete(reviewQueue).where(eq(reviewQueue.id, duplicate.id));
    }
  }
}

async function remapAssignmentRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: assignments.id, topicId: assignments.topicId })
    .from(assignments)
    .where(inArray(assignments.topicId, legacyTopicIds));

  for (const row of rows) {
    if (!row.topicId) {
      continue;
    }

    await db
      .update(assignments)
      .set({ topicId: topicIdRemap.get(row.topicId) ?? row.topicId })
      .where(eq(assignments.id, row.id));
  }
}

async function remapTeacherNoteRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  legacyTopicIds: string[]
): Promise<void> {
  if (legacyTopicIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: teacherNotes.id, topicId: teacherNotes.topicId })
    .from(teacherNotes)
    .where(inArray(teacherNotes.topicId, legacyTopicIds));

  for (const row of rows) {
    if (!row.topicId) {
      continue;
    }

    await db
      .update(teacherNotes)
      .set({ topicId: topicIdRemap.get(row.topicId) ?? row.topicId })
      .where(eq(teacherNotes.id, row.id));
  }
}

async function remapSourceMappingRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  componentIdRemap: Map<string, string>,
  legacyTopicIds: string[],
  legacyComponentIds: string[]
): Promise<void> {
  const conditions = [];
  if (legacyTopicIds.length > 0) {
    conditions.push(inArray(sourceMappingsTable.topicId, legacyTopicIds));
  }
  if (legacyComponentIds.length > 0) {
    conditions.push(
      inArray(sourceMappingsTable.componentId, legacyComponentIds)
    );
  }
  if (conditions.length === 0) {
    return;
  }

  const rows = await db
    .select({
      id: sourceMappingsTable.id,
      topicId: sourceMappingsTable.topicId,
      componentId: sourceMappingsTable.componentId,
    })
    .from(sourceMappingsTable)
    .where(conditions.length === 1 ? conditions[0]! : or(...conditions));

  for (const row of rows) {
    await db
      .update(sourceMappingsTable)
      .set({
        topicId:
          row.topicId && topicIdRemap.has(row.topicId)
            ? topicIdRemap.get(row.topicId) ?? row.topicId
            : row.topicId,
        componentId:
          row.componentId && componentIdRemap.has(row.componentId)
            ? componentIdRemap.get(row.componentId) ?? row.componentId
            : row.componentId,
      })
      .where(eq(sourceMappingsTable.id, row.id));
  }
}

async function remapBiology8461DependentRows(
  db: Database,
  topicIdRemap: Map<string, string>,
  componentIdRemap: Map<string, string>,
  legacyTopicIds: string[],
  legacyComponentIds: string[],
  legacyMisconceptionRuleIds: string[]
): Promise<void> {
  await remapLearnerTopicStateRows(db, topicIdRemap, legacyTopicIds);
  await remapLearnerComponentStateRows(
    db,
    componentIdRemap,
    legacyComponentIds
  );
  await remapMisconceptionEventRows(
    db,
    topicIdRemap,
    legacyTopicIds,
    legacyMisconceptionRuleIds
  );
  await remapConfidenceEventRows(db, topicIdRemap, legacyTopicIds);
  await remapRetentionEventRows(db, topicIdRemap, legacyTopicIds);
  await remapStudyBlockRows(db, topicIdRemap, legacyTopicIds);
  await remapReviewQueueRows(db, topicIdRemap, legacyTopicIds);
  await remapAssignmentRows(db, topicIdRemap, legacyTopicIds);
  await remapTeacherNoteRows(db, topicIdRemap, legacyTopicIds);
  await remapSourceMappingRows(
    db,
    topicIdRemap,
    componentIdRemap,
    legacyTopicIds,
    legacyComponentIds
  );
}

async function migrateLegacyBiology8461QualificationVersion(
  prepared: PreparedCurriculumSeed,
  qualificationVersionId: string,
  legacyCoreSnapshot: CoreSnapshot & {
    componentRecords: ComponentRecordSet;
    topicRecords: TopicRecordSet;
  },
  db: Database
): Promise<LoadQualificationResult> {
  try {
    await clearPackageRuntimeArtifacts(db, qualificationVersionId);

    const legacyTopicIds = legacyCoreSnapshot.topicRecords.records.flatMap((record) =>
      record.id ? [record.id] : []
    );
    const legacyComponentIds =
      legacyCoreSnapshot.componentRecords.records.flatMap((record) =>
        record.id ? [record.id] : []
      );
    const legacyMisconceptionRuleRows =
      legacyTopicIds.length === 0
        ? []
        : await db
            .select({
              id: misconceptionRulesTable.id,
            })
            .from(misconceptionRulesTable)
            .where(inArray(misconceptionRulesTable.topicId, legacyTopicIds));

    const packageComponentRecords = await insertSeedComponentRecords(
      db,
      qualificationVersionId,
      prepared.seedData
    );
    const packageTopicRecords = await insertSeedTopicRecords(
      db,
      qualificationVersionId,
      prepared.seedData
    );
    const topicIdRemap = buildBiology8461TopicIdRemap(
      legacyCoreSnapshot.topicRecords,
      packageTopicRecords
    );
    const componentIdRemap = buildBiology8461ComponentIdRemap(
      legacyCoreSnapshot.componentRecords,
      packageComponentRecords
    );

    await remapBiology8461DependentRows(
      db,
      topicIdRemap,
      componentIdRemap,
      legacyTopicIds,
      legacyComponentIds,
      legacyMisconceptionRuleRows.map((row) => row.id)
    );

    if (legacyTopicIds.length > 0) {
      await db
        .delete(misconceptionRulesTable)
        .where(inArray(misconceptionRulesTable.topicId, legacyTopicIds));
      await db
        .delete(topicEdgesTable)
        .where(
          or(
            inArray(topicEdgesTable.fromTopicId, legacyTopicIds),
            inArray(topicEdgesTable.toTopicId, legacyTopicIds)
          )
        );
    }

    await db
      .delete(commandWordsTable)
      .where(eq(commandWordsTable.qualificationVersionId, qualificationVersionId));
    await db
      .delete(questionTypesTable)
      .where(eq(questionTypesTable.qualificationVersionId, qualificationVersionId));

    if (legacyComponentIds.length > 0) {
      await db
        .delete(assessmentComponents)
        .where(inArray(assessmentComponents.id, legacyComponentIds));
    }

    if (legacyTopicIds.length > 0) {
      await db.delete(topicsTable).where(inArray(topicsTable.id, legacyTopicIds));
    }

    await db
      .update(qualificationVersions)
      .set({
        firstExamYear: prepared.seedData.firstExamYear,
        specUrl: prepared.seedData.specUrl ?? null,
        totalMarks:
          prepared.seedData.components.reduce(
            (sum, component) => sum + (component.totalMarks ?? 0),
            0
          ) || null,
      })
      .where(eq(qualificationVersions.id, qualificationVersionId));

    const edgesCreated = await insertSeedTopicEdges(
      db,
      packageTopicRecords,
      prepared.seedData
    );
    await insertSeedCommandWords(db, qualificationVersionId, prepared.seedData);
    await insertSeedQuestionTypes(db, qualificationVersionId, prepared.seedData);
    await insertSeedMisconceptionRules(db, packageTopicRecords, prepared.seedData);

    return {
      qualificationVersionId,
      topicsCreated: packageTopicRecords.records.length,
      componentsCreated: packageComponentRecords.records.length,
      edgesCreated,
    };
  } catch (error) {
    throw new Error(
      `Existing qualification version ${qualificationVersionId} matches the legacy AQA GCSE Biology 8461 seed, but the rebuilt package migration failed (${asErrorMessage(error)}).`
    );
  }
}

async function loadPreparedQualificationVersion(
  prepared: PreparedCurriculumSeed,
  db: Database
): Promise<LoadQualificationResult> {
  const existingQualificationVersionId = await findExistingQualificationVersionId(
    db,
    prepared.seedData
  );
  if (!existingQualificationVersionId) {
    return loadQualification(db, prepared.seedData);
  }

  const actual = await loadActualCoreSnapshot(db, existingQualificationVersionId);
  if (!hasCoreSnapshotData(actual)) {
    return loadQualification(db, prepared.seedData);
  }

  if (prepared.normalizedFrom !== "package") {
    await assertLegacyReseedWillNotDeletePackageRuntimeArtifacts(
      existingQualificationVersionId,
      db
    );
  }

  const expected = buildExpectedCoreSnapshot(prepared.seedData);
  const mismatch = getCoreSnapshotMismatch(actual, expected);
  if (!mismatch) {
    return loadQualification(db, prepared.seedData);
  }

  if (
    prepared.normalizedFrom === "package" &&
    prepared.packageId === AQA_GCSE_BIOLOGY_8461_PACKAGE_ID &&
    getCoreSnapshotMismatch(actual, AQA_GCSE_BIOLOGY_8461_LEGACY_SNAPSHOT) === null
  ) {
    return migrateLegacyBiology8461QualificationVersion(
      prepared,
      existingQualificationVersionId,
      actual,
      db
    );
  }

  throw new Error(
    `Existing qualification version ${existingQualificationVersionId} does not match the incoming ${prepared.normalizedFrom} curriculum data (${mismatch}). The current seed path cannot replace an incompatible existing version in place; migrate or clear the existing qualification version before seeding this input.`
  );
}

function buildPackageTopicBindings(
  curriculumPackage: CurriculumPackage,
  topicRecords: TopicRecordSet
): Map<string, { dbId: string; topicKey: string }> {
  const bindings = new Map<string, { dbId: string; topicKey: string }>();
  for (const topic of buildPackageTopicRecords(curriculumPackage)) {
    const dbId = topicRecords.keyToId.get(topic.key);
    if (!dbId) {
      throw new Error(
        `Seeded topic tree did not contain expected topic ${topic.key} from package topic ${topic.contractId}`
      );
    }
    bindings.set(topic.contractId, { dbId, topicKey: topic.key });
  }
  return bindings;
}

function buildPackageComponentBindings(
  curriculumPackage: CurriculumPackage,
  componentRecords: ComponentRecordSet
): Map<string, { dbId: string; componentCode: string }> {
  const bindings = new Map<string, { dbId: string; componentCode: string }>();

  for (const component of curriculumPackage.components) {
    const dbId = componentRecords.codeToId.get(component.code);
    if (!dbId) {
      throw new Error(
        `Seeded component list did not contain expected component code ${component.code} from package component ${component.id}`
      );
    }
    bindings.set(component.id, { dbId, componentCode: component.code });
  }

  return bindings;
}

function buildExpectedTaskRuleRecords(
  curriculumPackage: CurriculumPackage,
  topicBindings: Map<string, { dbId: string; topicKey: string }>
): NormalizedTaskRuleRecord[] {
  const rulesByTopicId = new Map<string, CurriculumTaskRule[]>();

  for (const rule of curriculumPackage.taskRules) {
    if (!rule.topicId) {
      continue;
    }
    const rules = rulesByTopicId.get(rule.topicId) ?? [];
    rules.push(rule);
    rulesByTopicId.set(rule.topicId, rules);
  }

  const expected: NormalizedTaskRuleRecord[] = [];
  for (const [contractTopicId, rules] of rulesByTopicId.entries()) {
    const binding = topicBindings.get(contractTopicId);
    if (!binding) {
      throw new Error(
        `Cannot seed task rules because topic ${contractTopicId} could not be matched to seeded data`
      );
    }

    rules.forEach((rule, index) => {
      const difficultyMin = Math.floor((index * 5) / rules.length) + 1;
      const difficultyMax = Math.max(
        difficultyMin,
        Math.floor(((index + 1) * 5) / rules.length)
      );
      const blockType = mapTaskTypeToBlockType(rule.taskType);
      expected.push({
        topicId: binding.dbId,
        topicKey: binding.topicKey,
        blockType,
        difficultyMin,
        difficultyMax,
        timeEstimateMinutes: estimateBlockDuration(blockType),
        instructions: buildTaskRuleInstructions(rule),
      });
    });
  }

  return expected.sort((left, right) =>
    JSON.stringify({
      ...left,
      topicId: undefined,
    }).localeCompare(
      JSON.stringify({
        ...right,
        topicId: undefined,
      })
    )
  );
}

function buildExpectedSyntheticSourceMappingRecords(
  curriculumPackage: CurriculumPackage,
  qualificationVersionId: string,
  topicBindings: Map<string, { dbId: string; topicKey: string }>,
  componentBindings: Map<string, { dbId: string; componentCode: string }>
): NormalizedSyntheticSourceMappingRecord[] {
  const sourceById = new Map(
    curriculumPackage.provenance.sources.map((source) => [source.id, source])
  );
  const chunkIndexBySourceId = new Map<string, number>();

  const expected = curriculumPackage.sourceMappings.map((mapping) => {
    const source = sourceById.get(mapping.sourceId);
    if (!source) {
      throw new Error(
        `Cannot seed source mapping ${mapping.id} because source ${mapping.sourceId} was not found`
      );
    }

    const topicBinding = mapping.topicId
      ? topicBindings.get(mapping.topicId)
      : null;
    if (mapping.topicId && !topicBinding) {
      throw new Error(
        `Cannot seed source mapping ${mapping.id} because topic ${mapping.topicId} could not be matched to seeded data`
      );
    }
    const componentBinding = mapping.componentId
      ? componentBindings.get(mapping.componentId)
      : null;
    if (mapping.componentId && !componentBinding) {
      throw new Error(
        `Cannot seed source mapping ${mapping.id} because component ${mapping.componentId} could not be matched to seeded data`
      );
    }

    const chunkIndex = chunkIndexBySourceId.get(mapping.sourceId) ?? 0;
    chunkIndexBySourceId.set(mapping.sourceId, chunkIndex + 1);

    return {
      topicId: topicBinding?.dbId ?? null,
      topicKey: topicBinding?.topicKey ?? null,
      componentId: componentBinding?.dbId ?? null,
      componentCode: componentBinding?.componentCode ?? null,
      filename: curriculumSupportFilename(mapping.sourceId),
      storagePath: curriculumSupportStoragePath(
        qualificationVersionId,
        mapping.sourceId
      ),
      chunkIndex,
      content: buildSyntheticChunkContent(
        source.title,
        mapping.locator,
        mapping.excerptHint
      ),
      confidence: normalizeConfidenceValue(mapping.confidence),
      mappingMethod: "manual" as const,
    };
  });

  return expected.sort((left, right) =>
    JSON.stringify({
      ...left,
      topicId: undefined,
      componentId: undefined,
    }).localeCompare(
      JSON.stringify({
        ...right,
        topicId: undefined,
        componentId: undefined,
      })
    )
  );
}

async function loadActualTaskRuleRecords(
  db: Database,
  qualificationVersionId: string,
  topicRecords: TopicRecordSet
): Promise<NormalizedTaskRuleRecord[]> {
  const rows = await db
    .select({
      topicId: taskRulesTable.topicId,
      blockType: taskRulesTable.blockType,
      difficultyMin: taskRulesTable.difficultyMin,
      difficultyMax: taskRulesTable.difficultyMax,
      timeEstimateMinutes: taskRulesTable.timeEstimateMinutes,
      instructions: taskRulesTable.instructions,
    })
    .from(taskRulesTable)
    .innerJoin(topicsTable, eq(taskRulesTable.topicId, topicsTable.id))
    .where(eq(topicsTable.qualificationVersionId, qualificationVersionId));

  return rows
    .map((row) => ({
      topicId: row.topicId,
      topicKey: topicRecords.idToKey.get(row.topicId) ?? row.topicId,
      blockType: row.blockType as BlockType,
      difficultyMin: row.difficultyMin,
      difficultyMax: row.difficultyMax,
      timeEstimateMinutes: row.timeEstimateMinutes,
      instructions: normalizeOptionalText(row.instructions),
    }))
    .sort((left, right) =>
      JSON.stringify({
        ...left,
        topicId: undefined,
      }).localeCompare(
        JSON.stringify({
          ...right,
          topicId: undefined,
        })
      )
    );
}

async function loadActualSyntheticSourceMappingRecords(
  db: Database,
  collectionId: string,
  topicRecords: TopicRecordSet,
  componentRecords: ComponentRecordSet
): Promise<NormalizedSyntheticSourceMappingRecord[]> {
  const rows = await db
    .select({
      topicId: sourceMappingsTable.topicId,
      componentId: sourceMappingsTable.componentId,
      filename: sourceFiles.filename,
      storagePath: sourceFiles.storagePath,
      chunkIndex: sourceChunks.chunkIndex,
      content: sourceChunks.content,
      confidence: sourceMappingsTable.confidence,
      mappingMethod: sourceMappingsTable.mappingMethod,
    })
    .from(sourceMappingsTable)
    .innerJoin(sourceChunks, eq(sourceMappingsTable.chunkId, sourceChunks.id))
    .innerJoin(sourceFiles, eq(sourceChunks.fileId, sourceFiles.id))
    .where(eq(sourceFiles.collectionId, collectionId));

  return rows
    .map((row) => ({
      topicId: row.topicId ?? null,
      topicKey:
        row.topicId && topicRecords.idToKey.has(row.topicId)
          ? topicRecords.idToKey.get(row.topicId) ?? row.topicId
          : row.topicId ?? null,
      componentId: row.componentId ?? null,
      componentCode:
        row.componentId && componentRecords.idToCode.has(row.componentId)
          ? componentRecords.idToCode.get(row.componentId) ?? row.componentId
          : row.componentId ?? null,
      filename: row.filename,
      storagePath: row.storagePath,
      chunkIndex: row.chunkIndex,
      content: row.content,
      confidence: Number(row.confidence).toFixed(2),
      mappingMethod: row.mappingMethod,
    }))
    .sort((left, right) =>
      JSON.stringify({
        ...left,
        topicId: undefined,
        componentId: undefined,
      }).localeCompare(
        JSON.stringify({
          ...right,
          topicId: undefined,
          componentId: undefined,
        })
      )
    );
}

async function ensureSystemCurriculumUser(db: Database): Promise<string> {
  const [inserted] = await db
    .insert(users)
    .values(SYSTEM_CURRICULUM_USER)
    .onConflictDoNothing({ target: users.firebaseUid })
    .returning({ id: users.id });

  if (inserted) {
    return inserted.id;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, SYSTEM_CURRICULUM_USER.firebaseUid))
    .limit(1);

  if (!existing) {
    throw new Error("Unable to resolve synthetic curriculum seed user");
  }

  return existing.id;
}

async function ensureSyntheticSourceCollection(
  db: Database,
  qualificationVersionId: string
): Promise<string> {
  const existingId = await findSyntheticSourceCollectionId(
    db,
    qualificationVersionId
  );
  if (existingId) {
    return existingId;
  }

  const [collection] = await db
    .insert(sourceCollections)
    .values({
      scope: "system",
      name: curriculumSupportCollectionName(qualificationVersionId),
      description: `Synthetic curriculum source mapping hints for ${qualificationVersionId}`,
    })
    .returning({ id: sourceCollections.id });

  return collection.id;
}

async function findSyntheticSourceCollectionId(
  db: Database,
  qualificationVersionId: string
): Promise<string | null> {
  const name = curriculumSupportCollectionName(qualificationVersionId);
  const existing = await db
    .select({ id: sourceCollections.id })
    .from(sourceCollections)
    .where(
      and(
        eq(sourceCollections.scope, "system"),
        eq(sourceCollections.name, name)
      )
    );

  if (existing.length > 1) {
    throw new Error(
      `Found multiple synthetic curriculum source collections for qualification version ${qualificationVersionId}`
    );
  }

  return existing[0]?.id ?? null;
}

async function loadSyntheticSourceCollectionState(
  db: Database,
  qualificationVersionId: string,
  topicRecords: TopicRecordSet,
  componentRecords: ComponentRecordSet
): Promise<SyntheticSourceCollectionState> {
  const collectionId = await findSyntheticSourceCollectionId(
    db,
    qualificationVersionId
  );
  if (!collectionId) {
    return {
      collectionId: null,
      fileCount: 0,
      chunkCount: 0,
      mappings: [],
    };
  }

  const [fileRows, chunkRows, mappings] = await Promise.all([
    db
      .select({ id: sourceFiles.id })
      .from(sourceFiles)
      .where(eq(sourceFiles.collectionId, collectionId)),
    db
      .select({ id: sourceChunks.id })
      .from(sourceChunks)
      .innerJoin(sourceFiles, eq(sourceChunks.fileId, sourceFiles.id))
      .where(eq(sourceFiles.collectionId, collectionId)),
    loadActualSyntheticSourceMappingRecords(
      db,
      collectionId,
      topicRecords,
      componentRecords
    ),
  ]);

  return {
    collectionId,
    fileCount: fileRows.length,
    chunkCount: chunkRows.length,
    mappings,
  };
}

async function insertTaskRuleRecords(
  db: Database,
  expectedTaskRules: NormalizedTaskRuleRecord[]
): Promise<void> {
  if (expectedTaskRules.length === 0) {
    return;
  }

  await db.insert(taskRulesTable).values(
    expectedTaskRules.map((rule) => ({
      topicId: rule.topicId,
      blockType: rule.blockType,
      difficultyMin: rule.difficultyMin,
      difficultyMax: rule.difficultyMax,
      timeEstimateMinutes: rule.timeEstimateMinutes,
      instructions: rule.instructions,
    }))
  );
}

async function replaceTaskRuleRecords(
  db: Database,
  topicIds: string[],
  expectedTaskRules: NormalizedTaskRuleRecord[]
): Promise<void> {
  if (topicIds.length > 0) {
    await db
      .delete(taskRulesTable)
      .where(inArray(taskRulesTable.topicId, topicIds));
  }

  await insertTaskRuleRecords(db, expectedTaskRules);
}

async function clearSyntheticSourceCollectionContents(
  db: Database,
  collectionId: string
): Promise<void> {
  const fileRows = await db
    .select({ id: sourceFiles.id })
    .from(sourceFiles)
    .where(eq(sourceFiles.collectionId, collectionId));
  const fileIds = fileRows.map((row) => row.id);

  if (fileIds.length === 0) {
    return;
  }

  const chunkRows = await db
    .select({ id: sourceChunks.id })
    .from(sourceChunks)
    .where(inArray(sourceChunks.fileId, fileIds));
  const chunkIds = chunkRows.map((row) => row.id);

  if (chunkIds.length > 0) {
    await db
      .delete(sourceMappingsTable)
      .where(inArray(sourceMappingsTable.chunkId, chunkIds));
    await db
      .delete(chunkEmbeddings)
      .where(inArray(chunkEmbeddings.chunkId, chunkIds));
    await db.delete(sourceChunks).where(inArray(sourceChunks.id, chunkIds));
  }

  await db.delete(sourceFiles).where(inArray(sourceFiles.id, fileIds));
}

async function clearPackageRuntimeArtifacts(
  db: Database,
  qualificationVersionId: string
): Promise<void> {
  const topicRows = await db
    .select({ id: topicsTable.id })
    .from(topicsTable)
    .where(eq(topicsTable.qualificationVersionId, qualificationVersionId));
  const topicIds = topicRows.map((row) => row.id);

  if (topicIds.length > 0) {
    await db
      .delete(taskRulesTable)
      .where(inArray(taskRulesTable.topicId, topicIds));
  }

  const collectionId = await findSyntheticSourceCollectionId(
    db,
    qualificationVersionId
  );
  if (!collectionId) {
    return;
  }

  await clearSyntheticSourceCollectionContents(db, collectionId);
  await db.delete(sourceCollections).where(eq(sourceCollections.id, collectionId));
}

async function assertLegacyReseedWillNotDeletePackageRuntimeArtifacts(
  qualificationVersionId: string,
  db: Database
): Promise<void> {
  const actualCoreSnapshot = await loadActualCoreSnapshot(db, qualificationVersionId);
  const actualTaskRules = await loadActualTaskRuleRecords(
    db,
    qualificationVersionId,
    actualCoreSnapshot.topicRecords
  );
  const sourceCollectionState = await loadSyntheticSourceCollectionState(
    db,
    qualificationVersionId,
    actualCoreSnapshot.topicRecords,
    actualCoreSnapshot.componentRecords
  );

  if (
    actualTaskRules.length > 0 ||
    sourceCollectionState.collectionId ||
    sourceCollectionState.fileCount > 0 ||
    sourceCollectionState.chunkCount > 0 ||
    sourceCollectionState.mappings.length > 0
  ) {
    throw new Error(
      `Cannot seed legacy input over qualification version ${qualificationVersionId} because package-only runtime artifacts already exist and a legacy reseed would delete them. Reseed the rebuilt package instead.`
    );
  }
}

async function insertSyntheticSourceMappings(
  db: Database,
  collectionId: string,
  expectedSourceMappings: NormalizedSyntheticSourceMappingRecord[]
): Promise<void> {
  if (expectedSourceMappings.length === 0) {
    return;
  }

  const syntheticUserId = await ensureSystemCurriculumUser(db);
  const mappingsByFile = new Map<string, NormalizedSyntheticSourceMappingRecord[]>();
  for (const mapping of expectedSourceMappings) {
    const group = mappingsByFile.get(mapping.filename) ?? [];
    group.push(mapping);
    mappingsByFile.set(mapping.filename, group);
  }

  for (const [filename, rows] of mappingsByFile.entries()) {
    const storagePath = rows[0].storagePath;
    const sizeBytes = rows.reduce(
      (total, row) => total + Buffer.byteLength(row.content, "utf8"),
      0
    );

    const [file] = await db
      .insert(sourceFiles)
      .values({
        collectionId,
        uploadedByUserId: syntheticUserId,
        filename,
        mimeType: "text/plain",
        storagePath,
        sizeBytes,
        status: "ready",
      })
      .returning({ id: sourceFiles.id });

    for (const row of rows.sort((left, right) => left.chunkIndex - right.chunkIndex)) {
      const [chunk] = await db
        .insert(sourceChunks)
        .values({
          fileId: file.id,
          content: row.content,
          chunkIndex: row.chunkIndex,
          tokenCount: countApproximateTokens(row.content),
        })
        .returning({ id: sourceChunks.id });

      await db.insert(sourceMappingsTable).values({
        chunkId: chunk.id,
        topicId: row.topicId,
        componentId: row.componentId,
        confidence: row.confidence,
        mappingMethod: row.mappingMethod,
      });
    }
  }
}

async function ensurePackageRuntimeArtifacts(
  prepared: PreparedCurriculumSeed,
  qualificationVersionId: string,
  db: Database
): Promise<void> {
  if (prepared.normalizedFrom !== "package") {
    return;
  }

  const actualCoreSnapshot = await loadActualCoreSnapshot(db, qualificationVersionId);
  const topicBindings = buildPackageTopicBindings(
    prepared.curriculumPackage,
    actualCoreSnapshot.topicRecords
  );
  const componentBindings = buildPackageComponentBindings(
    prepared.curriculumPackage,
    actualCoreSnapshot.componentRecords
  );

  const expectedTaskRules = buildExpectedTaskRuleRecords(
    prepared.curriculumPackage,
    topicBindings
  );
  const actualTaskRules = await loadActualTaskRuleRecords(
    db,
    qualificationVersionId,
    actualCoreSnapshot.topicRecords
  );
  const comparableActualTaskRules = actualTaskRules.map(
    ({ topicId: _topicId, ...rule }) => rule
  );
  const comparableExpectedTaskRules = expectedTaskRules.map(
    ({ topicId: _topicId, ...rule }) => rule
  );

  if (
    !collectionsEqual(comparableActualTaskRules, comparableExpectedTaskRules)
  ) {
    if (comparableActualTaskRules.length === 0) {
      await insertTaskRuleRecords(db, expectedTaskRules);
    } else if (
      isSubsetCollection(comparableActualTaskRules, comparableExpectedTaskRules)
    ) {
      await replaceTaskRuleRecords(
        db,
        actualCoreSnapshot.topicRecords.records.flatMap((topic) =>
          topic.id ? [topic.id] : []
        ),
        expectedTaskRules
      );
    } else {
      compareCollections(
        "task rules",
        comparableActualTaskRules,
        comparableExpectedTaskRules
      );
    }
  }

  const expectedSourceMappings = buildExpectedSyntheticSourceMappingRecords(
    prepared.curriculumPackage,
    qualificationVersionId,
    topicBindings,
    componentBindings
  );
  if (expectedSourceMappings.length === 0) {
    return;
  }

  const sourceCollectionState = await loadSyntheticSourceCollectionState(
    db,
    qualificationVersionId,
    actualCoreSnapshot.topicRecords,
    actualCoreSnapshot.componentRecords
  );
  const comparableActualSourceMappings = sourceCollectionState.mappings.map(
    ({ topicId: _topicId, componentId: _componentId, ...mapping }) => mapping
  );
  const comparableExpectedSourceMappings = expectedSourceMappings.map(
    ({ topicId: _topicId, componentId: _componentId, ...mapping }) => mapping
  );
  const expectedSourceFileCount = new Set(
    expectedSourceMappings.map((mapping) => mapping.filename)
  ).size;

  if (
    !collectionsEqual(
      comparableActualSourceMappings,
      comparableExpectedSourceMappings
    ) ||
    sourceCollectionState.fileCount !== expectedSourceFileCount ||
    sourceCollectionState.chunkCount !== expectedSourceMappings.length
  ) {
    if (
      comparableActualSourceMappings.length === 0 &&
      sourceCollectionState.fileCount === 0 &&
      sourceCollectionState.chunkCount === 0
    ) {
      const collectionId = await ensureSyntheticSourceCollection(
        db,
        qualificationVersionId
      );
      await insertSyntheticSourceMappings(db, collectionId, expectedSourceMappings);
    } else if (
      isSubsetCollection(
        comparableActualSourceMappings,
        comparableExpectedSourceMappings
      )
    ) {
      const collectionId =
        sourceCollectionState.collectionId ??
        (await ensureSyntheticSourceCollection(db, qualificationVersionId));
      await clearSyntheticSourceCollectionContents(db, collectionId);
      await insertSyntheticSourceMappings(db, collectionId, expectedSourceMappings);
    } else {
      compareCollections(
        "synthetic source mappings",
        comparableActualSourceMappings,
        comparableExpectedSourceMappings
      );
    }
  }
}

async function assertPreparedCurriculumMatchesDb(
  prepared: PreparedCurriculumSeed,
  qualificationVersionId: string,
  db: Database
): Promise<void> {
  const expected = buildExpectedCoreSnapshot(prepared.seedData);
  const actual = await loadActualCoreSnapshot(db, qualificationVersionId);

  compareCollections("components", actual.components, expected.components);
  compareCollections("topics", actual.topics, expected.topics);
  compareCollections("edges", actual.edges, expected.edges);
  compareCollections("command words", actual.commandWords, expected.commandWords);
  compareCollections("question types", actual.questionTypes, expected.questionTypes);
  compareCollections(
    "misconception rules",
    actual.misconceptionRules,
    expected.misconceptionRules
  );

  if (prepared.normalizedFrom !== "package") {
    const actualTaskRules = await loadActualTaskRuleRecords(
      db,
      qualificationVersionId,
      actual.topicRecords
    );
    if (actualTaskRules.length > 0) {
      throw new Error(
        `Legacy seed input left ${actualTaskRules.length} package-only task rule(s) attached to qualification version ${qualificationVersionId}`
      );
    }

    const sourceCollectionState = await loadSyntheticSourceCollectionState(
      db,
      qualificationVersionId,
      actual.topicRecords,
      actual.componentRecords
    );
    if (
      sourceCollectionState.collectionId ||
      sourceCollectionState.fileCount > 0 ||
      sourceCollectionState.chunkCount > 0 ||
      sourceCollectionState.mappings.length > 0
    ) {
      throw new Error(
        `Legacy seed input left package-only synthetic source artifacts attached to qualification version ${qualificationVersionId}`
      );
    }

    return;
  }

  const topicBindings = buildPackageTopicBindings(
    prepared.curriculumPackage,
    actual.topicRecords
  );
  const componentBindings = buildPackageComponentBindings(
    prepared.curriculumPackage,
    actual.componentRecords
  );
  const expectedTaskRules = buildExpectedTaskRuleRecords(
    prepared.curriculumPackage,
    topicBindings
  );
  const actualTaskRules = await loadActualTaskRuleRecords(
    db,
    qualificationVersionId,
    actual.topicRecords
  );
  compareCollections(
    "task rules",
    actualTaskRules.map(({ topicId: _topicId, ...rule }) => rule),
    expectedTaskRules.map(({ topicId: _topicId, ...rule }) => rule)
  );

  const expectedSourceMappings = buildExpectedSyntheticSourceMappingRecords(
    prepared.curriculumPackage,
    qualificationVersionId,
    topicBindings,
    componentBindings
  );

  if (expectedSourceMappings.length === 0) {
    return;
  }

  const collectionId = await ensureSyntheticSourceCollection(
    db,
    qualificationVersionId
  );
  const actualSourceMappings = await loadActualSyntheticSourceMappingRecords(
    db,
    collectionId,
    actual.topicRecords,
    actual.componentRecords
  );
  compareCollections(
    "synthetic source mappings",
    actualSourceMappings.map(
      ({ topicId: _topicId, componentId: _componentId, ...mapping }) => mapping
    ),
    expectedSourceMappings.map(
      ({ topicId: _topicId, componentId: _componentId, ...mapping }) => mapping
    )
  );
}

export async function seedPreparedCurriculum(
  prepared: PreparedCurriculumSeed,
  options: { db?: Database } = {}
): Promise<CurriculumSeedResult> {
  const targetDb = await resolveCurriculumDb(options.db);
  return targetDb.transaction(async (tx) => {
    const transactionalDb = tx as unknown as Database;
    const loadResult = await loadPreparedQualificationVersion(
      prepared,
      transactionalDb
    );

    if (prepared.normalizedFrom === "package") {
      await ensurePackageRuntimeArtifacts(
        prepared,
        loadResult.qualificationVersionId,
        transactionalDb
      );
    } else {
      await assertLegacyReseedWillNotDeletePackageRuntimeArtifacts(
        loadResult.qualificationVersionId,
        transactionalDb
      );
    }
    await assertPreparedCurriculumMatchesDb(
      prepared,
      loadResult.qualificationVersionId,
      transactionalDb
    );

    return {
      ...prepared,
      ...loadResult,
    };
  });
}

export async function seedCurriculumInput(
  input: unknown,
  options: { db?: Database } = {}
): Promise<CurriculumSeedResult> {
  const prepared = prepareCurriculumSeedInput(input);
  return seedPreparedCurriculum(prepared, options);
}

export async function seedCurriculumFile(
  filePath: string,
  options: { db?: Database } = {}
): Promise<CurriculumSeedResult> {
  const input = await loadJsonFile(filePath);
  return seedCurriculumInput(input, options);
}

export function flattenLegacyTopicSeedNodes(
  nodes: LegacyQualificationTopicSeed[]
): LegacyQualificationTopicSeed[] {
  const flattened: LegacyQualificationTopicSeed[] = [];

  for (const node of nodes) {
    flattened.push(node);
    if (node.children && node.children.length > 0) {
      flattened.push(...flattenLegacyTopicSeedNodes(node.children));
    }
  }

  return flattened;
}

export function getLegacySeedStats(seedData: LegacyQualificationSeed): LegacySeedStats {
  const flattenedTopics = flattenLegacyTopicSeedNodes(seedData.topics);
  const knownCodes = new Set(
    flattenedTopics
      .map((topic) => topic.code)
      .filter((code): code is string => Boolean(code))
  );

  let edges = 0;
  for (const topic of flattenedTopics) {
    if (!topic.code || !topic.edges) {
      continue;
    }

    for (const edge of topic.edges) {
      if (knownCodes.has(edge.toCode)) {
        edges++;
      }
    }
  }

  const misconceptionRules =
    seedData.misconceptionRules?.filter((rule) => knownCodes.has(rule.topicCode))
      .length ?? 0;

  return {
    rootTopics: seedData.topics.length,
    topics: flattenedTopics.length,
    edges,
    commandWords: seedData.commandWords.length,
    questionTypes: seedData.questionTypes.length,
    misconceptionRules,
  };
}

export async function loadSyntheticSourceMappingTopicIds(
  db: Database,
  qualificationVersionId: string
): Promise<string[]> {
  const collectionId = await findSyntheticSourceCollectionId(
    db,
    qualificationVersionId
  );
  if (!collectionId) {
    return [];
  }

  const rows = await db
    .select({ topicId: sourceMappingsTable.topicId })
    .from(sourceMappingsTable)
    .innerJoin(sourceChunks, eq(sourceMappingsTable.chunkId, sourceChunks.id))
    .innerJoin(sourceFiles, eq(sourceChunks.fileId, sourceFiles.id))
    .where(eq(sourceFiles.collectionId, collectionId));

  return [...new Set(rows.flatMap((row) => (row.topicId ? [row.topicId] : [])))];
}

export function formatSeedResult(result: CurriculumSeedResult): string {
  const lines = [
    "Seed: PASS",
    `Package: ${result.packageId}`,
    `Lifecycle: ${result.lifecycle}`,
    `Input: ${result.normalizedFrom}`,
    `Qualification version: ${result.qualificationVersionId}`,
    `Created: components=${result.componentsCreated} topics=${result.topicsCreated} edges=${result.edgesCreated}`,
  ];

  if (result.validationReport.warnings.length > 0) {
    lines.push(`Validation warnings: ${result.validationReport.warnings.length}`);
  }

  if (result.adapterNotes.length > 0) {
    lines.push("Notes:");
    for (const note of result.adapterNotes) {
      lines.push(`- ${note.message}`);
    }
  }

  return lines.join("\n");
}
