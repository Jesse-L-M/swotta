import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  decimal,
  boolean,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { retentionOutcomeEnum, sessionStatusEnum } from "./enums";
import { learners } from "./identity";
import { topics, misconceptionRules } from "./curriculum";
import { assessmentComponents } from "./curriculum";

// --- learner_topic_state ---

export const learnerTopicState = pgTable(
  "learner_topic_state",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    masteryLevel: decimal("mastery_level", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    confidence: decimal("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    easeFactor: decimal("ease_factor", { precision: 4, scale: 2 })
      .notNull()
      .default("2.50"),
    intervalDays: integer("interval_days").notNull().default(0),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    reviewCount: integer("review_count").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learner_topic_state_learner_topic_unique").on(
      table.learnerId,
      table.topicId
    ),
    index("learner_topic_state_next_review_idx").on(
      table.learnerId,
      table.nextReviewAt
    ),
  ]
);

// --- learner_component_state ---

export const learnerComponentState = pgTable(
  "learner_component_state",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => assessmentComponents.id),
    predictedGrade: varchar("predicted_grade", { length: 10 }),
    predictedPercent: decimal("predicted_percent", {
      precision: 5,
      scale: 2,
    }),
    confidence: decimal("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learner_component_state_learner_component_unique").on(
      table.learnerId,
      table.componentId
    ),
  ]
);

// --- learner_preferences ---

export const learnerPreferences = pgTable(
  "learner_preferences",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    key: varchar("key", { length: 100 }).notNull(),
    value: jsonb("value").notNull(),
    source: varchar("source", { length: 50 }).notNull().default("inferred"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learner_preferences_learner_key_unique").on(
      table.learnerId,
      table.key
    ),
  ]
);

// --- memory_candidates ---

export const memoryCandidates = pgTable(
  "memory_candidates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    category: varchar("category", { length: 100 }).notNull(),
    content: text("content").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memory_candidates_learner_id_idx").on(table.learnerId),
  ]
);

// --- memory_confirmed ---

export const memoryConfirmed = pgTable(
  "memory_confirmed",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    category: varchar("category", { length: 100 }).notNull(),
    content: text("content").notNull(),
    sourceCandidateId: uuid("source_candidate_id").references(
      () => memoryCandidates.id
    ),
    confirmedBy: varchar("confirmed_by", { length: 50 }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memory_confirmed_learner_id_idx").on(table.learnerId),
  ]
);

// --- misconception_events ---
// Note: block_attempt_id FK is deferred (references planning.ts blockAttempts)

export const misconceptionEvents = pgTable(
  "misconception_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    misconceptionRuleId: uuid("misconception_rule_id").references(
      () => misconceptionRules.id
    ),
    blockAttemptId: uuid("block_attempt_id"),
    description: text("description").notNull(),
    severity: integer("severity").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("misconception_events_learner_topic_idx").on(
      table.learnerId,
      table.topicId
    ),
  ]
);

// --- confidence_events ---

export const confidenceEvents = pgTable("confidence_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  blockAttemptId: uuid("block_attempt_id"),
  selfRated: decimal("self_rated", { precision: 4, scale: 3 }).notNull(),
  actual: decimal("actual", { precision: 4, scale: 3 }).notNull(),
  delta: decimal("delta", { precision: 4, scale: 3 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- retention_events ---

export const retentionEvents = pgTable("retention_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  blockAttemptId: uuid("block_attempt_id"),
  intervalDays: integer("interval_days").notNull(),
  outcome: retentionOutcomeEnum("outcome").notNull(),
  easeFactorBefore: decimal("ease_factor_before", {
    precision: 4,
    scale: 2,
  }).notNull(),
  easeFactorAfter: decimal("ease_factor_after", {
    precision: 4,
    scale: 2,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- study_sessions ---

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    blockId: uuid("block_id"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary"),
    topicsCovered: uuid("topics_covered")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    blocksCompleted: integer("blocks_completed").notNull().default(0),
    totalDurationMinutes: integer("total_duration_minutes"),
    moodStart: integer("mood_start"),
    moodEnd: integer("mood_end"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("study_sessions_learner_id_idx").on(table.learnerId),
    index("study_sessions_status_idx").on(table.learnerId, table.status),
  ]
);
