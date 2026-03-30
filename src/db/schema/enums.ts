import { pgEnum } from "drizzle-orm/pg-core";

export const orgTypeEnum = pgEnum("org_type", [
  "household",
  "school",
  "tutor_org",
]);

export const roleTypeEnum = pgEnum("role_type", [
  "learner",
  "guardian",
  "tutor",
  "teacher",
  "school_admin",
  "org_owner",
]);

export const scopeTypeEnum = pgEnum("scope_type", [
  "private",
  "household",
  "class",
  "org",
  "system",
]);

export const blockTypeEnum = pgEnum("block_type", [
  "retrieval_drill",
  "explanation",
  "worked_example",
  "timed_problems",
  "essay_planning",
  "source_analysis",
  "mistake_review",
  "reentry",
]);

export const blockStatusEnum = pgEnum("block_status", [
  "pending",
  "active",
  "completed",
  "skipped",
]);

export const fileStatusEnum = pgEnum("file_status", [
  "pending",
  "queueing",
  "processing",
  "ready",
  "failed",
]);

export const planTypeEnum = pgEnum("plan_type", [
  "weekly",
  "exam_prep",
  "recovery",
]);

export const planStatusEnum = pgEnum("plan_status", [
  "draft",
  "active",
  "completed",
  "abandoned",
]);

export const edgeTypeEnum = pgEnum("edge_type", [
  "prerequisite",
  "builds_on",
  "related",
]);

export const reviewReasonEnum = pgEnum("review_reason", [
  "scheduled",
  "decay",
  "misconception",
  "exam_approaching",
]);

export const helpTimingEnum = pgEnum("help_timing", [
  "before_attempt",
  "after_attempt",
]);

export const retentionOutcomeEnum = pgEnum("retention_outcome", [
  "remembered",
  "partial",
  "forgotten",
]);

export const flagTypeEnum = pgEnum("flag_type", [
  "disengagement",
  "avoidance",
  "distress",
  "overreliance",
]);

export const flagSeverityEnum = pgEnum("flag_severity", [
  "low",
  "medium",
  "high",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "push",
  "in_app",
]);

export const mappingMethodEnum = pgEnum("mapping_method", ["auto", "manual"]);

export const qualLevelEnum = pgEnum("qual_level", [
  "GCSE",
  "AS",
  "A-Level",
  "IB",
  "BTEC",
  "Scottish_National",
  "Scottish_Higher",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "completed",
  "abandoned",
  "timeout",
]);

export const learnerQualStatusEnum = pgEnum("learner_qual_status", [
  "active",
  "completed",
  "dropped",
]);

export const diagnosticStatusEnum = pgEnum("diagnostic_status", [
  "pending",
  "completed",
  "skipped",
]);

export const policyScopeEnum = pgEnum("policy_scope", [
  "global",
  "qualification",
  "org",
  "class",
  "learner",
]);
