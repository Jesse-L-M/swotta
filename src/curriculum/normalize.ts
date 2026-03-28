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
  traces: CurriculumNormalizationTrace[]
): CurriculumAssessmentComponent[] {
  return draft.components.map((block) => {
    const componentId = `component-${slugify(block.values.code)}`;
    traces.push({
      entityType: "component",
      entityKey: componentId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    return {
      id: componentId,
      name: block.values.name,
      code: block.values.code,
      weightPercent: block.values.weightPercent,
      durationMinutes: block.values.durationMinutes,
      totalMarks: block.values.totalMarks,
      isExam: block.values.isExam,
    };
  });
}

function buildProvisionalTopics(
  draft: CurriculumExtractedDraft,
  traces: CurriculumNormalizationTrace[]
): ProvisionalTopic[] {
  return draft.topics.map((block, index) => {
    const key = block.values.code
      ? `code:${block.values.code}`
      : `topic:${slugify(block.values.parentRef ?? "root")}:${slugify(
          block.values.name
        )}:${index + 1}`;

    const topicId = block.values.code
      ? `topic-${slugify(block.values.code)}`
      : `topic-${slugify(
          `${block.values.parentRef ?? "root"}-${block.values.name}-${index + 1}`
        )}`;

    traces.push({
      entityType: "topic",
      entityKey: topicId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    return {
      key,
      name: block.values.name,
      code: block.values.code,
      parentRef: block.values.parentRef,
      sortOrder: block.values.sortOrder,
      description: block.values.description,
      estimatedHours: block.values.estimatedHours,
      provenance: block.provenance,
      inputIndex: index,
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
      byCode.set(topic.code, [...(byCode.get(topic.code) ?? []), topic]);
    }

    const normalizedName = topic.name.trim().toLowerCase();
    byName.set(normalizedName, [...(byName.get(normalizedName) ?? []), topic]);
  });

  return { byCode, byName };
}

function resolveTopicReference(
  topicRef: string,
  lookup: ReturnType<typeof buildTopicReferenceLookup>
): TopicResolution {
  const byCode = lookup.byCode.get(topicRef.trim());
  if (byCode?.length === 1) {
    return { topic: byCode[0], reason: null };
  }
  if (byCode && byCode.length > 1) {
    return { topic: null, reason: "ambiguous" };
  }

  const byName = lookup.byName.get(topicRef.trim().toLowerCase()) ?? [];
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
  topicIdByKey: Map<string, string>;
  resolver: (topicRef: string) => TopicResolution;
  topicFatal: boolean;
} {
  const provisionalTopics = buildProvisionalTopics(draft, traces);
  const lookup = buildTopicReferenceLookup(provisionalTopics);
  const parentByKey = new Map<string, string | null>();
  const topicIdByKey = new Map<string, string>();
  let topicFatal = false;

  provisionalTopics.forEach((topic, index) => {
    const topicId = topic.code
      ? `topic-${slugify(topic.code)}`
      : `topic-${slugify(
          `${topic.parentRef ?? "root"}-${topic.name}-${index + 1}`
        )}`;
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

  return {
    topics: provisionalTopics.map((topic) => ({
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
    })),
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

function buildSourceMappings(
  topics: CurriculumTopic[],
  draft: CurriculumExtractedDraft,
  sources: Map<string, SourceContext>
): CurriculumSourceMappingHint[] {
  return topics.flatMap((topic, index) =>
    dedupeProvenance(draft.topics[index]?.provenance ?? []).map(
      (citation, citationIndex) => ({
        id: `source-mapping-${slugify(
          `${citation.sourceId}-${topic.id}-${citationIndex + 1}`
        )}`,
        sourceId: citation.sourceId,
        topicId: topic.id,
        locator: citation.locator,
        excerptHint: excerptHintFromCitation(citation),
        confidence: confidenceForSource(sources.get(citation.sourceId)?.source),
      })
    )
  );
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

function normalizeMisconceptions(
  draft: CurriculumExtractedDraft,
  resolveTopic: (topicRef: string) => TopicResolution,
  topicIdByKey: Map<string, string>,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumMisconceptionRule[] {
  const misconceptionRules: CurriculumMisconceptionRule[] = [];

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

    const ruleId = `misconception-${slugify(
      `${block.values.topicRef}-${index + 1}`
    )}`;
    traces.push({
      entityType: "misconception_rule",
      entityKey: ruleId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    misconceptionRules.push({
      id: ruleId,
      topicId: topicIdByKey.get(resolved.topic.key) as string,
      description: block.values.description,
      triggerPatterns: block.values.triggerPatterns,
      correctionGuidance: block.values.correctionGuidance,
      severity: block.values.severity ?? 2,
    });
  });

  return misconceptionRules;
}

function normalizeTaskRules(
  draft: CurriculumExtractedDraft,
  resolveTopic: (topicRef: string) => TopicResolution,
  topicIdByKey: Map<string, string>,
  errors: CurriculumNormalizationIssue[],
  traces: CurriculumNormalizationTrace[]
): CurriculumTaskRule[] {
  const taskRules: CurriculumTaskRule[] = [];

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

    const ruleId = `task-rule-${slugify(
      `${block.values.taskType}-${block.values.title}-${index + 1}`
    )}`;
    traces.push({
      entityType: "task_rule",
      entityKey: ruleId,
      origin: "source",
      provenance: dedupeProvenance(block.provenance),
    });

    taskRules.push({
      id: ruleId,
      taskType: block.values.taskType,
      topicId,
      title: block.values.title,
      guidance: block.values.guidance,
      conditions: block.values.conditions,
      priority: block.values.priority,
    });
  });

  return taskRules;
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

  const sourceError = directResult.error;
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

  const components = buildComponents(draft, traces);
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
    normalizedTopics.topics,
    draft,
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
