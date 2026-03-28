import type {
  CurriculumAssessmentComponent,
  CurriculumCommandWord,
  CurriculumConfidence,
  CurriculumMisconceptionRule,
  CurriculumPackage,
  CurriculumPackageMetadata,
  CurriculumQualification,
  CurriculumQuestionType,
  CurriculumSource,
  CurriculumSourceMappingHint,
  CurriculumTaskRule,
  CurriculumTopic,
  CurriculumTopicEdge,
} from "./schema";
import type {
  CurriculumDraftCitation,
  CurriculumExtractedDraft,
} from "./extract";
import { curriculumExtractedDraftSchema } from "./extract";
import type { CurriculumValidationReport } from "./validation";
import { validateCurriculumPackage } from "./validation";

const SOURCE_KIND_PRIORITY: Record<CurriculumSource["kind"], number> = {
  specification: 0,
  mark_scheme: 1,
  examiner_report: 1,
  support_material: 2,
  teacher_guidance: 2,
  past_paper: 3,
  legacy_seed: 4,
  machine_inference: 5,
  other: 6,
};

const SOURCE_AUTHORITY_PRIORITY: Record<CurriculumSource["authority"], number> =
  {
    primary: 0,
    secondary: 1,
    legacy: 2,
    inferred: 3,
  };

type MetadataDraft = CurriculumExtractedDraft["metadataBlocks"][number]["values"];
type QualificationDraft =
  CurriculumExtractedDraft["qualificationBlocks"][number]["values"];
type ComponentDraft = CurriculumExtractedDraft["components"][number]["values"];
type TopicDraft = CurriculumExtractedDraft["topics"][number]["values"];
type MisconceptionDraft =
  CurriculumExtractedDraft["misconceptionRules"][number]["values"];
type TaskRuleDraft = CurriculumExtractedDraft["taskRules"][number]["values"];

type PartialQualification = Partial<
  Omit<CurriculumQualification, "subject" | "examBoard">
> & {
  subject?: Partial<CurriculumQualification["subject"]>;
  examBoard?: Partial<CurriculumQualification["examBoard"]>;
};

type NormalizationEntityType =
  | "metadata"
  | "qualification"
  | "component"
  | "topic"
  | "edge"
  | "command_word"
  | "question_type"
  | "misconception_rule"
  | "task_rule";

interface SourceContext {
  source: CurriculumSource;
  order: number;
}

interface ProvisionalTopic {
  key: string;
  name: string;
  code?: string;
  parentRef?: string;
  sortOrder?: number;
  description?: string;
  estimatedHours?: number;
  provenance: CurriculumDraftCitation[];
  inputIndex: number;
}

interface IndexedBlock<TValue> {
  values: TValue;
  provenance: CurriculumDraftCitation[];
  inputIndex: number;
}

interface RepeatedBlockFieldSpec<TValue> {
  key: keyof TValue & string;
  getValue: (values: TValue) => unknown;
}

interface NormalizedTopicRecord {
  topic: CurriculumTopic;
  provenance: CurriculumDraftCitation[];
}

interface SourceMappingCandidate {
  sourceId: string;
  topicId?: string;
  componentId?: string;
  locator: string;
  excerptHint?: string;
  confidence: CurriculumConfidence;
}

interface MergeFieldSpec<TValue> {
  path: string;
  getValue: (values: TValue) => unknown;
}

interface MergeCandidate {
  value: unknown;
  provenance: CurriculumDraftCitation[];
  blockOrder: number;
}

interface TopicResolution {
  topic: ProvisionalTopic | null;
  reason: "missing" | "ambiguous" | null;
}

export interface CurriculumNormalizationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface CurriculumNormalizationTrace {
  entityType: NormalizationEntityType;
  entityKey: string;
  origin: "source" | "derived";
  provenance: CurriculumDraftCitation[];
}

export interface CurriculumNormalizationResult {
  ok: boolean;
  package: CurriculumPackage | null;
  errors: CurriculumNormalizationIssue[];
  warnings: CurriculumNormalizationIssue[];
  traces: CurriculumNormalizationTrace[];
  validation: CurriculumValidationReport | null;
}

function createIssue(
  severity: "error" | "warning",
  code: string,
  path: string,
  message: string
): CurriculumNormalizationIssue {
  return {
    severity,
    code,
    path,
    message,
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const segments = path.split(".");
  let current: Record<string, unknown> = target;

  segments.forEach((segment, index) => {
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      current[segment] = value;
      return;
    }

    const next = current[segment];
    if (next && typeof next === "object" && !Array.isArray(next)) {
      current = next as Record<string, unknown>;
      return;
    }

    const created: Record<string, unknown> = {};
    current[segment] = created;
    current = created;
  });
}

function dedupeProvenance(
  provenance: CurriculumDraftCitation[]
): CurriculumDraftCitation[] {
  const seen = new Set<string>();

  return provenance.filter((citation) => {
    const key = [
      citation.sourceId,
      citation.locator,
      citation.startLine,
      citation.endLine,
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeIdentityText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeOptionalIdentityText(value: string | undefined): string | null {
  return value ? normalizeIdentityText(value) : null;
}

function normalizeStringSet(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeIdentityText(value)))].sort();
}

function findGroupRoot(parent: number[], index: number): number {
  if (parent[index] === index) {
    return index;
  }

  parent[index] = findGroupRoot(parent, parent[index] as number);
  return parent[index] as number;
}

function unionGroups(parent: number[], left: number, right: number): void {
  const leftRoot = findGroupRoot(parent, left);
  const rightRoot = findGroupRoot(parent, right);

  if (leftRoot === rightRoot) {
    return;
  }

  if (leftRoot < rightRoot) {
    parent[rightRoot] = leftRoot;
    return;
  }

  parent[leftRoot] = rightRoot;
}

function reconcileRepeatedBlocks<TValue extends Record<string, unknown>>(
  entityType: "component" | "topic",
  identityLabel: string,
  blocks: IndexedBlock<TValue>[],
  fieldSpecs: RepeatedBlockFieldSpec<TValue>[],
  errors: CurriculumNormalizationIssue[]
): IndexedBlock<TValue> | null {
  const merged: Record<string, unknown> = {};
  const conflictingFields: string[] = [];

  fieldSpecs.forEach((fieldSpec) => {
    const definedValues = blocks
      .map((block) => fieldSpec.getValue(block.values))
      .filter((value) => value !== undefined);

    if (definedValues.length === 0) {
      return;
    }

    const [firstValue, ...restValues] = definedValues;
    if (restValues.some((value) => !valuesEqual(value, firstValue))) {
      conflictingFields.push(fieldSpec.key);
      return;
    }

    merged[fieldSpec.key] = firstValue;
  });

  if (conflictingFields.length > 0) {
    errors.push(
      createIssue(
        "error",
        `normalize.${entityType}_conflict`,
        identityLabel,
        `Repeated extracted ${entityType} blocks disagree on fields: ${conflictingFields.join(", ")}`
      )
    );
    return null;
  }

  return {
    values: merged as TValue,
    provenance: dedupeProvenance(blocks.flatMap((block) => block.provenance)),
    inputIndex: Math.min(...blocks.map((block) => block.inputIndex)),
  };
}

function buildSourceContext(
  draft: CurriculumExtractedDraft
): Map<string, SourceContext> {
  return new Map(
    draft.provenance.sources.map((source, index) => [
      source.id,
      {
        source,
        order: index,
      },
    ])
  );
}

function compareSourcePriority(
  left: CurriculumDraftCitation[],
  right: CurriculumDraftCitation[],
  sources: Map<string, SourceContext>
): number {
  const leftBest = getBestSourcePriority(left, sources);
  const rightBest = getBestSourcePriority(right, sources);

  if (leftBest.kind !== rightBest.kind) {
    return leftBest.kind - rightBest.kind;
  }
  if (leftBest.authority !== rightBest.authority) {
    return leftBest.authority - rightBest.authority;
  }
  return leftBest.order - rightBest.order;
}

function getBestSourcePriority(
  provenance: CurriculumDraftCitation[],
  sources: Map<string, SourceContext>
): { kind: number; authority: number; order: number } {
  return provenance.reduce(
    (best, citation) => {
      const context = sources.get(citation.sourceId);
      if (!context) {
        return best;
      }

      const candidate = {
        kind: SOURCE_KIND_PRIORITY[context.source.kind],
        authority: SOURCE_AUTHORITY_PRIORITY[context.source.authority],
        order: context.order,
      };

      if (
        candidate.kind < best.kind ||
        (candidate.kind === best.kind &&
          candidate.authority < best.authority) ||
        (candidate.kind === best.kind &&
          candidate.authority === best.authority &&
          candidate.order < best.order)
      ) {
        return candidate;
      }

      return best;
    },
    {
      kind: Number.POSITIVE_INFINITY,
      authority: Number.POSITIVE_INFINITY,
      order: Number.POSITIVE_INFINITY,
    }
  );
}

function mergeFieldBlocks<TValue>(
  entityType: "metadata" | "qualification",
  blocks: Array<{
    values: TValue;
    provenance: CurriculumDraftCitation[];
  }>,
  fieldSpecs: MergeFieldSpec<TValue>[],
  sources: Map<string, SourceContext>,
  warnings: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  fieldSpecs.forEach((fieldSpec) => {
    const candidates: MergeCandidate[] = blocks.flatMap((block, blockOrder) => {
      const value = fieldSpec.getValue(block.values);
      return value === undefined
        ? []
        : [
            {
              value,
              provenance: block.provenance,
              blockOrder,
            },
          ];
    });

    if (candidates.length === 0) {
      return;
    }

    const orderedCandidates = [...candidates].sort((left, right) =>
      compareSourcePriority(left.provenance, right.provenance, sources) ||
      right.blockOrder - left.blockOrder
    );
    const chosenCandidate = orderedCandidates[0];
    const supportingCandidates = orderedCandidates.filter((candidate) =>
      valuesEqual(candidate.value, chosenCandidate.value)
    );
    const conflictingCandidates = orderedCandidates.filter(
      (candidate) => !valuesEqual(candidate.value, chosenCandidate.value)
    );

    if (conflictingCandidates.length > 0) {
      warnings.push(
        createIssue(
          "warning",
          `normalize.${entityType}_conflict`,
          `${entityType}.${fieldSpec.path}`,
          `Multiple extracted values were found for ${entityType}.${fieldSpec.path}; kept the highest-precedence source`
        )
      );
    }

    setNestedValue(merged, fieldSpec.path, chosenCandidate.value);
    traces.push({
      entityType,
      entityKey: `${entityType}.${fieldSpec.path}`,
      origin: "source",
      provenance: dedupeProvenance(
        supportingCandidates.flatMap((candidate) => candidate.provenance)
      ),
    });
  });

  return merged;
}

function buildMetadata(
  draft: CurriculumExtractedDraft,
  sources: Map<string, SourceContext>,
  warnings: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): Partial<CurriculumPackageMetadata> {
  const fields = mergeFieldBlocks<MetadataDraft>(
    "metadata",
    draft.metadataBlocks,
    [
      { path: "packageId", getValue: (values) => values.packageId },
      { path: "packageVersion", getValue: (values) => values.packageVersion },
      { path: "title", getValue: (values) => values.title },
      { path: "summary", getValue: (values) => values.summary },
      { path: "generatedAt", getValue: (values) => values.generatedAt },
      { path: "updatedAt", getValue: (values) => values.updatedAt },
    ],
    sources,
    warnings,
    traces
  );

  return fields as Partial<CurriculumPackageMetadata>;
}

function buildQualification(
  draft: CurriculumExtractedDraft,
  sources: Map<string, SourceContext>,
  warnings: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): PartialQualification {
  const fields = mergeFieldBlocks<QualificationDraft>(
    "qualification",
    draft.qualificationBlocks,
    [
      { path: "name", getValue: (values) => values.name },
      { path: "slug", getValue: (values) => values.slug },
      { path: "level", getValue: (values) => values.level },
      { path: "versionCode", getValue: (values) => values.versionCode },
      {
        path: "firstAssessmentYear",
        getValue: (values) => values.firstAssessmentYear,
      },
      { path: "firstExamYear", getValue: (values) => values.firstExamYear },
      { path: "specUrl", getValue: (values) => values.specUrl },
      { path: "subject.name", getValue: (values) => values.subject?.name },
      { path: "subject.slug", getValue: (values) => values.subject?.slug },
      {
        path: "examBoard.name",
        getValue: (values) => values.examBoard?.name,
      },
      {
        path: "examBoard.code",
        getValue: (values) => values.examBoard?.code,
      },
    ],
    sources,
    warnings,
    traces
  );

  return fields as PartialQualification;
}

function addDerivedTrace(
  traces: CurriculumNormalizationTrace[],
  entityType: "metadata" | "qualification",
  entityKey: string
): void {
  traces.push({
    entityType,
    entityKey: `${entityType}.${entityKey}`,
    origin: "derived",
    provenance: [],
  });
}

function deriveMetadataAndQualification(
  metadata: Partial<CurriculumPackageMetadata>,
  qualification: PartialQualification,
  warnings: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): void {
  if (!qualification.name && qualification.level && qualification.subject?.name) {
    qualification.name = `${qualification.level} ${qualification.subject.name}`;
    warnings.push(
      createIssue(
        "warning",
        "normalize.qualification_name_derived",
        "qualification.name",
        "Derived qualification.name from qualification.level and qualification.subject.name"
      )
    );
    addDerivedTrace(traces, "qualification", "name");
  }

  if (!qualification.slug && qualification.level && qualification.subject?.slug) {
    qualification.slug = `${slugify(qualification.level)}-${
      qualification.subject.slug
    }`;
    warnings.push(
      createIssue(
        "warning",
        "normalize.qualification_slug_derived",
        "qualification.slug",
        "Derived qualification.slug from qualification.level and qualification.subject.slug"
      )
    );
    addDerivedTrace(traces, "qualification", "slug");
  }

  if (!metadata.packageVersion) {
    metadata.packageVersion = "0.1.0-candidate";
    warnings.push(
      createIssue(
        "warning",
        "normalize.package_version_defaulted",
        "metadata.packageVersion",
        "Defaulted metadata.packageVersion to 0.1.0-candidate"
      )
    );
    addDerivedTrace(traces, "metadata", "packageVersion");
  }

  if (
    !metadata.packageId &&
    qualification.examBoard?.code &&
    qualification.level &&
    qualification.subject?.slug &&
    qualification.versionCode
  ) {
    metadata.packageId = [
      slugify(qualification.examBoard.code),
      slugify(qualification.level),
      qualification.subject.slug,
      slugify(qualification.versionCode),
    ].join("-");
    warnings.push(
      createIssue(
        "warning",
        "normalize.package_id_derived",
        "metadata.packageId",
        "Derived metadata.packageId from qualification identity fields"
      )
    );
    addDerivedTrace(traces, "metadata", "packageId");
  }

  if (!metadata.title && qualification.examBoard?.name && qualification.name) {
    metadata.title = `${qualification.examBoard.name} ${qualification.name}`;
    warnings.push(
      createIssue(
        "warning",
        "normalize.title_derived",
        "metadata.title",
        "Derived metadata.title from qualification.examBoard.name and qualification.name"
      )
    );
    addDerivedTrace(traces, "metadata", "title");
  }
}

function pushMissingRequiredFields(
  metadata: Partial<CurriculumPackageMetadata>,
  qualification: PartialQualification,
  componentsCount: number,
  topicsCount: number,
  errors: CurriculumNormalizationIssue[]
): void {
  const requiredFields: Array<[string, unknown]> = [
    ["metadata.packageId", metadata.packageId],
    ["metadata.packageVersion", metadata.packageVersion],
    ["metadata.title", metadata.title],
    ["metadata.generatedAt", metadata.generatedAt],
    ["qualification.name", qualification.name],
    ["qualification.slug", qualification.slug],
    ["qualification.level", qualification.level],
    ["qualification.versionCode", qualification.versionCode],
    ["qualification.subject.name", qualification.subject?.name],
    ["qualification.subject.slug", qualification.subject?.slug],
    ["qualification.examBoard.name", qualification.examBoard?.name],
    ["qualification.examBoard.code", qualification.examBoard?.code],
  ];

  requiredFields.forEach(([fieldPath, value]) => {
    if (value === undefined || value === null || value === "") {
      errors.push(
        createIssue(
          "error",
          "normalize.missing_required_field",
          fieldPath,
          `Missing required field ${fieldPath}`
        )
      );
    }
  });

  if (componentsCount === 0) {
    errors.push(
      createIssue(
        "error",
        "normalize.components_required",
        "components",
        "At least one extracted component is required to build a package"
      )
    );
  }

  if (topicsCount === 0) {
    errors.push(
      createIssue(
        "error",
        "normalize.topics_required",
        "topics",
        "At least one extracted topic is required to build a package"
      )
    );
  }
}

function buildComponents(
  draft: CurriculumExtractedDraft,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumAssessmentComponent[] {
  const groupedComponents = new Map<string, IndexedBlock<ComponentDraft>[]>();

  draft.components.forEach((block, index) => {
    const componentKey = normalizeIdentityText(block.values.code);
    groupedComponents.set(componentKey, [
      ...(groupedComponents.get(componentKey) ?? []),
      {
        values: block.values,
        provenance: block.provenance,
        inputIndex: index,
      },
    ]);
  });

  return [...groupedComponents.entries()]
    .map(([componentKey, blocks]) =>
      reconcileRepeatedBlocks(
        "component",
        `components.code:${componentKey}`,
        blocks,
        [
          { key: "name", getValue: (values) => values.name },
          { key: "code", getValue: (values) => values.code },
          {
            key: "weightPercent",
            getValue: (values) => values.weightPercent,
          },
          {
            key: "durationMinutes",
            getValue: (values) => values.durationMinutes,
          },
          { key: "totalMarks", getValue: (values) => values.totalMarks },
          { key: "isExam", getValue: (values) => values.isExam },
        ],
        errors
      )
    )
    .filter((component): component is IndexedBlock<ComponentDraft> => component !== null)
    .sort((left, right) => left.inputIndex - right.inputIndex)
    .map((component) => {
      const componentId = `component-${slugify(component.values.code)}`;
      traces.push({
        entityType: "component",
        entityKey: componentId,
        origin: "source",
        provenance: component.provenance,
      });

      return {
        id: componentId,
        name: component.values.name,
        code: component.values.code,
        weightPercent: component.values.weightPercent,
        durationMinutes: component.values.durationMinutes,
        totalMarks: component.values.totalMarks,
        isExam: component.values.isExam,
      };
    });
}

function getTopicIdentityKeys(values: TopicDraft): string[] {
  const keys = [
    `name:${normalizeOptionalIdentityText(values.parentRef) ?? "root"}|${normalizeIdentityText(
      values.name
    )}`,
  ];

  if (values.code) {
    keys.unshift(`code:${normalizeIdentityText(values.code)}`);
  }

  return keys;
}

function buildProvisionalTopics(
  draft: CurriculumExtractedDraft,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): ProvisionalTopic[] {
  const parent = draft.topics.map((_, index) => index);
  const seenIdentity = new Map<string, number>();

  draft.topics.forEach((block, index) => {
    getTopicIdentityKeys(block.values).forEach((identityKey) => {
      const existingIndex = seenIdentity.get(identityKey);
      if (existingIndex === undefined) {
        seenIdentity.set(identityKey, index);
        return;
      }

      unionGroups(parent, existingIndex, index);
    });
  });

  const groupedTopics = new Map<number, IndexedBlock<TopicDraft>[]>();

  draft.topics.forEach((block, index) => {
    const rootIndex = findGroupRoot(parent, index);
    groupedTopics.set(rootIndex, [
      ...(groupedTopics.get(rootIndex) ?? []),
      {
        values: block.values,
        provenance: block.provenance,
        inputIndex: index,
      },
    ]);
  });

  return [...groupedTopics.values()]
    .map((blocks) =>
      reconcileRepeatedBlocks(
        "topic",
        blocks[0]?.values.code
          ? `topics.code:${normalizeIdentityText(
              blocks[0].values.code as string
            )}`
          : `topics.name:${
              normalizeOptionalIdentityText(blocks[0]?.values.parentRef) ?? "root"
            }/${slugify(blocks[0]?.values.name as string)}`,
        blocks,
        [
          { key: "name", getValue: (values) => values.name },
          { key: "code", getValue: (values) => values.code },
          { key: "parentRef", getValue: (values) => values.parentRef },
          { key: "sortOrder", getValue: (values) => values.sortOrder },
          { key: "description", getValue: (values) => values.description },
          {
            key: "estimatedHours",
            getValue: (values) => values.estimatedHours,
          },
        ],
        errors
      )
    )
    .filter((topic): topic is IndexedBlock<TopicDraft> => topic !== null)
    .sort((left, right) => left.inputIndex - right.inputIndex)
    .map((topic) => {
      const key = topic.values.code
        ? `code:${normalizeIdentityText(topic.values.code)}`
        : `topic:${
            normalizeOptionalIdentityText(topic.values.parentRef) ?? "root"
          }:${slugify(topic.values.name)}`;
      const topicId = topic.values.code
        ? `topic-${slugify(topic.values.code)}`
        : `topic-${slugify(
            `${topic.values.parentRef ?? "root"}-${topic.values.name}`
          )}`;

      traces.push({
        entityType: "topic",
        entityKey: topicId,
        origin: "source",
        provenance: topic.provenance,
      });

      return {
        key,
        name: topic.values.name,
        code: topic.values.code,
        parentRef: topic.values.parentRef,
        sortOrder: topic.values.sortOrder,
        description: topic.values.description,
        estimatedHours: topic.values.estimatedHours,
        provenance: topic.provenance,
        inputIndex: topic.inputIndex,
      };
    });
}

function buildTopicReferenceLookup(topics: ProvisionalTopic[]): {
  byCode: Map<string, ProvisionalTopic[]>;
  byName: Map<string, ProvisionalTopic[]>;
} {
  const byCode = new Map<string, ProvisionalTopic[]>();
  const byName = new Map<string, ProvisionalTopic[]>();

  topics.forEach((topic) => {
    if (topic.code) {
      const codeKey = normalizeIdentityText(topic.code);
      byCode.set(codeKey, [...(byCode.get(codeKey) ?? []), topic]);
    }

    const normalizedName = normalizeIdentityText(topic.name);
    byName.set(normalizedName, [...(byName.get(normalizedName) ?? []), topic]);
  });

  return { byCode, byName };
}

function resolveTopicReference(
  topicRef: string,
  lookup: ReturnType<typeof buildTopicReferenceLookup>
): TopicResolution {
  const normalizedRef = normalizeIdentityText(topicRef);
  const byCode = lookup.byCode.get(normalizedRef);
  if (byCode?.length === 1) {
    return { topic: byCode[0], reason: null };
  }
  if (byCode && byCode.length > 1) {
    return { topic: null, reason: "ambiguous" };
  }

  const byName = lookup.byName.get(normalizedRef) ?? [];
  if (byName.length === 1) {
    return { topic: byName[0], reason: null };
  }
  if (byName.length > 1) {
    return { topic: null, reason: "ambiguous" };
  }

  return { topic: null, reason: "missing" };
}

function assignTopicSortOrders(
  topics: ProvisionalTopic[],
  parentByKey: Map<string, string | null>
): Map<string, number> {
  const sortOrderByKey = new Map<string, number>();
  const groups = new Map<string, ProvisionalTopic[]>();

  topics.forEach((topic) => {
    const parentKey = parentByKey.get(topic.key) ?? null;
    const groupKey = parentKey ?? "root";
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), topic]);
  });

  groups.forEach((groupTopics) => {
    const usedSortOrders = new Set(
      groupTopics
        .map((topic) => topic.sortOrder)
        .filter((sortOrder): sortOrder is number => sortOrder !== undefined)
    );
    let nextSortOrder = 1;

    groupTopics.forEach((topic) => {
      if (topic.sortOrder !== undefined) {
        sortOrderByKey.set(topic.key, topic.sortOrder);
        return;
      }

      while (usedSortOrders.has(nextSortOrder)) {
        nextSortOrder += 1;
      }

      usedSortOrders.add(nextSortOrder);
      sortOrderByKey.set(topic.key, nextSortOrder);
      nextSortOrder += 1;
    });
  });

  return sortOrderByKey;
}

function normalizeTopics(
  draft: CurriculumExtractedDraft,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): {
  topics: CurriculumTopic[];
  topicRecords: NormalizedTopicRecord[];
  topicIdByKey: Map<string, string>;
  resolver: (topicRef: string) => TopicResolution;
  topicFatal: boolean;
} {
  const provisionalTopics = buildProvisionalTopics(draft, errors, traces);
  const lookup = buildTopicReferenceLookup(provisionalTopics);
  const parentByKey = new Map<string, string | null>();
  const topicIdByKey = new Map<string, string>();
  let topicFatal = false;

  provisionalTopics.forEach((topic) => {
    const topicId = topic.code
      ? `topic-${slugify(topic.code)}`
      : `topic-${slugify(`${topic.parentRef ?? "root"}-${topic.name}`)}`;
    topicIdByKey.set(topic.key, topicId);
  });

  provisionalTopics.forEach((topic) => {
    if (!topic.parentRef) {
      parentByKey.set(topic.key, null);
      return;
    }

    const resolved = resolveTopicReference(topic.parentRef, lookup);
    if (!resolved.topic || !resolved.reason) {
      parentByKey.set(topic.key, resolved.topic?.key ?? null);
      return;
    }

    topicFatal = true;
    errors.push(
      createIssue(
        "error",
        `normalize.topic_parent_${resolved.reason}`,
        `topics.${topic.key}.parentRef`,
        `Unable to resolve parent topic reference ${topic.parentRef}`
      )
    );
    parentByKey.set(topic.key, null);
  });

  const canonicalTopicGroups = new Map<string, ProvisionalTopic[]>();
  provisionalTopics.forEach((topic) => {
    const identityKey = `parent:${parentByKey.get(topic.key) ?? "root"}|name:${normalizeIdentityText(
      topic.name
    )}`;
    canonicalTopicGroups.set(identityKey, [
      ...(canonicalTopicGroups.get(identityKey) ?? []),
      topic,
    ]);
  });

  canonicalTopicGroups.forEach((group, identityKey) => {
    if (group.length < 2) {
      return;
    }

    topicFatal = true;
    errors.push(
      createIssue(
        "error",
        "normalize.topic_duplicate_unresolved",
        `topics.${identityKey}`,
        "Repeated extracted topics collapse to the same canonical topic identity"
      )
    );
  });

  const depthByKey = new Map<string, number>();
  const activeStack = new Set<string>();

  const computeDepth = (topicKey: string): number => {
    const cachedDepth = depthByKey.get(topicKey);
    if (cachedDepth !== undefined) {
      return cachedDepth;
    }

    if (activeStack.has(topicKey)) {
      topicFatal = true;
      errors.push(
        createIssue(
          "error",
          "normalize.topic_cycle_detected",
          `topics.${topicKey}.parentRef`,
          "Detected a cycle in extracted topic ancestry"
        )
      );
      return 0;
    }

    activeStack.add(topicKey);
    const parentKey = parentByKey.get(topicKey) ?? null;
    const depth = parentKey ? computeDepth(parentKey) + 1 : 0;
    activeStack.delete(topicKey);
    depthByKey.set(topicKey, depth);
    return depth;
  };

  provisionalTopics.forEach((topic) => {
    computeDepth(topic.key);
  });

  const sortOrderByKey = assignTopicSortOrders(provisionalTopics, parentByKey);
  const topicRecords = provisionalTopics.map((topic) => ({
    topic: {
      id: topicIdByKey.get(topic.key) as string,
      name: topic.name,
      code: topic.code,
      parentId: parentByKey.get(topic.key)
        ? (topicIdByKey.get(parentByKey.get(topic.key) as string) as string)
        : null,
      depth: depthByKey.get(topic.key) ?? 0,
      sortOrder: sortOrderByKey.get(topic.key) ?? 1,
      description: topic.description,
      estimatedHours: topic.estimatedHours,
    },
    provenance: topic.provenance,
  }));

  return {
    topics: topicRecords.map((record) => record.topic),
    topicRecords,
    topicIdByKey,
    resolver: (topicRef: string) => resolveTopicReference(topicRef, lookup),
    topicFatal,
  };
}

function normalizeCommandWords(
  draft: CurriculumExtractedDraft,
  traces: CurriculumNormalizationTrace[]
): CurriculumCommandWord[] {
  return draft.commandWords.map((block) => {
    const commandWordId = `command-word-${slugify(block.values.word)}`;
    traces.push({
      entityType: "command_word",
      entityKey: commandWordId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    return {
      id: commandWordId,
      word: block.values.word,
      definition: block.values.definition,
      expectedDepth: block.values.expectedDepth,
      guidance: block.values.guidance,
    };
  });
}

function normalizeQuestionTypes(
  draft: CurriculumExtractedDraft,
  traces: CurriculumNormalizationTrace[]
): CurriculumQuestionType[] {
  return draft.questionTypes.map((block) => {
    const questionTypeId = `question-type-${slugify(block.values.name)}`;
    traces.push({
      entityType: "question_type",
      entityKey: questionTypeId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    return {
      id: questionTypeId,
      name: block.values.name,
      description: block.values.description,
      typicalMarks: block.values.typicalMarks,
      markSchemePattern: block.values.markSchemePattern,
    };
  });
}

function excerptHintFromCitation(citation: CurriculumDraftCitation): string {
  const flattened = citation.excerpt
    .split("\n")
    .slice(1)
    .join(" ")
    .trim();
  const hint = flattened || citation.excerpt;
  return hint.length > 160 ? `${hint.slice(0, 157)}...` : hint;
}

function confidenceForSource(
  source: CurriculumSource | undefined
): CurriculumConfidence {
  if (!source) {
    return "medium";
  }
  if (source.authority === "primary") {
    return "high";
  }
  if (source.authority === "secondary") {
    return source.kind === "past_paper" ? "medium" : "high";
  }
  if (source.authority === "legacy") {
    return "medium";
  }
  return "low";
}

function buildSourceMappingKey(
  mapping: Pick<
    SourceMappingCandidate,
    "sourceId" | "topicId" | "componentId" | "locator"
  >
): string {
  return [
    mapping.sourceId,
    mapping.topicId ?? "",
    mapping.componentId ?? "",
    mapping.locator,
  ].join("|");
}

function buildSourceMappingBaseId(
  mapping: Pick<
    SourceMappingCandidate,
    "sourceId" | "topicId" | "componentId" | "locator"
  >
): string {
  const targetKey = mapping.topicId
    ? `topic-${mapping.topicId}`
    : `component-${mapping.componentId}`;
  return `source-mapping-${slugify(
    `${mapping.sourceId}-${targetKey}-${mapping.locator}`
  )}`;
}

function buildMisconceptionBaseId(
  topicId: string,
  provenance: CurriculumDraftCitation[]
): string {
  const citations = dedupeProvenance(provenance).sort((left, right) =>
    JSON.stringify([
      left.sourceId,
      left.locator,
      left.startLine ?? 0,
      left.endLine ?? 0,
    ]).localeCompare(
      JSON.stringify([
        right.sourceId,
        right.locator,
        right.startLine ?? 0,
        right.endLine ?? 0,
      ])
    )
  );
  const primaryCitation = citations[0];

  return `misconception-${slugify(
    `${topicId}-${primaryCitation ? `${primaryCitation.sourceId}-${primaryCitation.locator}` : topicId}`
  )}`;
}

function resolveSourceMappingTargets(
  trace: CurriculumNormalizationTrace,
  components: CurriculumAssessmentComponent[],
  misconceptionRules: Map<string, string>,
  taskRules: Map<string, string>
): Array<Pick<SourceMappingCandidate, "topicId" | "componentId">> {
  switch (trace.entityType) {
    case "topic":
      return [{ topicId: trace.entityKey }];
    case "component":
      return [{ componentId: trace.entityKey }];
    case "misconception_rule": {
      const topicId = misconceptionRules.get(trace.entityKey);
      return topicId ? [{ topicId }] : [];
    }
    case "task_rule": {
      const topicId = taskRules.get(trace.entityKey);
      return topicId ? [{ topicId }] : [];
    }
    case "command_word":
      return components.map((component) => ({ componentId: component.id }));
    default:
      return [];
  }
}

function buildSourceMappings(
  traces: CurriculumNormalizationTrace[],
  components: CurriculumAssessmentComponent[],
  misconceptionRules: CurriculumMisconceptionRule[],
  taskRules: CurriculumTaskRule[],
  sources: Map<string, SourceContext>
): CurriculumSourceMappingHint[] {
  const misconceptionRuleTopicIds = new Map(
    misconceptionRules.map((rule) => [rule.id, rule.topicId] as const)
  );
  const taskRuleTopicIds = new Map(
    taskRules.flatMap((rule) => (rule.topicId ? [[rule.id, rule.topicId] as const] : []))
  );
  const dedupedMappings = new Map<string, SourceMappingCandidate>();

  traces.forEach((trace) => {
    if (trace.origin !== "source") {
      return;
    }

    const targets = resolveSourceMappingTargets(
      trace,
      components,
      misconceptionRuleTopicIds,
      taskRuleTopicIds
    );
    if (targets.length === 0) {
      return;
    }

    dedupeProvenance(trace.provenance).forEach((citation) => {
      const excerptHint = excerptHintFromCitation(citation);
      const confidence = confidenceForSource(sources.get(citation.sourceId)?.source);

      targets.forEach((target) => {
        const candidate: SourceMappingCandidate = {
          sourceId: citation.sourceId,
          ...target,
          locator: citation.locator,
          excerptHint,
          confidence,
        };
        const key = buildSourceMappingKey(candidate);
        const existing = dedupedMappings.get(key);

        if (!existing) {
          dedupedMappings.set(key, candidate);
          return;
        }

        if (!existing.excerptHint && excerptHint) {
          existing.excerptHint = excerptHint;
        }
      });
    });
  });

  const sortedMappings = [...dedupedMappings.values()].sort((left, right) =>
    JSON.stringify([
      left.sourceId,
      left.topicId ?? "",
      left.componentId ?? "",
      left.locator,
      left.excerptHint ?? "",
    ]).localeCompare(
      JSON.stringify([
        right.sourceId,
        right.topicId ?? "",
        right.componentId ?? "",
        right.locator,
        right.excerptHint ?? "",
      ])
    )
  );
  const baseIdCounts = new Map<string, number>();

  return sortedMappings.map((mapping) => {
    const baseId = buildSourceMappingBaseId(mapping);
    const nextCount = (baseIdCounts.get(baseId) ?? 0) + 1;
    baseIdCounts.set(baseId, nextCount);

    return {
      id: nextCount === 1 ? baseId : `${baseId}-${nextCount}`,
      sourceId: mapping.sourceId,
      topicId: mapping.topicId,
      componentId: mapping.componentId,
      locator: mapping.locator,
      excerptHint: mapping.excerptHint,
      confidence: mapping.confidence,
    };
  });
}

function normalizeEdges(
  draft: CurriculumExtractedDraft,
  resolveTopic: (topicRef: string) => TopicResolution,
  topicIdByKey: Map<string, string>,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumTopicEdge[] {
  const edges: CurriculumTopicEdge[] = [];

  draft.edges.forEach((block, index) => {
    const from = resolveTopic(block.values.fromTopicRef);
    const to = resolveTopic(block.values.toTopicRef);

    if (!from.topic || !to.topic) {
      errors.push(
        createIssue(
          "error",
          "normalize.edge_topic_unresolved",
          `edges.${index}`,
          `Unable to resolve edge topic refs ${block.values.fromTopicRef} -> ${block.values.toTopicRef}`
        )
      );
      return;
    }

    const edge: CurriculumTopicEdge = {
      fromTopicId: topicIdByKey.get(from.topic.key) as string,
      toTopicId: topicIdByKey.get(to.topic.key) as string,
      type: block.values.type,
      rationale: block.values.rationale,
    };

    traces.push({
      entityType: "edge",
      entityKey: `${edge.fromTopicId}|${edge.toTopicId}|${edge.type}`,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    edges.push(edge);
  });

  return edges;
}

function buildMisconceptionIdentity(
  topicId: string,
  values: MisconceptionDraft
): string {
  return JSON.stringify({
    topicId,
    description: normalizeIdentityText(values.description),
    triggerPatterns: normalizeStringSet(values.triggerPatterns),
    correctionGuidance: normalizeIdentityText(values.correctionGuidance),
    severity: values.severity ?? 2,
  });
}

function buildTaskRuleIdentity(
  topicId: string | undefined,
  values: TaskRuleDraft
): string {
  return JSON.stringify({
    taskType: values.taskType,
    topicId: topicId ?? null,
    title: normalizeIdentityText(values.title),
    guidance: normalizeIdentityText(values.guidance),
    conditions: normalizeStringSet(values.conditions),
    priority: values.priority,
  });
}

function normalizeMisconceptions(
  draft: CurriculumExtractedDraft,
  resolveTopic: (topicRef: string) => TopicResolution,
  topicIdByKey: Map<string, string>,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumMisconceptionRule[] {
  const misconceptionRules = new Map<
    string,
    {
      rule: Omit<CurriculumMisconceptionRule, "id">;
      provenance: CurriculumDraftCitation[];
    }
  >();

  draft.misconceptionRules.forEach((block, index) => {
    const resolved = resolveTopic(block.values.topicRef);
    if (!resolved.topic) {
      errors.push(
        createIssue(
          "error",
          "normalize.misconception_topic_unresolved",
          `misconceptionRules.${index}.topicRef`,
          `Unable to resolve misconception topic ref ${block.values.topicRef}`
        )
      );
      return;
    }

    const topicId = topicIdByKey.get(resolved.topic.key) as string;
    const identity = buildMisconceptionIdentity(topicId, block.values);
    const existing = misconceptionRules.get(identity);

    if (existing) {
      existing.provenance = dedupeProvenance([
        ...existing.provenance,
        ...block.provenance,
      ]);
      return;
    }

    misconceptionRules.set(identity, {
      rule: {
        topicId,
        description: block.values.description,
        triggerPatterns: block.values.triggerPatterns,
        correctionGuidance: block.values.correctionGuidance,
        severity: block.values.severity ?? 2,
      },
      provenance: dedupeProvenance(block.provenance),
    });
  });

  const sortedRules = [...misconceptionRules.values()].sort((left, right) =>
    JSON.stringify([
      left.rule.topicId,
      left.provenance.map((citation) => [
        citation.sourceId,
        citation.locator,
        citation.startLine ?? 0,
        citation.endLine ?? 0,
      ]),
      left.rule.description,
    ]).localeCompare(
      JSON.stringify([
        right.rule.topicId,
        right.provenance.map((citation) => [
          citation.sourceId,
          citation.locator,
          citation.startLine ?? 0,
          citation.endLine ?? 0,
        ]),
        right.rule.description,
      ])
    )
  );
  const baseIdCounts = new Map<string, number>();

  return sortedRules.map(({ rule, provenance }) => {
    const baseId = buildMisconceptionBaseId(rule.topicId, provenance);
    const nextCount = (baseIdCounts.get(baseId) ?? 0) + 1;
    baseIdCounts.set(baseId, nextCount);
    const ruleId = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
    const normalizedRule: CurriculumMisconceptionRule = {
      id: ruleId,
      ...rule,
    };

    traces.push({
      entityType: "misconception_rule",
      entityKey: normalizedRule.id,
      origin: "source",
      provenance,
    });

    return normalizedRule;
  });
}

function normalizeTaskRules(
  draft: CurriculumExtractedDraft,
  resolveTopic: (topicRef: string) => TopicResolution,
  topicIdByKey: Map<string, string>,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumTaskRule[] {
  const taskRules = new Map<
    string,
    {
      rule: CurriculumTaskRule;
      provenance: CurriculumDraftCitation[];
    }
  >();

  draft.taskRules.forEach((block, index) => {
    let topicId: string | undefined;
    if (block.values.topicRef) {
      const resolved = resolveTopic(block.values.topicRef);
      if (!resolved.topic) {
        errors.push(
          createIssue(
            "error",
            "normalize.task_rule_topic_unresolved",
            `taskRules.${index}.topicRef`,
            `Unable to resolve task rule topic ref ${block.values.topicRef}`
          )
        );
        return;
      }

      topicId = topicIdByKey.get(resolved.topic.key) as string;
    }

    const identity = buildTaskRuleIdentity(topicId, block.values);
    const existing = taskRules.get(identity);

    if (existing) {
      existing.provenance = dedupeProvenance([
        ...existing.provenance,
        ...block.provenance,
      ]);
      return;
    }

    const ruleId = `task-rule-${slugify(
      `${block.values.taskType}-${topicId ?? "global"}-${block.values.title}`
    )}`;

    taskRules.set(identity, {
      rule: {
        id: ruleId,
        taskType: block.values.taskType,
        topicId,
        title: block.values.title,
        guidance: block.values.guidance,
        conditions: block.values.conditions,
        priority: block.values.priority,
      },
      provenance: dedupeProvenance(block.provenance),
    });
  });

  return [...taskRules.values()].map(({ rule, provenance }) => {
    traces.push({
      entityType: "task_rule",
      entityKey: rule.id,
      origin: "source",
      provenance,
    });

    return rule;
  });
}

function parseDraftInput(input: unknown): {
  draft: CurriculumExtractedDraft | null;
  errors: CurriculumNormalizationIssue[];
} {
  const directResult = curriculumExtractedDraftSchema.safeParse(input);
  if (directResult.success) {
    return {
      draft: directResult.data,
      errors: [],
    };
  }

  const wrappedDraft =
    typeof input === "object" && input !== null && "draft" in input
      ? (input as { draft?: unknown }).draft
      : undefined;
  const wrappedResult = curriculumExtractedDraftSchema.safeParse(wrappedDraft);
  if (wrappedResult.success) {
    return {
      draft: wrappedResult.data,
      errors: [],
    };
  }

  const sourceError = wrappedDraft !== undefined ? wrappedResult.error : directResult.error;
  return {
    draft: null,
    errors: sourceError.issues.map((issue) =>
      createIssue(
        "error",
        "normalize.invalid_draft",
        issue.path.join(".") || "<root>",
        issue.message
      )
    ),
  };
}

function mapValidationIssues(
  issues: NonNullable<CurriculumNormalizationResult["validation"]>["errors"]
): CurriculumNormalizationIssue[] {
  return issues.map((issue) =>
    createIssue(issue.severity, issue.code, issue.path, issue.message)
  );
}

export function normalizeCurriculumDraft(
  input: unknown
): CurriculumNormalizationResult {
  const parsed = parseDraftInput(input);
  if (!parsed.draft) {
    return {
      ok: false,
      package: null,
      errors: parsed.errors,
      warnings: [],
      traces: [],
      validation: null,
    };
  }

  const draft = parsed.draft;
  const errors: CurriculumNormalizationIssue[] = [];
  const warnings: CurriculumNormalizationIssue[] = [];
  const traces: CurriculumNormalizationTrace[] = [];
  const sources = buildSourceContext(draft);

  const metadata = buildMetadata(draft, sources, warnings, traces);
  const qualification = buildQualification(draft, sources, warnings, traces);
  deriveMetadataAndQualification(metadata, qualification, warnings, traces);

  const components = buildComponents(draft, errors, traces);
  const normalizedTopics = normalizeTopics(draft, errors, traces);
  pushMissingRequiredFields(
    metadata,
    qualification,
    components.length,
    normalizedTopics.topics.length,
    errors
  );

  if (normalizedTopics.topicFatal || errors.length > 0) {
    return {
      ok: false,
      package: null,
      errors,
      warnings,
      traces,
      validation: null,
    };
  }

  const commandWords = normalizeCommandWords(draft, traces);
  const questionTypes = normalizeQuestionTypes(draft, traces);
  const edges = normalizeEdges(
    draft,
    normalizedTopics.resolver,
    normalizedTopics.topicIdByKey,
    errors,
    traces
  );
  const misconceptionRules = normalizeMisconceptions(
    draft,
    normalizedTopics.resolver,
    normalizedTopics.topicIdByKey,
    errors,
    traces
  );
  const taskRules = normalizeTaskRules(
    draft,
    normalizedTopics.resolver,
    normalizedTopics.topicIdByKey,
    errors,
    traces
  );
  const sourceMappings = buildSourceMappings(
    traces,
    components,
    misconceptionRules,
    taskRules,
    sources
  );

  const curriculumPackage: CurriculumPackage = {
    schemaVersion: "1.0",
    lifecycle: "candidate",
    metadata: {
      packageId: metadata.packageId as string,
      packageVersion: metadata.packageVersion as string,
      title: metadata.title as string,
      summary: metadata.summary,
      generatedAt: metadata.generatedAt as string,
      updatedAt: metadata.updatedAt,
    },
    qualification: {
      name: qualification.name as string,
      slug: qualification.slug as string,
      level: qualification.level as string,
      versionCode: qualification.versionCode as string,
      firstAssessmentYear: qualification.firstAssessmentYear,
      firstExamYear: qualification.firstExamYear,
      specUrl: qualification.specUrl,
      subject: {
        name: qualification.subject?.name as string,
        slug: qualification.subject?.slug as string,
      },
      examBoard: {
        name: qualification.examBoard?.name as string,
        code: qualification.examBoard?.code as string,
      },
    },
    provenance: draft.provenance,
    review: {
      status: "unreviewed",
      reviewers: [],
    },
    components,
    topics: normalizedTopics.topics,
    edges,
    commandWords,
    questionTypes,
    misconceptionRules,
    taskRules,
    sourceMappings,
  };

  const validation = validateCurriculumPackage(curriculumPackage);
  if (!validation.ok) {
    errors.push(...mapValidationIssues(validation.errors));
  }
  warnings.push(...mapValidationIssues(validation.warnings));

  const normalizedPackage =
    errors.length === 0 && validation.ok ? validation.package : null;

  return {
    ok: normalizedPackage !== null,
    package: normalizedPackage,
    errors,
    warnings,
    traces,
    validation,
  };
}

export function formatNormalizationIssues(
  result: CurriculumNormalizationResult
): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push("Errors:");
    result.errors.forEach((issue) => {
      lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    });
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Warnings:");
    result.warnings.forEach((issue) => {
      lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    });
  }

  if (result.validation && result.validation.errors.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Validation Errors:");
    result.validation.errors.forEach((issue) => {
      lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    });
  }

  if (result.validation && result.validation.warnings.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Validation Warnings:");
    result.validation.warnings.forEach((issue) => {
      lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    });
  }

  return lines.join("\n");
}
