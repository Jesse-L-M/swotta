import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  decimal,
  timestamp,
  unique,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  qualLevelEnum,
  edgeTypeEnum,
  blockTypeEnum,
  pastPaperSignalTypeEnum,
} from "./enums";

// --- exam_boards ---

export const examBoards = pgTable("exam_boards", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 20 }).unique().notNull(),
  country: varchar("country", { length: 2 }).notNull().default("GB"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- subjects ---

export const subjects = pgTable("subjects", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- qualifications ---

export const qualifications = pgTable(
  "qualifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    level: qualLevelEnum("level").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qualifications_subject_level_unique").on(
      table.subjectId,
      table.level
    ),
  ]
);

// --- qualification_versions ---

export const qualificationVersions = pgTable(
  "qualification_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    qualificationId: uuid("qualification_id")
      .notNull()
      .references(() => qualifications.id),
    examBoardId: uuid("exam_board_id")
      .notNull()
      .references(() => examBoards.id),
    versionCode: varchar("version_code", { length: 50 }).notNull(),
    firstExamYear: integer("first_exam_year").notNull(),
    lastExamYear: integer("last_exam_year"),
    specUrl: text("spec_url"),
    totalMarks: integer("total_marks"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("qualification_versions_qual_board_code_unique").on(
      table.qualificationId,
      table.examBoardId,
      table.versionCode
    ),
  ]
);

// --- assessment_components ---

export const assessmentComponents = pgTable("assessment_components", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  qualificationVersionId: uuid("qualification_version_id")
    .notNull()
    .references(() => qualificationVersions.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  weightPercent: integer("weight_percent").notNull(),
  durationMinutes: integer("duration_minutes"),
  totalMarks: integer("total_marks"),
  isExam: boolean("is_exam").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- topics ---

export const topics = pgTable(
  "topics",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    qualificationVersionId: uuid("qualification_version_id")
      .notNull()
      .references(() => qualificationVersions.id),
    parentTopicId: uuid("parent_topic_id").references(
      (): AnyPgColumn => topics.id
    ),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }),
    depth: integer("depth").notNull().default(0),
    sortOrder: integer("sort_order").notNull(),
    description: text("description"),
    estimatedHours: decimal("estimated_hours", {
      precision: 4,
      scale: 1,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("topics_qualification_version_id_idx").on(
      table.qualificationVersionId
    ),
    index("topics_parent_topic_id_idx").on(table.parentTopicId),
  ]
);

// --- topic_edges ---

export const topicEdges = pgTable(
  "topic_edges",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fromTopicId: uuid("from_topic_id")
      .notNull()
      .references(() => topics.id),
    toTopicId: uuid("to_topic_id")
      .notNull()
      .references(() => topics.id),
    edgeType: edgeTypeEnum("edge_type").notNull(),
    weight: decimal("weight", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("topic_edges_from_to_type_unique").on(
      table.fromTopicId,
      table.toTopicId,
      table.edgeType
    ),
    check(
      "topic_edges_no_self_ref",
      sql`${table.fromTopicId} != ${table.toTopicId}`
    ),
  ]
);

// --- question_types ---

export const questionTypes = pgTable("question_types", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  qualificationVersionId: uuid("qualification_version_id")
    .notNull()
    .references(() => qualificationVersions.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  typicalMarks: integer("typical_marks"),
  markSchemePattern: text("mark_scheme_pattern"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- command_words ---

export const commandWords = pgTable(
  "command_words",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    qualificationVersionId: uuid("qualification_version_id")
      .notNull()
      .references(() => qualificationVersions.id),
    word: varchar("word", { length: 100 }).notNull(),
    definition: text("definition").notNull(),
    expectedDepth: integer("expected_depth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("command_words_qv_word_unique").on(
      table.qualificationVersionId,
      table.word
    ),
  ]
);

// --- misconception_rules ---

export const misconceptionRules = pgTable("misconception_rules", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  description: text("description").notNull(),
  triggerPatterns: text("trigger_patterns")
    .array()
    .notNull(),
  correctionGuidance: text("correction_guidance").notNull(),
  severity: integer("severity").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- task_rules ---

export const taskRules = pgTable("task_rules", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  questionTypeId: uuid("question_type_id").references(() => questionTypes.id),
  blockType: blockTypeEnum("block_type").notNull(),
  difficultyMin: integer("difficulty_min").notNull().default(1),
  difficultyMax: integer("difficulty_max").notNull().default(5),
  timeEstimateMinutes: integer("time_estimate_minutes").notNull(),
  instructions: text("instructions"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- past_papers ---

export const pastPapers = pgTable(
  "past_papers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    qualificationVersionId: uuid("qualification_version_id")
      .notNull()
      .references(() => qualificationVersions.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => assessmentComponents.id),
    slug: varchar("slug", { length: 150 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    series: varchar("series", { length: 50 }).notNull(),
    examYear: integer("exam_year").notNull(),
    paperCode: varchar("paper_code", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("past_papers_qualification_slug_unique").on(
      table.qualificationVersionId,
      table.slug
    ),
    index("past_papers_qualification_version_id_idx").on(
      table.qualificationVersionId
    ),
    index("past_papers_component_id_idx").on(table.componentId),
  ]
);

// --- past_paper_questions ---

export const pastPaperQuestions = pgTable(
  "past_paper_questions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => pastPapers.id, { onDelete: "cascade" }),
    questionNumber: varchar("question_number", { length: 50 }).notNull(),
    questionOrder: integer("question_order").notNull(),
    locator: varchar("locator", { length: 100 }).notNull(),
    promptExcerpt: text("prompt_excerpt").notNull(),
    marksAvailable: integer("marks_available").notNull(),
    questionTypeId: uuid("question_type_id")
      .notNull()
      .references(() => questionTypes.id),
    commandWordId: uuid("command_word_id").references(() => commandWords.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("past_paper_questions_paper_question_number_unique").on(
      table.paperId,
      table.questionNumber
    ),
    index("past_paper_questions_paper_id_idx").on(table.paperId),
    index("past_paper_questions_question_type_id_idx").on(table.questionTypeId),
    index("past_paper_questions_command_word_id_idx").on(table.commandWordId),
    check(
      "past_paper_questions_marks_positive",
      sql`${table.marksAvailable} > 0`
    ),
  ]
);

// --- past_paper_question_topics ---

export const pastPaperQuestionTopics = pgTable(
  "past_paper_question_topics",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pastPaperQuestionId: uuid("past_paper_question_id")
      .notNull()
      .references(() => pastPaperQuestions.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id),
    topicHint: text("topic_hint"),
    isPrimary: boolean("is_primary").notNull().default(false),
    confidence: decimal("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("0.75"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("past_paper_question_topics_question_topic_hint_unique").on(
      table.pastPaperQuestionId,
      table.topicId,
      table.topicHint
    ),
    index("past_paper_question_topics_question_id_idx").on(
      table.pastPaperQuestionId
    ),
    index("past_paper_question_topics_topic_id_idx").on(table.topicId),
    check(
      "past_paper_question_topics_has_target",
      sql`${table.topicId} IS NOT NULL OR ${table.topicHint} IS NOT NULL`
    ),
  ]
);

// --- past_paper_question_signals ---

export const pastPaperQuestionSignals = pgTable(
  "past_paper_question_signals",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pastPaperQuestionId: uuid("past_paper_question_id")
      .notNull()
      .references(() => pastPaperQuestions.id, { onDelete: "cascade" }),
    signalType: pastPaperSignalTypeEnum("signal_type").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("past_paper_question_signals_question_type_code_unique").on(
      table.pastPaperQuestionId,
      table.signalType,
      table.code
    ),
    index("past_paper_question_signals_question_id_idx").on(
      table.pastPaperQuestionId
    ),
    index("past_paper_question_signals_signal_type_idx").on(table.signalType),
  ]
);
