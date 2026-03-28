import type { ZodIssue } from "zod";
import {
  buildLegacyCurriculumPackage,
  legacyQualificationSeedSchema,
} from "./legacy";
import type {
  CurriculumPackage,
  CurriculumPackageLifecycle,
} from "./schema";
import { curriculumPackageSchema } from "./schema";

type ValidationSeverity = "error" | "warning";
type NormalizedInputKind = "package" | "legacy_seed";

export interface CurriculumValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface CurriculumValidationStats {
  components: number;
  topics: number;
  edges: number;
  commandWords: number;
  questionTypes: number;
  misconceptionRules: number;
  taskRules: number;
  sourceMappings: number;
  sources: number;
}

export interface CurriculumValidationReport {
  ok: boolean;
  packageId: string | null;
  lifecycle: CurriculumPackageLifecycle | null;
  normalizedFrom: NormalizedInputKind | null;
  errors: CurriculumValidationIssue[];
  warnings: CurriculumValidationIssue[];
  stats: CurriculumValidationStats;
  package: CurriculumPackage | null;
}

function emptyStats(): CurriculumValidationStats {
  return {
    components: 0,
    topics: 0,
    edges: 0,
    commandWords: 0,
    questionTypes: 0,
    misconceptionRules: 0,
    taskRules: 0,
    sourceMappings: 0,
    sources: 0,
  };
}

function formatZodIssues(
  issues: ZodIssue[],
  codePrefix: string
): CurriculumValidationIssue[] {
  return issues.map((issue) => ({
    severity: "error",
    code: `${codePrefix}.${issue.code}`,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function createIssueCollector() {
  const errors: CurriculumValidationIssue[] = [];
  const warnings: CurriculumValidationIssue[] = [];

  return {
    errors,
    warnings,
    add(
      severity: ValidationSeverity,
      code: string,
      path: string,
      message: string
    ): void {
      const issue = { severity, code, path, message };
      if (severity === "error") {
        errors.push(issue);
        return;
      }
      warnings.push(issue);
    },
  };
}

function collectDuplicates(
  values: string[],
  reportDuplicate: (value: string) => void,
  normalizeValue: (value: string) => string = (value) => value
): void {
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeValue(value);
    if (seen.has(normalized)) {
      reportDuplicate(value);
      continue;
    }
    seen.add(normalized);
  }
}

function validateLifecycleRules(
  curriculumPackage: CurriculumPackage,
  addIssue: ReturnType<typeof createIssueCollector>["add"]
): void {
  const approvedReviewers = curriculumPackage.review.reviewers.filter(
    (reviewer) =>
      reviewer.role === "human" && reviewer.outcome === "approved"
  );
  const isApprovedLifecycle =
    curriculumPackage.lifecycle === "approved" ||
    curriculumPackage.lifecycle === "reference";

  if (isApprovedLifecycle) {
    if (curriculumPackage.review.status !== "approved") {
      addIssue(
        "error",
        "review.status_required",
        "review.status",
        "Approved and reference packages must have review status approved"
      );
    }
    if (!curriculumPackage.review.approvedAt) {
      addIssue(
        "error",
        "review.approved_at_required",
        "review.approvedAt",
        "Approved and reference packages must record approvedAt"
      );
    }
    if (approvedReviewers.length === 0) {
      addIssue(
        "error",
        "review.human_signoff_required",
        "review.reviewers",
        "Approved and reference packages need at least one human reviewer approval"
      );
    }
  } else if (
    curriculumPackage.review.status === "approved" ||
    curriculumPackage.review.approvedAt
  ) {
    addIssue(
      "error",
      "review.lifecycle_mismatch",
      "review",
      "Legacy and candidate packages cannot be marked approved"
    );
  }

  if (curriculumPackage.lifecycle === "reference") {
    if (!curriculumPackage.review.referenceNotes) {
      addIssue(
        "error",
        "review.reference_notes_required",
        "review.referenceNotes",
        "Reference packages must explain why they are the exemplar"
      );
    }

    const hasPrimarySource = curriculumPackage.provenance.sources.some(
      (source) => source.authority === "primary"
    );
    if (!hasPrimarySource) {
      addIssue(
        "error",
        "provenance.primary_source_required",
        "provenance.sources",
        "Reference packages need at least one primary source"
      );
    }
  }
}

function validateCollectionUniqueness(
  curriculumPackage: CurriculumPackage,
  addIssue: ReturnType<typeof createIssueCollector>["add"]
): void {
  collectDuplicates(
    curriculumPackage.components.map((component) => component.id),
    (value) =>
      addIssue(
        "error",
        "components.duplicate_id",
        "components",
        `Duplicate component id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.components.map((component) => component.code),
    (value) =>
      addIssue(
        "error",
        "components.duplicate_code",
        "components",
        `Duplicate component code: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.topics.map((topic) => topic.id),
    (value) =>
      addIssue(
        "error",
        "topics.duplicate_id",
        "topics",
        `Duplicate topic id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.topics
      .map((topic) => topic.code)
      .filter((code): code is string => Boolean(code)),
    (value) =>
      addIssue(
        "error",
        "topics.duplicate_code",
        "topics",
        `Duplicate topic code: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.commandWords.map((commandWord) => commandWord.id),
    (value) =>
      addIssue(
        "error",
        "command_words.duplicate_id",
        "commandWords",
        `Duplicate command word id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.commandWords.map((commandWord) => commandWord.word),
    (value) =>
      addIssue(
        "error",
        "command_words.duplicate_word",
        "commandWords",
        `Duplicate command word: ${value}`
      ),
    (value) => value.toLowerCase()
  );
  collectDuplicates(
    curriculumPackage.questionTypes.map((questionType) => questionType.id),
    (value) =>
      addIssue(
        "error",
        "question_types.duplicate_id",
        "questionTypes",
        `Duplicate question type id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.questionTypes.map((questionType) => questionType.name),
    (value) =>
      addIssue(
        "error",
        "question_types.duplicate_name",
        "questionTypes",
        `Duplicate question type name: ${value}`
      ),
    (value) => value.toLowerCase()
  );
  collectDuplicates(
    curriculumPackage.misconceptionRules.map((rule) => rule.id),
    (value) =>
      addIssue(
        "error",
        "misconceptions.duplicate_id",
        "misconceptionRules",
        `Duplicate misconception rule id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.taskRules.map((rule) => rule.id),
    (value) =>
      addIssue(
        "error",
        "task_rules.duplicate_id",
        "taskRules",
        `Duplicate task rule id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.sourceMappings.map((mapping) => mapping.id),
    (value) =>
      addIssue(
        "error",
        "source_mappings.duplicate_id",
        "sourceMappings",
        `Duplicate source mapping id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.provenance.sources.map((source) => source.id),
    (value) =>
      addIssue(
        "error",
        "sources.duplicate_id",
        "provenance.sources",
        `Duplicate source id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.annotations?.markSchemePatterns.map((pattern) => pattern.id) ??
      [],
    (value) =>
      addIssue(
        "error",
        "annotations.duplicate_mark_scheme_pattern_id",
        "annotations.markSchemePatterns",
        `Duplicate mark scheme pattern id: ${value}`
      )
  );
  collectDuplicates(
    curriculumPackage.annotations?.examTechniquePatterns.map(
      (pattern) => pattern.id
    ) ?? [],
    (value) =>
      addIssue(
        "error",
        "annotations.duplicate_exam_technique_pattern_id",
        "annotations.examTechniquePatterns",
        `Duplicate exam technique pattern id: ${value}`
      )
  );
}

function validateTopicGraph(
  curriculumPackage: CurriculumPackage,
  addIssue: ReturnType<typeof createIssueCollector>["add"]
): void {
  const topicMap = new Map(
    curriculumPackage.topics.map((topic) => [topic.id, topic])
  );
  const seenSiblingSortOrders = new Set<string>();
  const duplicateEdgeKeys = new Set<string>();
  const cycleNodes = new Set<string>();

  for (const topic of curriculumPackage.topics) {
    if (topic.parentId === null && topic.depth !== 0) {
      addIssue(
        "error",
        "topics.root_depth_mismatch",
        `topics.${topic.id}.depth`,
        `Root topic ${topic.id} must have depth 0`
      );
    }

    if (topic.parentId) {
      const parentTopic = topicMap.get(topic.parentId);
      if (!parentTopic) {
        addIssue(
          "error",
          "topics.parent_missing",
          `topics.${topic.id}.parentId`,
          `Topic ${topic.id} references missing parent ${topic.parentId}`
        );
      } else if (topic.depth !== parentTopic.depth + 1) {
        addIssue(
          "error",
          "topics.depth_mismatch",
          `topics.${topic.id}.depth`,
          `Topic ${topic.id} depth ${topic.depth} does not match parent depth ${parentTopic.depth}`
        );
      }
    }

    const sortKey = `${topic.parentId ?? "root"}:${topic.sortOrder}`;
    if (seenSiblingSortOrders.has(sortKey)) {
      addIssue(
        "error",
        "topics.duplicate_sort_order",
        `topics.${topic.id}.sortOrder`,
        `Sibling sort order ${topic.sortOrder} is duplicated under ${topic.parentId ?? "root"}`
      );
    } else {
      seenSiblingSortOrders.add(sortKey);
    }
  }

  for (const topic of curriculumPackage.topics) {
    let currentId: string | null = topic.id;
    const path = new Set<string>();

    while (currentId) {
      if (path.has(currentId)) {
        if (!cycleNodes.has(currentId)) {
          cycleNodes.add(currentId);
          addIssue(
            "error",
            "topics.cycle_detected",
            `topics.${topic.id}.parentId`,
            `Cycle detected in topic ancestry at ${currentId}`
          );
        }
        break;
      }

      path.add(currentId);
      const currentTopic = topicMap.get(currentId);
      if (!currentTopic?.parentId) {
        break;
      }
      currentId = currentTopic.parentId;
    }
  }

  for (const edge of curriculumPackage.edges) {
    if (!topicMap.has(edge.fromTopicId)) {
      addIssue(
        "error",
        "edges.from_topic_missing",
        "edges",
        `Edge references missing fromTopicId ${edge.fromTopicId}`
      );
    }
    if (!topicMap.has(edge.toTopicId)) {
      addIssue(
        "error",
        "edges.to_topic_missing",
        "edges",
        `Edge references missing toTopicId ${edge.toTopicId}`
      );
    }
    if (edge.fromTopicId === edge.toTopicId) {
      addIssue(
        "error",
        "edges.self_loop",
        "edges",
        `Edge ${edge.fromTopicId} cannot point to itself`
      );
    }

    const edgeKey = `${edge.fromTopicId}|${edge.toTopicId}|${edge.type}`;
    if (duplicateEdgeKeys.has(edgeKey)) {
      addIssue(
        "error",
        "edges.duplicate",
        "edges",
        `Duplicate edge ${edgeKey}`
      );
    } else {
      duplicateEdgeKeys.add(edgeKey);
    }
  }
}

function validateCrossReferences(
  curriculumPackage: CurriculumPackage,
  addIssue: ReturnType<typeof createIssueCollector>["add"]
): void {
  const topicIds = new Set(curriculumPackage.topics.map((topic) => topic.id));
  const componentIds = new Set(
    curriculumPackage.components.map((component) => component.id)
  );
  const commandWordIds = new Set(
    curriculumPackage.commandWords.map((commandWord) => commandWord.id)
  );
  const questionTypeIds = new Set(
    curriculumPackage.questionTypes.map((questionType) => questionType.id)
  );
  const sourceIds = new Set(
    curriculumPackage.provenance.sources.map((source) => source.id)
  );

  curriculumPackage.misconceptionRules.forEach((rule) => {
    if (!topicIds.has(rule.topicId)) {
      addIssue(
        "error",
        "misconceptions.topic_missing",
        `misconceptionRules.${rule.id}.topicId`,
        `Misconception rule ${rule.id} references unknown topic ${rule.topicId}`
      );
    }
  });

  curriculumPackage.taskRules.forEach((rule) => {
    if (rule.topicId && !topicIds.has(rule.topicId)) {
      addIssue(
        "error",
        "task_rules.topic_missing",
        `taskRules.${rule.id}.topicId`,
        `Task rule ${rule.id} references unknown topic ${rule.topicId}`
      );
    }
  });

  const taskRuleCountsByTopicId = new Map<string, number>();
  curriculumPackage.taskRules.forEach((rule) => {
    if (!rule.topicId) {
      return;
    }

    const nextCount = (taskRuleCountsByTopicId.get(rule.topicId) ?? 0) + 1;
    taskRuleCountsByTopicId.set(rule.topicId, nextCount);
  });
  for (const [topicId, count] of taskRuleCountsByTopicId.entries()) {
    if (count <= 5) {
      continue;
    }

    addIssue(
      "error",
      "task_rules.topic_rule_limit",
      "taskRules",
      `Topic ${topicId} has ${count} task rules, but the current scheduler contract supports at most 5 topic-scoped rules per topic`
    );
  }

  curriculumPackage.sourceMappings.forEach((mapping) => {
    if (!topicIds.has(mapping.topicId)) {
      addIssue(
        "error",
        "source_mappings.topic_missing",
        `sourceMappings.${mapping.id}.topicId`,
        `Source mapping ${mapping.id} references unknown topic ${mapping.topicId}`
      );
    }
    if (!sourceIds.has(mapping.sourceId)) {
      addIssue(
        "error",
        "source_mappings.source_missing",
        `sourceMappings.${mapping.id}.sourceId`,
        `Source mapping ${mapping.id} references unknown source ${mapping.sourceId}`
      );
    }
  });

  curriculumPackage.annotations?.markSchemePatterns.forEach((pattern) => {
    if (pattern.componentId && !componentIds.has(pattern.componentId)) {
      addIssue(
        "error",
        "annotations.component_missing",
        `annotations.markSchemePatterns.${pattern.id}.componentId`,
        `Mark scheme pattern ${pattern.id} references unknown component ${pattern.componentId}`
      );
    }
    if (
      pattern.questionTypeId &&
      !questionTypeIds.has(pattern.questionTypeId)
    ) {
      addIssue(
        "error",
        "annotations.question_type_missing",
        `annotations.markSchemePatterns.${pattern.id}.questionTypeId`,
        `Mark scheme pattern ${pattern.id} references unknown question type ${pattern.questionTypeId}`
      );
    }
  });

  curriculumPackage.annotations?.examTechniquePatterns.forEach((pattern) => {
    if (pattern.commandWordId && !commandWordIds.has(pattern.commandWordId)) {
      addIssue(
        "error",
        "annotations.command_word_missing",
        `annotations.examTechniquePatterns.${pattern.id}.commandWordId`,
        `Exam technique pattern ${pattern.id} references unknown command word ${pattern.commandWordId}`
      );
    }
  });
}

function validateCompleteness(
  curriculumPackage: CurriculumPackage,
  addIssue: ReturnType<typeof createIssueCollector>["add"]
): void {
  const requiredCollections = [
    {
      key: "commandWords",
      count: curriculumPackage.commandWords.length,
      label: "command words",
    },
    {
      key: "questionTypes",
      count: curriculumPackage.questionTypes.length,
      label: "question types",
    },
    {
      key: "misconceptionRules",
      count: curriculumPackage.misconceptionRules.length,
      label: "misconception rules",
    },
    {
      key: "taskRules",
      count: curriculumPackage.taskRules.length,
      label: "task rules",
    },
    {
      key: "sourceMappings",
      count: curriculumPackage.sourceMappings.length,
      label: "source mapping hints",
    },
    {
      key: "provenance.sources",
      count: curriculumPackage.provenance.sources.length,
      label: "sources",
    },
  ];

  const isApprovedLifecycle =
    curriculumPackage.lifecycle === "approved" ||
    curriculumPackage.lifecycle === "reference";

  requiredCollections.forEach(({ key, count, label }) => {
    if (count > 0) {
      return;
    }

    addIssue(
      isApprovedLifecycle ? "error" : "warning",
      `completeness.${key.replace(/\./g, "_")}`,
      key,
      `Package is missing ${label}`
    );
  });

  const totalWeight = curriculumPackage.components.reduce(
    (sum, component) => sum + component.weightPercent,
    0
  );
  if (Math.abs(totalWeight - 100) > 0.001) {
    addIssue(
      "warning",
      "components.weight_percent_total",
      "components",
      `Assessment component weights total ${totalWeight}, expected 100`
    );
  }

  if (curriculumPackage.metadata.updatedAt) {
    const generatedAt = Date.parse(curriculumPackage.metadata.generatedAt);
    const updatedAt = Date.parse(curriculumPackage.metadata.updatedAt);

    if (!Number.isNaN(generatedAt) && !Number.isNaN(updatedAt)) {
      if (updatedAt < generatedAt) {
        addIssue(
          "error",
          "metadata.updated_before_generated",
          "metadata.updatedAt",
          "updatedAt cannot be earlier than generatedAt"
        );
      }
    }
  }
}

export function normalizeCurriculumInput(input: unknown): {
  package: CurriculumPackage | null;
  normalizedFrom: NormalizedInputKind | null;
  issues: CurriculumValidationIssue[];
} {
  const packageResult = curriculumPackageSchema.safeParse(input);
  if (packageResult.success) {
    return {
      package: packageResult.data,
      normalizedFrom: "package",
      issues: [],
    };
  }

  const legacyResult = legacyQualificationSeedSchema.safeParse(input);
  if (legacyResult.success) {
    return {
      package: buildLegacyCurriculumPackage(legacyResult.data),
      normalizedFrom: "legacy_seed",
      issues: [],
    };
  }

  const isRecord = typeof input === "object" && input !== null;
  const likelyLegacyInput =
    isRecord && "subject" in input && "examBoard" in input;
  const likelyPackageInput =
    isRecord && "schemaVersion" in input && "lifecycle" in input;

  return {
    package: null,
    normalizedFrom: likelyLegacyInput
      ? "legacy_seed"
      : likelyPackageInput
        ? "package"
        : null,
    issues: likelyLegacyInput
      ? formatZodIssues(legacyResult.error.issues, "legacy_seed")
      : formatZodIssues(packageResult.error.issues, "package"),
  };
}

export function validateCurriculumPackage(
  input: unknown
): CurriculumValidationReport {
  const normalized = normalizeCurriculumInput(input);
  if (!normalized.package) {
    return {
      ok: false,
      packageId: null,
      lifecycle: null,
      normalizedFrom: normalized.normalizedFrom,
      errors: normalized.issues,
      warnings: [],
      stats: emptyStats(),
      package: null,
    };
  }

  const issueCollector = createIssueCollector();
  const curriculumPackage = normalized.package;

  validateLifecycleRules(curriculumPackage, issueCollector.add);
  validateCollectionUniqueness(curriculumPackage, issueCollector.add);
  validateTopicGraph(curriculumPackage, issueCollector.add);
  validateCrossReferences(curriculumPackage, issueCollector.add);
  validateCompleteness(curriculumPackage, issueCollector.add);

  return {
    ok: issueCollector.errors.length === 0,
    packageId: curriculumPackage.metadata.packageId,
    lifecycle: curriculumPackage.lifecycle,
    normalizedFrom: normalized.normalizedFrom,
    errors: issueCollector.errors,
    warnings: issueCollector.warnings,
    stats: {
      components: curriculumPackage.components.length,
      topics: curriculumPackage.topics.length,
      edges: curriculumPackage.edges.length,
      commandWords: curriculumPackage.commandWords.length,
      questionTypes: curriculumPackage.questionTypes.length,
      misconceptionRules: curriculumPackage.misconceptionRules.length,
      taskRules: curriculumPackage.taskRules.length,
      sourceMappings: curriculumPackage.sourceMappings.length,
      sources: curriculumPackage.provenance.sources.length,
    },
    package: curriculumPackage,
  };
}

export function formatValidationReport(
  report: CurriculumValidationReport
): string {
  const lines: string[] = [];

  if (!report.package) {
    lines.push(
      report.normalizedFrom
        ? `Validation failed | Input: ${report.normalizedFrom}`
        : "Validation failed"
    );
  } else {
    lines.push(
      [
        `Package: ${report.packageId}`,
        `Lifecycle: ${report.lifecycle}`,
        `Input: ${report.normalizedFrom}`,
        report.ok ? "Status: OK" : "Status: FAILED",
      ].join(" | ")
    );
  }

  if (report.package) {
    lines.push(
      [
        `components=${report.stats.components}`,
        `topics=${report.stats.topics}`,
        `edges=${report.stats.edges}`,
        `commandWords=${report.stats.commandWords}`,
        `questionTypes=${report.stats.questionTypes}`,
        `misconceptions=${report.stats.misconceptionRules}`,
        `taskRules=${report.stats.taskRules}`,
        `sourceMappings=${report.stats.sourceMappings}`,
        `sources=${report.stats.sources}`,
      ].join(" ")
    );
  }

  if (report.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    report.errors.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.path || "<root>"}: ${issue.message}`
      );
    });
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    report.warnings.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.path || "<root>"}: ${issue.message}`
      );
    });
  }

  return lines.join("\n");
}
