import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  curriculumEdgeTypeSchema,
  curriculumGeneratorSchema,
  curriculumLineageSchema,
  curriculumSourceSchema,
  curriculumTaskTypeSchema,
} from "./schema";

const nonEmptyStringSchema = z.string().trim().min(1);
const strictObject = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).strict();
const slugSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Expected a lowercase slug with hyphen separators"
  );
const isoDatetimeSchema = z.string().datetime({ offset: true });
const prioritySchema = z.enum(["low", "medium", "high"]);

const recordTextSourceContentSchema = z.union([
  strictObject({
    format: z.literal("record_text"),
    text: nonEmptyStringSchema,
  }),
  strictObject({
    format: z.literal("record_text"),
    path: nonEmptyStringSchema,
    encoding: z.literal("utf8").optional(),
  }),
]);

export const curriculumSourceMaterialSchema = strictObject({
  source: curriculumSourceSchema,
  content: recordTextSourceContentSchema,
});

export const curriculumExtractionRequestSchema = strictObject({
  derivedFrom: z.array(curriculumLineageSchema).default([]),
  generatedBy: curriculumGeneratorSchema.optional(),
  sources: z.array(curriculumSourceMaterialSchema).min(1),
});

export const curriculumDraftCitationSchema = strictObject({
  sourceId: slugSchema,
  locator: nonEmptyStringSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  excerpt: nonEmptyStringSchema,
});

export const curriculumExtractedMetadataValuesSchema = strictObject({
  packageId: slugSchema.optional(),
  packageVersion: nonEmptyStringSchema.optional(),
  title: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  generatedAt: isoDatetimeSchema.optional(),
  updatedAt: isoDatetimeSchema.optional(),
});

export const curriculumExtractedQualificationValuesSchema = strictObject({
  name: nonEmptyStringSchema.optional(),
  slug: slugSchema.optional(),
  level: nonEmptyStringSchema.optional(),
  versionCode: nonEmptyStringSchema.optional(),
  firstAssessmentYear: z.number().int().positive().nullable().optional(),
  firstExamYear: z.number().int().positive().nullable().optional(),
  specUrl: z.string().url().optional(),
  subject: strictObject({
    name: nonEmptyStringSchema.optional(),
    slug: slugSchema.optional(),
  }).optional(),
  examBoard: strictObject({
    name: nonEmptyStringSchema.optional(),
    code: nonEmptyStringSchema.optional(),
  }).optional(),
});

export const curriculumExtractedComponentValuesSchema = strictObject({
  name: nonEmptyStringSchema,
  code: nonEmptyStringSchema,
  weightPercent: z.number().min(0).max(100),
  durationMinutes: z.number().int().positive().optional(),
  totalMarks: z.number().int().positive().optional(),
  isExam: z.boolean(),
});

export const curriculumExtractedTopicValuesSchema = strictObject({
  name: nonEmptyStringSchema,
  code: nonEmptyStringSchema.optional(),
  parentRef: nonEmptyStringSchema.optional(),
  sortOrder: z.number().int().positive().optional(),
  description: nonEmptyStringSchema.optional(),
  estimatedHours: z.number().positive().optional(),
});

export const curriculumExtractedEdgeValuesSchema = strictObject({
  fromTopicRef: nonEmptyStringSchema,
  toTopicRef: nonEmptyStringSchema,
  type: curriculumEdgeTypeSchema,
  rationale: nonEmptyStringSchema.optional(),
});

export const curriculumExtractedCommandWordValuesSchema = strictObject({
  word: nonEmptyStringSchema,
  definition: nonEmptyStringSchema,
  expectedDepth: z.number().int().min(1).max(4),
  guidance: nonEmptyStringSchema.optional(),
});

export const curriculumExtractedQuestionTypeValuesSchema = strictObject({
  name: nonEmptyStringSchema,
  description: nonEmptyStringSchema.optional(),
  typicalMarks: z.number().int().positive().optional(),
  markSchemePattern: nonEmptyStringSchema.optional(),
});

export const curriculumExtractedMisconceptionValuesSchema = strictObject({
  topicRef: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
  triggerPatterns: z.array(nonEmptyStringSchema).min(1),
  correctionGuidance: nonEmptyStringSchema,
  severity: z.number().int().min(1).max(3).optional(),
});

export const curriculumExtractedTaskRuleValuesSchema = strictObject({
  taskType: curriculumTaskTypeSchema,
  topicRef: nonEmptyStringSchema.optional(),
  title: nonEmptyStringSchema,
  guidance: nonEmptyStringSchema,
  conditions: z.array(nonEmptyStringSchema).default([]),
  priority: prioritySchema.default("medium"),
});

function extractedBlockSchema<ValueSchema extends z.ZodTypeAny>(
  valueSchema: ValueSchema
) {
  return strictObject({
    values: valueSchema,
    provenance: z.array(curriculumDraftCitationSchema).min(1),
  });
}

export const curriculumExtractedMetadataBlockSchema = extractedBlockSchema(
  curriculumExtractedMetadataValuesSchema
);
export const curriculumExtractedQualificationBlockSchema = extractedBlockSchema(
  curriculumExtractedQualificationValuesSchema
);
export const curriculumExtractedComponentBlockSchema = extractedBlockSchema(
  curriculumExtractedComponentValuesSchema
);
export const curriculumExtractedTopicBlockSchema = extractedBlockSchema(
  curriculumExtractedTopicValuesSchema
);
export const curriculumExtractedEdgeBlockSchema = extractedBlockSchema(
  curriculumExtractedEdgeValuesSchema
);
export const curriculumExtractedCommandWordBlockSchema = extractedBlockSchema(
  curriculumExtractedCommandWordValuesSchema
);
export const curriculumExtractedQuestionTypeBlockSchema = extractedBlockSchema(
  curriculumExtractedQuestionTypeValuesSchema
);
export const curriculumExtractedMisconceptionBlockSchema = extractedBlockSchema(
  curriculumExtractedMisconceptionValuesSchema
);
export const curriculumExtractedTaskRuleBlockSchema = extractedBlockSchema(
  curriculumExtractedTaskRuleValuesSchema
);

export const curriculumExtractedDraftSchema = strictObject({
  schemaVersion: z.literal("1.0"),
  draftVersion: z.literal("1.0"),
  lifecycle: z.literal("candidate"),
  provenance: strictObject({
    sources: z.array(curriculumSourceSchema).min(1),
    derivedFrom: z.array(curriculumLineageSchema).default([]),
    generatedBy: curriculumGeneratorSchema.optional(),
  }),
  metadataBlocks: z.array(curriculumExtractedMetadataBlockSchema).default([]),
  qualificationBlocks: z
    .array(curriculumExtractedQualificationBlockSchema)
    .default([]),
  components: z.array(curriculumExtractedComponentBlockSchema).default([]),
  topics: z.array(curriculumExtractedTopicBlockSchema).default([]),
  edges: z.array(curriculumExtractedEdgeBlockSchema).default([]),
  commandWords: z.array(curriculumExtractedCommandWordBlockSchema).default([]),
  questionTypes: z.array(curriculumExtractedQuestionTypeBlockSchema).default(
    []
  ),
  misconceptionRules: z
    .array(curriculumExtractedMisconceptionBlockSchema)
    .default([]),
  taskRules: z.array(curriculumExtractedTaskRuleBlockSchema).default([]),
});

type RecordBlockKind =
  | "metadata"
  | "qualification"
  | "component"
  | "topic"
  | "edge"
  | "command-word"
  | "question-type"
  | "misconception"
  | "task-rule";

const recordBlockKindSchema = z.enum([
  "metadata",
  "qualification",
  "component",
  "topic",
  "edge",
  "command-word",
  "question-type",
  "misconception",
  "task-rule",
]);

interface ParsedRecordBlock {
  kind: RecordBlockKind;
  fields: Record<string, string>;
  startLine: number;
  endLine: number;
  rawLines: string[];
}

export type CurriculumExtractionRequest = z.infer<
  typeof curriculumExtractionRequestSchema
>;
export type CurriculumDraftCitation = z.infer<
  typeof curriculumDraftCitationSchema
>;
export type CurriculumExtractedDraft = z.infer<
  typeof curriculumExtractedDraftSchema
>;

export interface CurriculumExtractionIssue {
  severity: "error" | "warning";
  code: string;
  sourceId: string;
  locator: string;
  message: string;
}

export interface CurriculumExtractionStats {
  sources: number;
  blocks: number;
  metadataBlocks: number;
  qualificationBlocks: number;
  components: number;
  topics: number;
  edges: number;
  commandWords: number;
  questionTypes: number;
  misconceptionRules: number;
  taskRules: number;
}

export interface CurriculumExtractionResult {
  ok: boolean;
  draft: CurriculumExtractedDraft | null;
  errors: CurriculumExtractionIssue[];
  warnings: CurriculumExtractionIssue[];
  stats: CurriculumExtractionStats;
}

export interface ExtractCurriculumDraftOptions {
  baseDirectory?: string;
}

function emptyStats(): CurriculumExtractionStats {
  return {
    sources: 0,
    blocks: 0,
    metadataBlocks: 0,
    qualificationBlocks: 0,
    components: 0,
    topics: 0,
    edges: 0,
    commandWords: 0,
    questionTypes: 0,
    misconceptionRules: 0,
    taskRules: 0,
  };
}

function createIssue(
  severity: "error" | "warning",
  code: string,
  sourceId: string,
  locator: string,
  message: string
): CurriculumExtractionIssue {
  return {
    severity,
    code,
    sourceId,
    locator,
    message,
  };
}

function createLocator(startLine: number, endLine: number): string {
  return startLine === endLine
    ? `line ${startLine}`
    : `lines ${startLine}-${endLine}`;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined) {
        return false;
      }
      if (
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        Object.keys(entry as Record<string, unknown>).length === 0
      ) {
        return false;
      }
      return true;
    })
  ) as T;
}

function parseNumberField(value: string | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value.toLowerCase() === "null") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function parseBooleanField(value: string | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return value;
}

function parseListField(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value
    .split("||")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pushZodIssues(
  issues: CurriculumExtractionIssue[],
  sourceId: string,
  locator: string,
  code: string,
  error: z.ZodError
): void {
  error.issues.forEach((issue) => {
    issues.push(
      createIssue(
        "error",
        code,
        sourceId,
        locator,
        `${issue.path.join(".") || "<root>"}: ${issue.message}`
      )
    );
  });
}

function buildCitation(
  sourceId: string,
  block: ParsedRecordBlock
): CurriculumDraftCitation {
  const explicitLocator = block.fields.locator;
  const locator = explicitLocator || createLocator(block.startLine, block.endLine);

  return {
    sourceId,
    locator,
    startLine: block.startLine,
    endLine: block.endLine,
    excerpt: block.rawLines.join("\n").trim(),
  };
}

function parseRecordBlocks(
  sourceId: string,
  text: string
): {
  blocks: ParsedRecordBlock[];
  errors: CurriculumExtractionIssue[];
  warnings: CurriculumExtractionIssue[];
} {
  const blocks: ParsedRecordBlock[] = [];
  const errors: CurriculumExtractionIssue[] = [];
  const warnings: CurriculumExtractionIssue[] = [];
  const lines = text.split(/\r?\n/);
  let currentBlock: ParsedRecordBlock | null = null;

  const finishCurrentBlock = (): void => {
    if (!currentBlock) {
      return;
    }

    if (Object.keys(currentBlock.fields).length === 0) {
      errors.push(
        createIssue(
          "error",
          "extract.empty_block",
          sourceId,
          createLocator(currentBlock.startLine, currentBlock.endLine),
          `Empty [${currentBlock.kind}] block`
        )
      );
    } else {
      blocks.push(currentBlock);
    }

    currentBlock = null;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      return;
    }

    const blockHeaderMatch = trimmed.match(/^\[([a-z-]+)\]$/);
    if (blockHeaderMatch) {
      finishCurrentBlock();

      const kindResult = recordBlockKindSchema.safeParse(blockHeaderMatch[1]);
      if (!kindResult.success) {
        errors.push(
          createIssue(
            "error",
            "extract.unknown_block",
            sourceId,
            createLocator(lineNumber, lineNumber),
            `Unsupported block header [${blockHeaderMatch[1]}]`
          )
        );
        return;
      }

      currentBlock = {
        kind: kindResult.data,
        fields: {},
        startLine: lineNumber,
        endLine: lineNumber,
        rawLines: [line],
      };
      return;
    }

    if (!currentBlock) {
      warnings.push(
        createIssue(
          "warning",
          "extract.text_outside_block",
          sourceId,
          createLocator(lineNumber, lineNumber),
          "Ignoring text outside a structured record block"
        )
      );
      return;
    }

    currentBlock.rawLines.push(line);
    currentBlock.endLine = lineNumber;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      errors.push(
        createIssue(
          "error",
          "extract.invalid_field",
          sourceId,
          createLocator(lineNumber, lineNumber),
          "Expected key: value syntax inside the block"
        )
      );
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      errors.push(
        createIssue(
          "error",
          "extract.invalid_field",
          sourceId,
          createLocator(lineNumber, lineNumber),
          "Expected non-empty key and value inside the block"
        )
      );
      return;
    }

    if (key in currentBlock.fields) {
      warnings.push(
        createIssue(
          "warning",
          "extract.duplicate_field",
          sourceId,
          createLocator(lineNumber, lineNumber),
          `Field ${key} is duplicated in [${currentBlock.kind}] and the last value wins`
        )
      );
    }

    currentBlock.fields[key] = value;
  });

  finishCurrentBlock();

  return { blocks, errors, warnings };
}

async function loadSourceText(
  sourceMaterial: z.infer<typeof curriculumSourceMaterialSchema>,
  options: ExtractCurriculumDraftOptions
): Promise<string> {
  if ("text" in sourceMaterial.content) {
    return sourceMaterial.content.text;
  }

  const baseDirectory = options.baseDirectory ?? process.cwd();
  const absolutePath = path.resolve(baseDirectory, sourceMaterial.content.path);
  return readFile(absolutePath, sourceMaterial.content.encoding ?? "utf8");
}

export async function extractCurriculumDraft(
  input: unknown,
  options: ExtractCurriculumDraftOptions = {}
): Promise<CurriculumExtractionResult> {
  const requestResult = curriculumExtractionRequestSchema.safeParse(input);
  if (!requestResult.success) {
    const issues = requestResult.error.issues.map((issue) =>
      createIssue(
        "error",
        "extract.invalid_request",
        "request",
        issue.path.join(".") || "<root>",
        issue.message
      )
    );

    return {
      ok: false,
      draft: null,
      errors: issues,
      warnings: [],
      stats: emptyStats(),
    };
  }

  const request = requestResult.data;
  const errors: CurriculumExtractionIssue[] = [];
  const warnings: CurriculumExtractionIssue[] = [];
  const stats = emptyStats();

  const draftData: CurriculumExtractedDraft = {
    schemaVersion: "1.0",
    draftVersion: "1.0",
    lifecycle: "candidate",
    provenance: {
      sources: request.sources.map((sourceMaterial) => sourceMaterial.source),
      derivedFrom: request.derivedFrom,
      generatedBy: request.generatedBy,
    },
    metadataBlocks: [],
    qualificationBlocks: [],
    components: [],
    topics: [],
    edges: [],
    commandWords: [],
    questionTypes: [],
    misconceptionRules: [],
    taskRules: [],
  };

  for (const sourceMaterial of request.sources) {
    stats.sources += 1;
    const { source } = sourceMaterial;
    let text: string;

    try {
      text = await loadSourceText(sourceMaterial, options);
    } catch (error) {
      errors.push(
        createIssue(
          "error",
          "extract.source_read_failed",
          source.id,
          source.title,
          error instanceof Error ? error.message : String(error)
        )
      );
      continue;
    }

    const parsed = parseRecordBlocks(source.id, text);
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
    stats.blocks += parsed.blocks.length;

    parsed.blocks.forEach((block) => {
      const blockFields = { ...block.fields };
      delete blockFields.locator;
      const citation = buildCitation(source.id, block);
      const locator = citation.locator;
      const provenance = [citation];

      switch (block.kind) {
        case "metadata": {
          const metadataResult =
            curriculumExtractedMetadataValuesSchema.safeParse(
              compactObject({
                packageId: blockFields.packageId,
                packageVersion: blockFields.packageVersion,
                title: blockFields.title,
                summary: blockFields.summary,
                generatedAt: blockFields.generatedAt,
                updatedAt: blockFields.updatedAt,
              })
            );

          if (!metadataResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_metadata_block",
              metadataResult.error
            );
            return;
          }

          if (Object.keys(metadataResult.data).length === 0) {
            errors.push(
              createIssue(
                "error",
                "extract.empty_metadata_block",
                source.id,
                locator,
                "Metadata block does not contain any supported fields"
              )
            );
            return;
          }

          draftData.metadataBlocks.push({
            values: metadataResult.data,
            provenance,
          });
          stats.metadataBlocks += 1;
          return;
        }
        case "qualification": {
          const qualificationResult =
            curriculumExtractedQualificationValuesSchema.safeParse(
              compactObject({
                name: blockFields.name,
                slug: blockFields.slug,
                level: blockFields.level,
                versionCode: blockFields.versionCode,
                firstAssessmentYear: parseNumberField(
                  blockFields.firstAssessmentYear
                ),
                firstExamYear: parseNumberField(blockFields.firstExamYear),
                specUrl: blockFields.specUrl,
                subject: compactObject({
                  name: blockFields.subjectName,
                  slug: blockFields.subjectSlug,
                }),
                examBoard: compactObject({
                  name: blockFields.examBoardName,
                  code: blockFields.examBoardCode,
                }),
              })
            );

          if (!qualificationResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_qualification_block",
              qualificationResult.error
            );
            return;
          }

          if (Object.keys(qualificationResult.data).length === 0) {
            errors.push(
              createIssue(
                "error",
                "extract.empty_qualification_block",
                source.id,
                locator,
                "Qualification block does not contain any supported fields"
              )
            );
            return;
          }

          draftData.qualificationBlocks.push({
            values: qualificationResult.data,
            provenance,
          });
          stats.qualificationBlocks += 1;
          return;
        }
        case "component": {
          const componentResult =
            curriculumExtractedComponentValuesSchema.safeParse({
              name: blockFields.name,
              code: blockFields.code,
              weightPercent: parseNumberField(blockFields.weightPercent),
              durationMinutes: parseNumberField(blockFields.durationMinutes),
              totalMarks: parseNumberField(blockFields.totalMarks),
              isExam: parseBooleanField(blockFields.isExam),
            });

          if (!componentResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_component_block",
              componentResult.error
            );
            return;
          }

          draftData.components.push({
            values: componentResult.data,
            provenance,
          });
          stats.components += 1;
          return;
        }
        case "topic": {
          const topicResult = curriculumExtractedTopicValuesSchema.safeParse(
            compactObject({
              name: blockFields.name,
              code: blockFields.code,
              parentRef: blockFields.parentRef,
              sortOrder: parseNumberField(blockFields.sortOrder),
              description: blockFields.description,
              estimatedHours: parseNumberField(blockFields.estimatedHours),
            })
          );

          if (!topicResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_topic_block",
              topicResult.error
            );
            return;
          }

          draftData.topics.push({
            values: topicResult.data,
            provenance,
          });
          stats.topics += 1;
          return;
        }
        case "edge": {
          const edgeResult = curriculumExtractedEdgeValuesSchema.safeParse(
            compactObject({
              fromTopicRef: blockFields.fromTopicRef,
              toTopicRef: blockFields.toTopicRef,
              type: blockFields.type,
              rationale: blockFields.rationale,
            })
          );

          if (!edgeResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_edge_block",
              edgeResult.error
            );
            return;
          }

          draftData.edges.push({
            values: edgeResult.data,
            provenance,
          });
          stats.edges += 1;
          return;
        }
        case "command-word": {
          const commandWordResult =
            curriculumExtractedCommandWordValuesSchema.safeParse(
              compactObject({
                word: blockFields.word,
                definition: blockFields.definition,
                expectedDepth: parseNumberField(blockFields.expectedDepth),
                guidance: blockFields.guidance,
              })
            );

          if (!commandWordResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_command_word_block",
              commandWordResult.error
            );
            return;
          }

          draftData.commandWords.push({
            values: commandWordResult.data,
            provenance,
          });
          stats.commandWords += 1;
          return;
        }
        case "question-type": {
          const questionTypeResult =
            curriculumExtractedQuestionTypeValuesSchema.safeParse(
              compactObject({
                name: blockFields.name,
                description: blockFields.description,
                typicalMarks: parseNumberField(blockFields.typicalMarks),
                markSchemePattern: blockFields.markSchemePattern,
              })
            );

          if (!questionTypeResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_question_type_block",
              questionTypeResult.error
            );
            return;
          }

          draftData.questionTypes.push({
            values: questionTypeResult.data,
            provenance,
          });
          stats.questionTypes += 1;
          return;
        }
        case "misconception": {
          const misconceptionResult =
            curriculumExtractedMisconceptionValuesSchema.safeParse(
              compactObject({
                topicRef: blockFields.topicRef,
                description: blockFields.description,
                triggerPatterns: parseListField(blockFields.triggerPatterns),
                correctionGuidance: blockFields.correctionGuidance,
                severity: parseNumberField(blockFields.severity),
              })
            );

          if (!misconceptionResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_misconception_block",
              misconceptionResult.error
            );
            return;
          }

          draftData.misconceptionRules.push({
            values: misconceptionResult.data,
            provenance,
          });
          stats.misconceptionRules += 1;
          return;
        }
        case "task-rule": {
          const taskRuleResult = curriculumExtractedTaskRuleValuesSchema.safeParse(
            compactObject({
              taskType: blockFields.taskType,
              topicRef: blockFields.topicRef,
              title: blockFields.title,
              guidance: blockFields.guidance,
              conditions: parseListField(blockFields.conditions),
              priority: blockFields.priority,
            })
          );

          if (!taskRuleResult.success) {
            pushZodIssues(
              errors,
              source.id,
              locator,
              "extract.invalid_task_rule_block",
              taskRuleResult.error
            );
            return;
          }

          draftData.taskRules.push({
            values: taskRuleResult.data,
            provenance,
          });
          stats.taskRules += 1;
        }
      }
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      draft: null,
      errors,
      warnings,
      stats,
    };
  }

  return {
    ok: true,
    draft: curriculumExtractedDraftSchema.parse(draftData),
    errors,
    warnings,
    stats,
  };
}

export function formatExtractionIssues(
  errors: CurriculumExtractionIssue[],
  warnings: CurriculumExtractionIssue[]
): string {
  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push("Errors:");
    errors.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.sourceId} ${issue.locator}: ${issue.message}`
      );
    });
  }

  if (warnings.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Warnings:");
    warnings.forEach((issue) => {
      lines.push(
        `- [${issue.code}] ${issue.sourceId} ${issue.locator}: ${issue.message}`
      );
    });
  }

  return lines.join("\n");
}
