import { z } from "zod";
import type { LegacyCurriculumPackage } from "./schema";
import { legacyCurriculumPackageSchema } from "./schema";

const nonEmptyStringSchema = z.string().trim().min(1);
const strictObject = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).strict();

export const legacyTopicSeedNodeSchema: z.ZodType<LegacyQualificationTopicSeed> =
  z.lazy(() =>
    strictObject({
      name: nonEmptyStringSchema,
      code: nonEmptyStringSchema.optional(),
      estimatedHours: z.number().positive().optional(),
      description: nonEmptyStringSchema.optional(),
      children: z.array(legacyTopicSeedNodeSchema).optional(),
      edges: z
        .array(
          strictObject({
            toCode: nonEmptyStringSchema,
            type: z.enum(["prerequisite", "builds_on", "related"]),
          })
        )
        .optional(),
    })
  );

export const legacyQualificationSeedSchema = strictObject({
  subject: strictObject({
    name: nonEmptyStringSchema,
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }),
  examBoard: strictObject({
    name: nonEmptyStringSchema,
    code: nonEmptyStringSchema,
  }),
  level: nonEmptyStringSchema,
  versionCode: nonEmptyStringSchema,
  firstExamYear: z.number().int().positive(),
  specUrl: z.string().url().optional(),
  components: z
    .array(
      strictObject({
        name: nonEmptyStringSchema,
        code: nonEmptyStringSchema,
        weightPercent: z.number().int().min(0).max(100),
        durationMinutes: z.number().int().positive().optional(),
        totalMarks: z.number().int().positive().optional(),
        isExam: z.boolean(),
      })
    )
    .min(1),
  topics: z.array(legacyTopicSeedNodeSchema).min(1),
  commandWords: z
    .array(
      strictObject({
        word: nonEmptyStringSchema,
        definition: nonEmptyStringSchema,
        expectedDepth: z.number().int().min(1).max(4),
      })
    )
    .min(1),
  questionTypes: z
    .array(
      strictObject({
        name: nonEmptyStringSchema,
        description: nonEmptyStringSchema.optional(),
        typicalMarks: z.number().int().positive().optional(),
        markSchemePattern: nonEmptyStringSchema.optional(),
      })
    )
    .min(1),
  misconceptionRules: z
    .array(
      strictObject({
        topicCode: nonEmptyStringSchema,
        description: nonEmptyStringSchema,
        triggerPatterns: z.array(nonEmptyStringSchema).min(1),
        correctionGuidance: nonEmptyStringSchema,
        severity: z.number().int().min(1).max(3).optional(),
      })
    )
    .optional(),
});

export type LegacyQualificationTopicSeed = {
  name: string;
  code?: string;
  estimatedHours?: number;
  description?: string;
  children?: LegacyQualificationTopicSeed[];
  edges?: Array<{
    toCode: string;
    type: "prerequisite" | "builds_on" | "related";
  }>;
};

export type LegacyQualificationSeed = z.infer<
  typeof legacyQualificationSeedSchema
>;

export interface BuildLegacyCurriculumPackageOptions {
  generatedAt?: string;
  packageId?: string;
  packageVersion?: string;
  title?: string;
  summary?: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureUniqueId(baseId: string, seenIds: Map<string, number>): string {
  const currentCount = seenIds.get(baseId) ?? 0;
  seenIds.set(baseId, currentCount + 1);
  if (currentCount === 0) {
    return baseId;
  }
  return `${baseId}-${currentCount + 1}`;
}

function defaultPackageId(seed: LegacyQualificationSeed): string {
  return [
    slugify(seed.examBoard.code),
    slugify(seed.level),
    seed.subject.slug,
    slugify(seed.versionCode),
  ].join("-");
}

function defaultPackageTitle(seed: LegacyQualificationSeed): string {
  return `${seed.examBoard.name} ${seed.level} ${seed.subject.name}`;
}

export function buildLegacyCurriculumPackage(
  seed: LegacyQualificationSeed,
  options: BuildLegacyCurriculumPackageOptions = {}
): LegacyCurriculumPackage {
  const parsedSeed = legacyQualificationSeedSchema.parse(seed);
  const seenIds = new Map<string, number>();
  const codeToTopicId = new Map<string, string>();
  const topics: LegacyCurriculumPackage["topics"] = [];
  const edges: LegacyCurriculumPackage["edges"] = [];
  const queuedEdges: Array<{
    fromTopicId: string;
    toCode: string;
    type: "prerequisite" | "builds_on" | "related";
  }> = [];

  function buildTopicId(
    node: LegacyQualificationTopicSeed,
    pathSegments: string[],
    siblingIndex: number
  ): string {
    const suffix = node.code
      ? slugify(node.code)
      : [...pathSegments, `${siblingIndex + 1}-${slugify(node.name)}`].join(
          "-"
        );
    return ensureUniqueId(`topic-${suffix}`, seenIds);
  }

  function visitTopics(
    nodes: LegacyQualificationTopicSeed[],
    parentId: string | null,
    depth: number,
    pathSegments: string[]
  ): void {
    nodes.forEach((node, index) => {
      const topicId = buildTopicId(node, pathSegments, index);
      const nextPathSegments = [
        ...pathSegments,
        node.code ? slugify(node.code) : `${index + 1}-${slugify(node.name)}`,
      ];

      topics.push({
        id: topicId,
        name: node.name,
        code: node.code,
        parentId,
        depth,
        sortOrder: index + 1,
        description: node.description,
        estimatedHours: node.estimatedHours,
      });

      if (node.code) {
        codeToTopicId.set(node.code, topicId);
      }

      if (node.edges && node.code) {
        node.edges.forEach((edge) => {
          queuedEdges.push({
            fromTopicId: topicId,
            toCode: edge.toCode,
            type: edge.type,
          });
        });
      }

      if (node.children?.length) {
        visitTopics(node.children, topicId, depth + 1, nextPathSegments);
      }
    });
  }

  visitTopics(parsedSeed.topics, null, 0, []);

  queuedEdges.forEach((edge) => {
    const toTopicId = codeToTopicId.get(edge.toCode);
    if (!toTopicId) {
      return;
    }
    edges.push({
      fromTopicId: edge.fromTopicId,
      toTopicId,
      type: edge.type,
    });
  });

  const packageData = {
    schemaVersion: "1.0" as const,
    lifecycle: "legacy" as const,
    metadata: {
      packageId: options.packageId ?? defaultPackageId(parsedSeed),
      packageVersion: options.packageVersion ?? `legacy-${parsedSeed.versionCode}`,
      title: options.title ?? defaultPackageTitle(parsedSeed),
      summary: options.summary,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
    },
    qualification: {
      name: `${parsedSeed.level} ${parsedSeed.subject.name}`,
      slug: `${slugify(parsedSeed.level)}-${parsedSeed.subject.slug}`,
      level: parsedSeed.level,
      versionCode: parsedSeed.versionCode,
      firstExamYear: parsedSeed.firstExamYear,
      specUrl: parsedSeed.specUrl,
      subject: parsedSeed.subject,
      examBoard: parsedSeed.examBoard,
    },
    provenance: {
      sources: [
        {
          id: "legacy-seed",
          kind: "legacy_seed" as const,
          authority: "legacy" as const,
          title: "Legacy Swotta qualification seed",
        },
      ],
      derivedFrom: [],
    },
    review: {
      status: "unreviewed" as const,
      reviewers: [],
    },
    components: parsedSeed.components.map((component) => ({
      id: ensureUniqueId(`component-${slugify(component.code)}`, seenIds),
      name: component.name,
      code: component.code,
      weightPercent: component.weightPercent,
      durationMinutes: component.durationMinutes,
      totalMarks: component.totalMarks,
      isExam: component.isExam,
    })),
    topics,
    edges,
    commandWords: parsedSeed.commandWords.map((commandWord) => ({
      id: ensureUniqueId(`command-word-${slugify(commandWord.word)}`, seenIds),
      word: commandWord.word,
      definition: commandWord.definition,
      expectedDepth: commandWord.expectedDepth,
    })),
    questionTypes: parsedSeed.questionTypes.map((questionType) => ({
      id: ensureUniqueId(`question-type-${slugify(questionType.name)}`, seenIds),
      name: questionType.name,
      description: questionType.description,
      typicalMarks: questionType.typicalMarks,
      markSchemePattern: questionType.markSchemePattern,
    })),
    misconceptionRules: (parsedSeed.misconceptionRules ?? [])
      .map((rule, index) => {
        const topicId = codeToTopicId.get(rule.topicCode);
        if (!topicId) {
          return null;
        }
        return {
          id: ensureUniqueId(
            `misconception-${slugify(rule.topicCode)}-${index + 1}`,
            seenIds
          ),
          topicId,
          description: rule.description,
          triggerPatterns: rule.triggerPatterns,
          correctionGuidance: rule.correctionGuidance,
          severity: rule.severity ?? 2,
        };
      })
      .filter((rule): rule is NonNullable<typeof rule> => rule !== null),
    taskRules: [],
    sourceMappings: [],
  };

  return legacyCurriculumPackageSchema.parse(packageData);
}

export function isLegacyQualificationSeed(
  input: unknown
): input is LegacyQualificationSeed {
  return legacyQualificationSeedSchema.safeParse(input).success;
}
