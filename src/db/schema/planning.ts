import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  decimal,
  boolean,
  date,
  timestamp,
  inet,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  planTypeEnum,
  planStatusEnum,
  blockTypeEnum,
  blockStatusEnum,
  reviewReasonEnum,
  helpTimingEnum,
  flagTypeEnum,
  flagSeverityEnum,
  notificationChannelEnum,
} from "./enums";
import { learners, organizations, users, classes } from "./identity";
import { topics } from "./curriculum";
import { sourceFiles } from "./sources";

// --- study_plans ---

export const studyPlans = pgTable(
  "study_plans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    planType: planTypeEnum("plan_type").notNull(),
    title: varchar("title", { length: 255 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: planStatusEnum("status").notNull().default("draft"),
    config: jsonb("config").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("study_plans_learner_status_idx").on(table.learnerId, table.status),
  ]
);

// --- study_blocks ---

export const studyBlocks = pgTable(
  "study_blocks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    planId: uuid("plan_id").references(() => studyPlans.id),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    blockType: blockTypeEnum("block_type").notNull(),
    scheduledDate: date("scheduled_date"),
    scheduledOrder: integer("scheduled_order"),
    durationMinutes: integer("duration_minutes").notNull(),
    priority: integer("priority").notNull().default(5),
    status: blockStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("study_blocks_learner_status_idx").on(
      table.learnerId,
      table.status
    ),
    index("study_blocks_scheduled_idx").on(
      table.learnerId,
      table.scheduledDate
    ),
  ]
);

// --- block_attempts ---

export const blockAttempts = pgTable("block_attempts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  blockId: uuid("block_id")
    .notNull()
    .references(() => studyBlocks.id),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  score: decimal("score", { precision: 5, scale: 2 }),
  confidenceBefore: decimal("confidence_before", { precision: 4, scale: 3 }),
  confidenceAfter: decimal("confidence_after", { precision: 4, scale: 3 }),
  helpRequested: boolean("help_requested").notNull().default(false),
  helpTiming: helpTimingEnum("help_timing"),
  misconceptionsDetected: integer("misconceptions_detected")
    .notNull()
    .default(0),
  notes: text("notes"),
  rawInteraction: jsonb("raw_interaction"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- review_queue ---

export const reviewQueue = pgTable(
  "review_queue",
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
    reason: reviewReasonEnum("reason").notNull(),
    priority: integer("priority").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("review_queue_learner_due_idx")
      .on(table.learnerId, table.dueAt)
      .where(sql`${table.fulfilledAt} IS NULL`),
  ]
);

// --- assignments ---

export const assignments = pgTable("assignments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  classId: uuid("class_id").references(() => classes.id),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  setByUserId: uuid("set_by_user_id").references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  sourceFileId: uuid("source_file_id").references(() => sourceFiles.id),
  topicId: uuid("topic_id").references(() => topics.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- teacher_notes ---

export const teacherNotes = pgTable("teacher_notes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  staffUserId: uuid("staff_user_id")
    .notNull()
    .references(() => users.id),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  topicId: uuid("topic_id").references(() => topics.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- weekly_reports ---

export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  planId: uuid("plan_id").references(() => studyPlans.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  summary: text("summary").notNull(),
  masteryChanges: jsonb("mastery_changes").notNull(),
  sessionsCompleted: integer("sessions_completed").notNull(),
  totalStudyMinutes: integer("total_study_minutes").notNull(),
  topicsReviewed: integer("topics_reviewed").notNull(),
  flags: jsonb("flags").notNull().default([]),
  sentTo: jsonb("sent_to").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- notification_events ---

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id").references(() => organizations.id),
    type: varchar("type", { length: 100 }).notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    subject: varchar("subject", { length: 255 }),
    payload: jsonb("payload").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_events_user_idx").on(table.userId, table.createdAt),
  ]
);

// --- safety_flags ---

export const safetyFlags = pgTable(
  "safety_flags",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    blockAttemptId: uuid("block_attempt_id").references(
      () => blockAttempts.id
    ),
    flagType: flagTypeEnum("flag_type").notNull(),
    severity: flagSeverityEnum("severity").notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence").notNull().default({}),
    resolved: boolean("resolved").notNull().default(false),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("safety_flags_learner_idx")
      .on(table.learnerId)
      .where(sql`${table.resolved} = false`),
  ]
);

// --- audit_log ---

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.orgId, table.createdAt),
    index("audit_log_resource_idx").on(table.resourceType, table.resourceId),
  ]
);
