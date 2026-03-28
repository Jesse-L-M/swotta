import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadQualification, type LoadQualificationResult } from "@/engine/curriculum";
import type { Database } from "@/lib/db";
import type { LegacyQualificationSeed, LegacyQualificationTopicSeed } from "./legacy";
import { legacyQualificationSeedSchema } from "./legacy";
import type {
  CurriculumPackage,
  CurriculumPackageLifecycle,
  CurriculumTopic,
} from "./schema";
import {
  formatValidationReport,
  validateCurriculumPackage,
  type CurriculumValidationReport,
} from "./validation";

type SeedInputKind = "package" | "legacy_seed";

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

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortTopics(left: CurriculumTopic, right: CurriculumTopic): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.name.localeCompare(right.name);
}

function createAdapterNotes(
  curriculumPackage: CurriculumPackage
): CurriculumSeedNote[] {
  const notes: CurriculumSeedNote[] = [];

  if (curriculumPackage.taskRules.length > 0) {
    notes.push({
      code: "task_rules_not_seeded",
      message: `${curriculumPackage.taskRules.length} task rule(s) validated but were not persisted because the legacy seed engine has no clean adapter for difficulty/time fields yet.`,
    });
  }

  if (curriculumPackage.sourceMappings.length > 0) {
    notes.push({
      code: "source_mappings_not_seeded",
      message: `${curriculumPackage.sourceMappings.length} source mapping hint(s) validated but were not persisted because runtime source mappings require chunk-level ingestion data.`,
    });
  }

  const annotationCount =
    (curriculumPackage.annotations?.markSchemePatterns.length ?? 0) +
    (curriculumPackage.annotations?.examTechniquePatterns.length ?? 0);
  if (annotationCount > 0) {
    notes.push({
      code: "annotations_not_seeded",
      message: `${annotationCount} annotation record(s) validated but were not persisted because the current curriculum seed path does not store review annotations.`,
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
      .filter((topic): topic is CurriculumTopic & { code: string } => Boolean(topic.code))
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

export async function seedPreparedCurriculum(
  prepared: PreparedCurriculumSeed,
  options: { db?: Database } = {}
): Promise<CurriculumSeedResult> {
  const targetDb = await resolveCurriculumDb(options.db);
  const loadResult = await loadQualification(targetDb, prepared.seedData);

  return {
    ...prepared,
    ...loadResult,
  };
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
