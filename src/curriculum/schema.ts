import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const slugSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Expected a lowercase slug with hyphen separators"
  );
const identifierSchema = slugSchema;
const isoDatetimeSchema = z.string().datetime({ offset: true });

export const curriculumPackageLifecycleSchema = z.enum([
  "legacy",
  "candidate",
  "approved",
  "reference",
]);

export const curriculumReviewStatusSchema = z.enum([
  "unreviewed",
  "in_review",
  "changes_requested",
  "approved",
]);

export const curriculumSourceKindSchema = z.enum([
  "specification",
  "mark_scheme",
  "examiner_report",
  "support_material",
  "teacher_guidance",
  "past_paper",
  "legacy_seed",
  "machine_inference",
  "other",
]);

export const curriculumSourceAuthoritySchema = z.enum([
  "primary",
  "secondary",
  "legacy",
  "inferred",
]);

export const curriculumReviewerRoleSchema = z.enum(["human", "ai"]);

export const curriculumEdgeTypeSchema = z.enum([
  "prerequisite",
  "builds_on",
  "related",
]);

export const curriculumTaskTypeSchema = z.enum([
  "retrieval_drill",
  "explanation",
  "worked_example",
  "timed_problems",
  "essay_planning",
  "source_analysis",
  "mistake_review",
  "reentry",
  "mixed_practice",
]);

export const curriculumConfidenceSchema = z.enum(["low", "medium", "high"]);

export const curriculumPackageMetadataSchema = z.object({
  packageId: slugSchema,
  packageVersion: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema.optional(),
  generatedAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema.optional(),
});

export const curriculumQualificationSchema = z.object({
  name: nonEmptyStringSchema,
  slug: slugSchema,
  level: nonEmptyStringSchema,
  versionCode: nonEmptyStringSchema,
  firstAssessmentYear: z.number().int().positive().nullable().optional(),
  firstExamYear: z.number().int().positive().nullable().optional(),
  specUrl: z.string().url().optional(),
  subject: z.object({
    name: nonEmptyStringSchema,
    slug: slugSchema,
  }),
  examBoard: z.object({
    name: nonEmptyStringSchema,
    code: nonEmptyStringSchema,
  }),
});

export const curriculumSourceSchema = z.object({
  id: identifierSchema,
  kind: curriculumSourceKindSchema,
  authority: curriculumSourceAuthoritySchema,
  title: nonEmptyStringSchema,
  uri: z.string().url().optional(),
  publisher: nonEmptyStringSchema.optional(),
  versionLabel: nonEmptyStringSchema.optional(),
  checksum: nonEmptyStringSchema.optional(),
});

export const curriculumLineageSchema = z.object({
  packageId: slugSchema,
  relationship: z.enum([
    "legacy_seed",
    "candidate_revision",
    "approved_revision",
    "reference_example",
  ]),
  note: nonEmptyStringSchema.optional(),
});

export const curriculumGeneratorSchema = z.object({
  tool: nonEmptyStringSchema,
  version: nonEmptyStringSchema.optional(),
  runId: nonEmptyStringSchema.optional(),
});

export const curriculumProvenanceSchema = z.object({
  sources: z.array(curriculumSourceSchema).default([]),
  derivedFrom: z.array(curriculumLineageSchema).default([]),
  generatedBy: curriculumGeneratorSchema.optional(),
});

export const curriculumReviewEntrySchema = z.object({
  name: nonEmptyStringSchema,
  role: curriculumReviewerRoleSchema,
  outcome: z.enum(["approved", "changes_requested", "commented"]),
  reviewedAt: isoDatetimeSchema,
  notes: nonEmptyStringSchema.optional(),
});

export const curriculumReviewSchema = z.object({
  status: curriculumReviewStatusSchema.default("unreviewed"),
  reviewers: z.array(curriculumReviewEntrySchema).default([]),
  approvedAt: isoDatetimeSchema.optional(),
  referenceNotes: nonEmptyStringSchema.optional(),
});

export const curriculumAssessmentComponentSchema = z.object({
  id: identifierSchema,
  name: nonEmptyStringSchema,
  code: nonEmptyStringSchema,
  weightPercent: z.number().min(0).max(100),
  durationMinutes: z.number().int().positive().optional(),
  totalMarks: z.number().int().positive().optional(),
  isExam: z.boolean(),
});

export const curriculumTopicSchema = z.object({
  id: identifierSchema,
  name: nonEmptyStringSchema,
  code: nonEmptyStringSchema.optional(),
  parentId: identifierSchema.nullable().default(null),
  depth: z.number().int().min(0),
  sortOrder: z.number().int().positive(),
  description: nonEmptyStringSchema.optional(),
  estimatedHours: z.number().positive().optional(),
});

export const curriculumTopicEdgeSchema = z.object({
  fromTopicId: identifierSchema,
  toTopicId: identifierSchema,
  type: curriculumEdgeTypeSchema,
  rationale: nonEmptyStringSchema.optional(),
});

export const curriculumCommandWordSchema = z.object({
  id: identifierSchema,
  word: nonEmptyStringSchema,
  definition: nonEmptyStringSchema,
  expectedDepth: z.number().int().min(1).max(4),
  guidance: nonEmptyStringSchema.optional(),
});

export const curriculumQuestionTypeSchema = z.object({
  id: identifierSchema,
  name: nonEmptyStringSchema,
  description: nonEmptyStringSchema.optional(),
  typicalMarks: z.number().int().positive().optional(),
  markSchemePattern: nonEmptyStringSchema.optional(),
});

export const curriculumMisconceptionRuleSchema = z.object({
  id: identifierSchema,
  topicId: identifierSchema,
  description: nonEmptyStringSchema,
  triggerPatterns: z.array(nonEmptyStringSchema).min(1),
  correctionGuidance: nonEmptyStringSchema,
  severity: z.number().int().min(1).max(3).default(2),
});

export const curriculumTaskRuleSchema = z.object({
  id: identifierSchema,
  taskType: curriculumTaskTypeSchema,
  topicId: identifierSchema.optional(),
  title: nonEmptyStringSchema,
  guidance: nonEmptyStringSchema,
  conditions: z.array(nonEmptyStringSchema).default([]),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export const curriculumSourceMappingHintSchema = z.object({
  id: identifierSchema,
  sourceId: identifierSchema,
  topicId: identifierSchema,
  locator: nonEmptyStringSchema,
  excerptHint: nonEmptyStringSchema.optional(),
  confidence: curriculumConfidenceSchema.default("medium"),
});

export const curriculumMarkSchemePatternSchema = z.object({
  id: identifierSchema,
  label: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
  questionTypeId: identifierSchema.optional(),
  componentId: identifierSchema.optional(),
});

export const curriculumExamTechniquePatternSchema = z.object({
  id: identifierSchema,
  label: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
  commandWordId: identifierSchema.optional(),
});

export const curriculumAnnotationsSchema = z.object({
  markSchemePatterns: z.array(curriculumMarkSchemePatternSchema).default([]),
  examTechniquePatterns: z
    .array(curriculumExamTechniquePatternSchema)
    .default([]),
});

const curriculumPackageBaseSchema = z.object({
  schemaVersion: z.literal("1.0"),
  lifecycle: curriculumPackageLifecycleSchema,
  metadata: curriculumPackageMetadataSchema,
  qualification: curriculumQualificationSchema,
  provenance: curriculumProvenanceSchema,
  review: curriculumReviewSchema,
  components: z.array(curriculumAssessmentComponentSchema).min(1),
  topics: z.array(curriculumTopicSchema).min(1),
  edges: z.array(curriculumTopicEdgeSchema).default([]),
  commandWords: z.array(curriculumCommandWordSchema).default([]),
  questionTypes: z.array(curriculumQuestionTypeSchema).default([]),
  misconceptionRules: z
    .array(curriculumMisconceptionRuleSchema)
    .default([]),
  taskRules: z.array(curriculumTaskRuleSchema).default([]),
  sourceMappings: z.array(curriculumSourceMappingHintSchema).default([]),
  annotations: curriculumAnnotationsSchema.optional(),
});

export const legacyCurriculumPackageSchema =
  curriculumPackageBaseSchema.extend({
    lifecycle: z.literal("legacy"),
  });

export const candidateCurriculumPackageSchema =
  curriculumPackageBaseSchema.extend({
    lifecycle: z.literal("candidate"),
  });

export const approvedCurriculumPackageSchema =
  curriculumPackageBaseSchema.extend({
    lifecycle: z.literal("approved"),
  });

export const referenceCurriculumPackageSchema =
  curriculumPackageBaseSchema.extend({
    lifecycle: z.literal("reference"),
  });

export const curriculumPackageSchema = z.discriminatedUnion("lifecycle", [
  legacyCurriculumPackageSchema,
  candidateCurriculumPackageSchema,
  approvedCurriculumPackageSchema,
  referenceCurriculumPackageSchema,
]);

export type CurriculumPackageLifecycle = z.infer<
  typeof curriculumPackageLifecycleSchema
>;
export type CurriculumReviewStatus = z.infer<
  typeof curriculumReviewStatusSchema
>;
export type CurriculumSourceKind = z.infer<typeof curriculumSourceKindSchema>;
export type CurriculumSourceAuthority = z.infer<
  typeof curriculumSourceAuthoritySchema
>;
export type CurriculumReviewerRole = z.infer<
  typeof curriculumReviewerRoleSchema
>;
export type CurriculumEdgeType = z.infer<typeof curriculumEdgeTypeSchema>;
export type CurriculumTaskType = z.infer<typeof curriculumTaskTypeSchema>;
export type CurriculumConfidence = z.infer<typeof curriculumConfidenceSchema>;
export type CurriculumPackageMetadata = z.infer<
  typeof curriculumPackageMetadataSchema
>;
export type CurriculumQualification = z.infer<
  typeof curriculumQualificationSchema
>;
export type CurriculumSource = z.infer<typeof curriculumSourceSchema>;
export type CurriculumLineage = z.infer<typeof curriculumLineageSchema>;
export type CurriculumGenerator = z.infer<typeof curriculumGeneratorSchema>;
export type CurriculumProvenance = z.infer<typeof curriculumProvenanceSchema>;
export type CurriculumReviewEntry = z.infer<
  typeof curriculumReviewEntrySchema
>;
export type CurriculumReview = z.infer<typeof curriculumReviewSchema>;
export type CurriculumAssessmentComponent = z.infer<
  typeof curriculumAssessmentComponentSchema
>;
export type CurriculumTopic = z.infer<typeof curriculumTopicSchema>;
export type CurriculumTopicEdge = z.infer<typeof curriculumTopicEdgeSchema>;
export type CurriculumCommandWord = z.infer<
  typeof curriculumCommandWordSchema
>;
export type CurriculumQuestionType = z.infer<
  typeof curriculumQuestionTypeSchema
>;
export type CurriculumMisconceptionRule = z.infer<
  typeof curriculumMisconceptionRuleSchema
>;
export type CurriculumTaskRule = z.infer<typeof curriculumTaskRuleSchema>;
export type CurriculumSourceMappingHint = z.infer<
  typeof curriculumSourceMappingHintSchema
>;
export type CurriculumMarkSchemePattern = z.infer<
  typeof curriculumMarkSchemePatternSchema
>;
export type CurriculumExamTechniquePattern = z.infer<
  typeof curriculumExamTechniquePatternSchema
>;
export type CurriculumAnnotations = z.infer<
  typeof curriculumAnnotationsSchema
>;
export type LegacyCurriculumPackage = z.infer<
  typeof legacyCurriculumPackageSchema
>;
export type CandidateCurriculumPackage = z.infer<
  typeof candidateCurriculumPackageSchema
>;
export type ApprovedCurriculumPackage = z.infer<
  typeof approvedCurriculumPackageSchema
>;
export type ReferenceCurriculumPackage = z.infer<
  typeof referenceCurriculumPackageSchema
>;
export type CurriculumPackage = z.infer<typeof curriculumPackageSchema>;
