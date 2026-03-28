import type {
  CurriculumAssessmentComponent,
  CurriculumCommandWord,
  CurriculumPackage,
  CurriculumQuestionType,
  CurriculumTopic,
  CurriculumTopicEdge,
} from "./schema";
import type {
  CurriculumValidationIssue,
  CurriculumValidationReport,
} from "./validation";
import { validateCurriculumPackage } from "./validation";

export interface CurriculumRenderedReviewReport {
  report: CurriculumValidationReport;
  text: string;
}

const edgeTypeOrder: Record<CurriculumTopicEdge["type"], number> = {
  prerequisite: 0,
  builds_on: 1,
  related: 2,
};

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sanitizeInlineText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((segment) => segment.trim().replace(/\s+/g, " "))
    .filter((segment) => segment.length > 0)
    .join(" / ");
}

function formatValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "not set";
  }

  if (typeof value === "string") {
    const sanitized = sanitizeInlineText(value);
    return sanitized.length > 0 ? sanitized : "not set";
  }

  return String(value);
}

function formatListValue(values: string[]): string {
  const sanitizedValues = values
    .map((value) => sanitizeInlineText(value))
    .filter((value) => value.length > 0);

  return sanitizedValues.length > 0 ? sanitizedValues.join("; ") : "none";
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatTopicLabel(topic: CurriculumTopic): string {
  return topic.code
    ? `${topic.code} ${formatValue(topic.name)}`
    : formatValue(topic.name);
}

function topicSortKey(topic: CurriculumTopic): string {
  return `${topic.code ?? ""}|${formatValue(topic.name)}|${topic.id}`;
}

function compareTopics(left: CurriculumTopic, right: CurriculumTopic): number {
  return (
    left.sortOrder - right.sortOrder ||
    compareText(topicSortKey(left), topicSortKey(right))
  );
}

function compareQuestionTypes(
  left: CurriculumQuestionType,
  right: CurriculumQuestionType
): number {
  return compareText(
    `${formatValue(left.name)}|${left.id}`,
    `${formatValue(right.name)}|${right.id}`
  );
}

function compareIssues(
  left: CurriculumValidationIssue,
  right: CurriculumValidationIssue
): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function formatValidationStatus(report: CurriculumValidationReport): string {
  if (report.errors.length > 0) {
    return `FAILED (${pluralize(report.errors.length, "error")}, ${pluralize(report.warnings.length, "warning")})`;
  }

  if (report.warnings.length > 0) {
    return `WARNINGS (${pluralize(report.warnings.length, "warning")})`;
  }

  return "OK";
}

function formatTopicReference(
  topicMap: Map<string, CurriculumTopic>,
  topicId: string
): string {
  const topic = topicMap.get(topicId);
  if (!topic) {
    return `${topicId} [missing topic]`;
  }

  return formatTopicLabel(topic);
}

function formatComponentReference(
  componentMap: Map<string, CurriculumAssessmentComponent>,
  componentId: string
): string {
  const component = componentMap.get(componentId);
  if (!component) {
    return `${componentId} [missing component]`;
  }

  return `${component.code} ${formatValue(component.name)}`;
}

function formatQuestionTypeReference(
  questionTypeMap: Map<string, CurriculumQuestionType>,
  questionTypeId: string
): string {
  const questionType = questionTypeMap.get(questionTypeId);
  if (!questionType) {
    return `${questionTypeId} [missing question type]`;
  }

  return formatValue(questionType.name);
}

function formatCommandWordReference(
  commandWordMap: Map<string, CurriculumCommandWord>,
  commandWordId: string
): string {
  const commandWord = commandWordMap.get(commandWordId);
  if (!commandWord) {
    return `${commandWordId} [missing command word]`;
  }

  return formatValue(commandWord.word);
}

function pushList(
  lines: string[],
  heading: string,
  items: string[],
  emptyLabel = "None."
): void {
  lines.push(heading);

  if (items.length === 0) {
    lines.push(`- ${emptyLabel}`);
    lines.push("");
    return;
  }

  items.forEach((item) => {
    lines.push(item);
  });
  lines.push("");
}

function formatPackageSummary(report: CurriculumValidationReport): string[] {
  const curriculumPackage = report.package;
  const generatedAt =
    report.normalizedFrom === "legacy_seed"
      ? "legacy seed normalization runtime omitted for report stability"
      : curriculumPackage?.metadata.generatedAt;

  if (!curriculumPackage) {
    return [
      "## Package Metadata",
      `- Package: ${formatValue(report.packageId)}`,
      `- Input: ${formatValue(report.normalizedFrom)}`,
      `- Validation: ${formatValidationStatus(report)}`,
      "",
    ];
  }

  const lines = [
    "## Package Metadata",
    `- Package: ${curriculumPackage.metadata.packageId}`,
    `- Title: ${formatValue(curriculumPackage.metadata.title)}`,
    `- Lifecycle: ${curriculumPackage.lifecycle}`,
    `- Input: ${report.normalizedFrom}`,
    `- Validation: ${formatValidationStatus(report)}`,
    `- Schema version: ${curriculumPackage.schemaVersion}`,
    `- Package version: ${curriculumPackage.metadata.packageVersion}`,
    `- Generated at: ${formatValue(generatedAt)}`,
    `- Updated at: ${formatValue(curriculumPackage.metadata.updatedAt)}`,
    `- Summary: ${formatValue(curriculumPackage.metadata.summary)}`,
    "",
  ];

  if (report.normalizedFrom === "legacy_seed") {
    lines.splice(
      5,
      0,
      "- Normalization: legacy seed input was normalized into the canonical package shape before rendering"
    );
  }

  return lines;
}

function formatQualificationSummary(
  curriculumPackage: CurriculumPackage
): string[] {
  const generator = curriculumPackage.provenance.generatedBy;
  const lines = [
    "## Qualification Summary",
    `- Qualification: ${formatValue(curriculumPackage.qualification.name)} (${curriculumPackage.qualification.slug})`,
    `- Exam board: ${formatValue(curriculumPackage.qualification.examBoard.name)} (${curriculumPackage.qualification.examBoard.code})`,
    `- Subject: ${formatValue(curriculumPackage.qualification.subject.name)} (${curriculumPackage.qualification.subject.slug})`,
    `- Level: ${curriculumPackage.qualification.level}`,
    `- Version code: ${curriculumPackage.qualification.versionCode}`,
    `- First assessment year: ${formatValue(curriculumPackage.qualification.firstAssessmentYear)}`,
    `- First exam year: ${formatValue(curriculumPackage.qualification.firstExamYear)}`,
    `- Spec URL: ${formatValue(curriculumPackage.qualification.specUrl)}`,
    `- Review status: ${curriculumPackage.review.status}`,
    `- Approved at: ${formatValue(curriculumPackage.review.approvedAt)}`,
    `- Reviewers: ${curriculumPackage.review.reviewers.length}`,
    `- Provenance sources: ${curriculumPackage.provenance.sources.length}`,
    `- Derived from: ${curriculumPackage.provenance.derivedFrom.length}`,
    `- Generated by: ${generator ? `${generator.tool}${generator.version ? ` ${generator.version}` : ""}${generator.runId ? ` (run ${generator.runId})` : ""}` : "not set"}`,
  ];

  const reviewers = [...curriculumPackage.review.reviewers].sort(
    (left, right) =>
      compareText(
        `${left.reviewedAt}|${left.name}|${left.role}|${left.outcome}`,
        `${right.reviewedAt}|${right.name}|${right.role}|${right.outcome}`
      )
  );
  reviewers.forEach((reviewer) => {
    lines.push(
      `- Reviewer: ${formatValue(reviewer.name)} | ${reviewer.role} | ${reviewer.outcome} | ${reviewer.reviewedAt}${reviewer.notes ? ` | ${formatValue(reviewer.notes)}` : ""}`
    );
  });

  const sources = [...curriculumPackage.provenance.sources].sort((left, right) =>
    compareText(
      `${formatValue(left.title)}|${left.id}|${left.kind}|${left.authority}`,
      `${formatValue(right.title)}|${right.id}|${right.kind}|${right.authority}`
    )
  );
  sources.forEach((source) => {
    lines.push(
      `- Source: ${source.id} | ${source.authority} ${source.kind} | ${formatValue(source.title)}${source.uri ? ` | ${source.uri}` : ""}`
    );
  });

  const lineage = [...curriculumPackage.provenance.derivedFrom].sort(
    (left, right) =>
      compareText(
        `${left.packageId}|${left.relationship}`,
        `${right.packageId}|${right.relationship}`
      )
  );
  lineage.forEach((entry) => {
    lines.push(
      `- Derived from entry: ${entry.packageId} | ${entry.relationship}${entry.note ? ` | ${formatValue(entry.note)}` : ""}`
    );
  });

  lines.push("");

  return lines;
}

function formatComponentSummary(curriculumPackage: CurriculumPackage): string[] {
  const components = [...curriculumPackage.components].sort((left, right) =>
    compareText(
      `${left.code}|${formatValue(left.name)}|${left.id}`,
      `${right.code}|${formatValue(right.name)}|${right.id}`
    )
  );
  const totalWeight = components.reduce(
    (sum, component) => sum + component.weightPercent,
    0
  );
  const lines = [
    `## Component Summary (${pluralize(components.length, "component")}, total weight ${totalWeight}%)`,
  ];

  if (components.length === 0) {
    lines.push("- None.");
    lines.push("");
    return lines;
  }

  components.forEach((component) => {
    lines.push(
      `- ${component.code} | ${formatValue(component.name)} | ${component.weightPercent}% | ${component.durationMinutes ?? "?"}m | ${component.totalMarks ?? "?"} marks | ${component.isExam ? "exam" : "coursework"}`
    );
  });
  lines.push("");

  return lines;
}

function formatTopicTreeSummary(curriculumPackage: CurriculumPackage): string[] {
  const topicMap = new Map(
    curriculumPackage.topics.map((topic) => [topic.id, topic] as const)
  );
  const childrenByParent = new Map<string | null, CurriculumTopic[]>();

  curriculumPackage.topics.forEach((topic) => {
    const siblings = childrenByParent.get(topic.parentId) ?? [];
    siblings.push(topic);
    childrenByParent.set(topic.parentId, siblings);
  });

  childrenByParent.forEach((children) => {
    children.sort(compareTopics);
  });

  const roots = childrenByParent.get(null) ?? [];
  const leafCount = curriculumPackage.topics.filter(
    (topic) => (childrenByParent.get(topic.id) ?? []).length === 0
  ).length;
  const maxDepth = curriculumPackage.topics.reduce(
    (highestDepth, topic) => Math.max(highestDepth, topic.depth),
    0
  );
  const visited = new Set<string>();
  const lines = [
    `## Topic Tree Summary (${pluralize(curriculumPackage.topics.length, "topic")}, ${pluralize(roots.length, "root topic")}, ${pluralize(leafCount, "leaf topic")}, max depth ${maxDepth})`,
  ];

  function visitTopic(topic: CurriculumTopic, indentation: number): void {
    visited.add(topic.id);

    const metadata: string[] = [`id=${topic.id}`];
    if (topic.estimatedHours !== undefined) {
      metadata.push(`hours=${topic.estimatedHours}`);
    }
    if (topic.description) {
      metadata.push(`description=${formatValue(topic.description)}`);
    }

    lines.push(
      `${"  ".repeat(indentation)}- ${formatTopicLabel(topic)} [${metadata.join(", ")}]`
    );

    (childrenByParent.get(topic.id) ?? []).forEach((childTopic) => {
      visitTopic(childTopic, indentation + 1);
    });
  }

  roots.forEach((rootTopic) => {
    visitTopic(rootTopic, 0);
  });

  const unattachedTopics = [...topicMap.values()]
    .filter((topic) => !visited.has(topic.id))
    .sort(compareTopics);

  unattachedTopics.forEach((topic) => {
    lines.push(
      `- [unattached] ${formatTopicLabel(topic)} [id=${topic.id}, parentId=${formatValue(topic.parentId)}, depth=${topic.depth}]`
    );
  });

  if (curriculumPackage.topics.length === 0) {
    lines.push("- None.");
  }

  lines.push("");

  return lines;
}

function formatEdgeSummary(curriculumPackage: CurriculumPackage): string[] {
  const topicMap = new Map(
    curriculumPackage.topics.map((topic) => [topic.id, topic] as const)
  );
  const edges = [...curriculumPackage.edges].sort((left, right) => {
    return (
      edgeTypeOrder[left.type] - edgeTypeOrder[right.type] ||
      compareText(
        `${formatTopicReference(topicMap, left.fromTopicId)}|${formatTopicReference(topicMap, left.toTopicId)}|${left.type}`,
        `${formatTopicReference(topicMap, right.fromTopicId)}|${formatTopicReference(topicMap, right.toTopicId)}|${right.type}`
      )
    );
  });
  const typeCounts = Object.entries(
    edges.reduce<Record<CurriculumTopicEdge["type"], number>>(
      (counts, edge) => {
        counts[edge.type] += 1;
        return counts;
      },
      {
        prerequisite: 0,
        builds_on: 0,
        related: 0,
      }
    )
  ).map(([type, count]) => `${type} ${count}`);

  const lines = [
    `## Edge Summary (${pluralize(edges.length, "edge")})`,
    `- By type: ${typeCounts.join(", ")}`,
  ];

  if (edges.length === 0) {
    lines.push("- None.");
    lines.push("");
    return lines;
  }

  edges.forEach((edge) => {
    lines.push(
      `- ${edge.type}: ${formatTopicReference(topicMap, edge.fromTopicId)} -> ${formatTopicReference(topicMap, edge.toTopicId)}${edge.rationale ? ` | ${formatValue(edge.rationale)}` : ""}`
    );
  });
  lines.push("");

  return lines;
}

function formatCommandWordAndQuestionTypeSummary(
  curriculumPackage: CurriculumPackage
): string[] {
  const commandWords = [...curriculumPackage.commandWords].sort((left, right) =>
    compareText(`${formatValue(left.word)}|${left.id}`, `${formatValue(right.word)}|${right.id}`)
  );
  const questionTypes = [...curriculumPackage.questionTypes].sort(
    compareQuestionTypes
  );

  const lines: string[] = ["## Command Words and Question Types"];

  pushList(
    lines,
    `Command words (${pluralize(commandWords.length, "command word")})`,
    commandWords.map(
      (commandWord) =>
        `- ${formatValue(commandWord.word)} | depth ${commandWord.expectedDepth} | ${formatValue(commandWord.definition)}${commandWord.guidance ? ` | guidance: ${formatValue(commandWord.guidance)}` : ""}`
    )
  );
  pushList(
    lines,
    `Question types (${pluralize(questionTypes.length, "question type")})`,
    questionTypes.map(
      (questionType) =>
        `- ${formatValue(questionType.name)}${questionType.typicalMarks ? ` | typical marks ${questionType.typicalMarks}` : ""}${questionType.description ? ` | ${formatValue(questionType.description)}` : ""}${questionType.markSchemePattern ? ` | mark scheme: ${formatValue(questionType.markSchemePattern)}` : ""}`
    )
  );

  return lines;
}

function formatPedagogicalSummary(curriculumPackage: CurriculumPackage): string[] {
  const topicMap = new Map(
    curriculumPackage.topics.map((topic) => [topic.id, topic] as const)
  );
  const sourceMap = new Map(
    curriculumPackage.provenance.sources.map((source) => [source.id, source] as const)
  );
  const misconceptions = [...curriculumPackage.misconceptionRules].sort(
    (left, right) =>
      compareText(
        `${formatTopicReference(topicMap, left.topicId)}|${left.id}`,
        `${formatTopicReference(topicMap, right.topicId)}|${right.id}`
      )
  );
  const taskRules = [...curriculumPackage.taskRules].sort((left, right) =>
    compareText(
      `${left.priority}|${left.taskType}|${left.topicId ?? ""}|${left.id}`,
      `${right.priority}|${right.taskType}|${right.topicId ?? ""}|${right.id}`
    )
  );
  const sourceMappings = [...curriculumPackage.sourceMappings].sort(
    (left, right) =>
      compareText(
        `${left.sourceId}|${left.topicId}|${left.locator}|${left.id}`,
        `${right.sourceId}|${right.topicId}|${right.locator}|${right.id}`
      )
  );

  const lines: string[] = ["## Misconceptions, Task Rules, and Source Mappings"];

  pushList(
    lines,
    `Misconception rules (${pluralize(misconceptions.length, "rule")})`,
    misconceptions.map((rule) => {
      const detailLines = [
        `- ${formatTopicReference(topicMap, rule.topicId)} | severity ${rule.severity} | ${formatValue(rule.description)}`,
        `  triggers: ${formatListValue(rule.triggerPatterns)}`,
        `  correction: ${formatValue(rule.correctionGuidance)}`,
      ];

      return detailLines.join("\n");
    })
  );
  pushList(
    lines,
    `Task rules (${pluralize(taskRules.length, "rule")})`,
    taskRules.map((rule) => {
      const detailLines = [
        `- ${rule.topicId ? formatTopicReference(topicMap, rule.topicId) : "global"} | ${rule.priority} ${rule.taskType} | ${formatValue(rule.title)}`,
        `  guidance: ${formatValue(rule.guidance)}`,
        `  conditions: ${formatListValue(rule.conditions)}`,
      ];

      return detailLines.join("\n");
    })
  );
  pushList(
    lines,
    `Source mappings (${pluralize(sourceMappings.length, "mapping")})`,
    sourceMappings.map((mapping) => {
      const source = sourceMap.get(mapping.sourceId);
      const detailLines = [
        `- ${source ? `${formatValue(source.title)} (${mapping.sourceId})` : mapping.sourceId} -> ${formatTopicReference(topicMap, mapping.topicId)} | ${mapping.confidence} | ${formatValue(mapping.locator)}`,
      ];

      if (mapping.excerptHint) {
        detailLines.push(`  excerpt: ${formatValue(mapping.excerptHint)}`);
      }

      return detailLines.join("\n");
    })
  );

  return lines;
}

function formatAnnotationSummary(curriculumPackage: CurriculumPackage): string[] {
  const questionTypeMap = new Map(
    curriculumPackage.questionTypes.map((questionType) => [
      questionType.id,
      questionType,
    ] as const)
  );
  const componentMap = new Map(
    curriculumPackage.components.map((component) => [component.id, component] as const)
  );
  const commandWordMap = new Map(
    curriculumPackage.commandWords.map((commandWord) => [
      commandWord.id,
      commandWord,
    ] as const)
  );
  const markSchemePatterns = [
    ...(curriculumPackage.annotations?.markSchemePatterns ?? []),
  ].sort((left, right) =>
    compareText(`${formatValue(left.label)}|${left.id}`, `${formatValue(right.label)}|${right.id}`)
  );
  const examTechniquePatterns = [
    ...(curriculumPackage.annotations?.examTechniquePatterns ?? []),
  ].sort((left, right) =>
    compareText(`${formatValue(left.label)}|${left.id}`, `${formatValue(right.label)}|${right.id}`)
  );
  const lines: string[] = ["## Annotations"];

  pushList(
    lines,
    `Mark scheme patterns (${pluralize(markSchemePatterns.length, "pattern")})`,
    markSchemePatterns.map((pattern) => {
      const references: string[] = [];

      if (pattern.questionTypeId) {
        references.push(
          `question type: ${formatQuestionTypeReference(questionTypeMap, pattern.questionTypeId)}`
        );
      }
      if (pattern.componentId) {
        references.push(
          `component: ${formatComponentReference(componentMap, pattern.componentId)}`
        );
      }

      return `- ${formatValue(pattern.label)} | ${formatValue(pattern.description)}${references.length > 0 ? ` | ${references.join(" | ")}` : ""}`;
    })
  );
  pushList(
    lines,
    `Exam technique patterns (${pluralize(examTechniquePatterns.length, "pattern")})`,
    examTechniquePatterns.map((pattern) => {
      const references: string[] = [];

      if (pattern.commandWordId) {
        references.push(
          `command word: ${formatCommandWordReference(commandWordMap, pattern.commandWordId)}`
        );
      }

      return `- ${formatValue(pattern.label)} | ${formatValue(pattern.description)}${references.length > 0 ? ` | ${references.join(" | ")}` : ""}`;
    })
  );

  return lines;
}

function formatValidationSection(report: CurriculumValidationReport): string[] {
  const errors = [...report.errors].sort(compareIssues);
  const warnings = [...report.warnings].sort(compareIssues);
  const lines = [
    "## Validation",
    `- Status: ${formatValidationStatus(report)}`,
    `- Errors: ${errors.length}`,
    `- Warnings: ${warnings.length}`,
  ];

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("- No validation warnings or errors.");
    lines.push("");
    return lines;
  }

  if (errors.length > 0) {
    lines.push("Errors:");
    errors.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.path || "<root>"}: ${issue.message}`
      );
    });
  }

  if (warnings.length > 0) {
    lines.push("Warnings:");
    warnings.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.path || "<root>"}: ${issue.message}`
      );
    });
  }

  lines.push("");

  return lines;
}

export function formatCurriculumReviewReport(
  report: CurriculumValidationReport
): string {
  const lines = [
    "# Curriculum Review Report",
    "",
    ...formatPackageSummary(report),
  ];

  if (report.package) {
    lines.push(
      ...formatQualificationSummary(report.package),
      ...formatComponentSummary(report.package),
      ...formatTopicTreeSummary(report.package),
      ...formatEdgeSummary(report.package),
      ...formatCommandWordAndQuestionTypeSummary(report.package),
      ...formatPedagogicalSummary(report.package),
      ...formatAnnotationSummary(report.package)
    );
  }

  lines.push(...formatValidationSection(report));

  return lines.join("\n").trimEnd();
}

export function renderCurriculumReviewReport(
  input: unknown
): CurriculumRenderedReviewReport {
  const report = validateCurriculumPackage(input);

  return {
    report,
    text: formatCurriculumReviewReport(report),
  };
}
