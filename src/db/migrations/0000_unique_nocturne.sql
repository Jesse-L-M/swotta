CREATE TYPE "public"."block_status" AS ENUM('pending', 'active', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('retrieval_drill', 'explanation', 'worked_example', 'timed_problems', 'essay_planning', 'source_analysis', 'mistake_review', 'reentry');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('prerequisite', 'builds_on', 'related');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('disengagement', 'avoidance', 'distress', 'overreliance');--> statement-breakpoint
CREATE TYPE "public"."help_timing" AS ENUM('before_attempt', 'after_attempt');--> statement-breakpoint
CREATE TYPE "public"."learner_qual_status" AS ENUM('active', 'completed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."mapping_method" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'push', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('household', 'school', 'tutor_org');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('weekly', 'exam_prep', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."policy_scope" AS ENUM('global', 'qualification', 'org', 'class', 'learner');--> statement-breakpoint
CREATE TYPE "public"."qual_level" AS ENUM('GCSE', 'AS', 'A-Level', 'IB', 'BTEC', 'Scottish_National', 'Scottish_Higher');--> statement-breakpoint
CREATE TYPE "public"."retention_outcome" AS ENUM('remembered', 'partial', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."review_reason" AS ENUM('scheduled', 'decay', 'misconception', 'exam_approaching');--> statement-breakpoint
CREATE TYPE "public"."role_type" AS ENUM('learner', 'guardian', 'tutor', 'teacher', 'school_admin', 'org_owner');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('private', 'household', 'class', 'org', 'system');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'abandoned', 'timeout');--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject_id" uuid,
	"qualification_version_id" uuid,
	"year_group" integer,
	"academic_year" varchar(9) NOT NULL,
	"teacher_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"cohort_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unenrolled_at" timestamp with time zone,
	CONSTRAINT "enrollments_learner_class_unique" UNIQUE("learner_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "guardian_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"relationship" varchar(50) NOT NULL,
	"receives_weekly_report" boolean DEFAULT true NOT NULL,
	"receives_flags" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_links_guardian_learner_unique" UNIQUE("guardian_user_id","learner_id")
);
--> statement-breakpoint
CREATE TABLE "learner_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"qualification_version_id" uuid NOT NULL,
	"target_grade" varchar(10),
	"exam_date" date,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_qualifications_learner_qv_unique" UNIQUE("learner_id","qualification_version_id")
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"year_group" integer,
	"date_of_birth" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learners_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "role_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_org_role_unique" UNIQUE("user_id","org_id","role")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "org_type" NOT NULL,
	"slug" varchar(100) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"scope_id" uuid,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_scope_key_unique" UNIQUE("scope_type","scope_id","key")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"title" varchar(255),
	"department" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_user_org_unique" UNIQUE("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_version_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"weight_percent" integer NOT NULL,
	"duration_minutes" integer,
	"total_marks" integer,
	"is_exam" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_version_id" uuid NOT NULL,
	"word" varchar(100) NOT NULL,
	"definition" text NOT NULL,
	"expected_depth" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_words_qv_word_unique" UNIQUE("qualification_version_id","word")
);
--> statement-breakpoint
CREATE TABLE "exam_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(20) NOT NULL,
	"country" varchar(2) DEFAULT 'GB' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_boards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "misconception_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"description" text NOT NULL,
	"trigger_patterns" text[] NOT NULL,
	"correction_guidance" text NOT NULL,
	"severity" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_id" uuid NOT NULL,
	"exam_board_id" uuid NOT NULL,
	"version_code" varchar(50) NOT NULL,
	"first_exam_year" integer NOT NULL,
	"last_exam_year" integer,
	"spec_url" text,
	"total_marks" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualification_versions_qual_board_code_unique" UNIQUE("qualification_id","exam_board_id","version_code")
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"level" "qual_level" NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualifications_subject_level_unique" UNIQUE("subject_id","level")
);
--> statement-breakpoint
CREATE TABLE "question_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_version_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"typical_marks" integer,
	"mark_scheme_pattern" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"question_type_id" uuid,
	"block_type" "block_type" NOT NULL,
	"difficulty_min" integer DEFAULT 1 NOT NULL,
	"difficulty_max" integer DEFAULT 5 NOT NULL,
	"time_estimate_minutes" integer NOT NULL,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_topic_id" uuid NOT NULL,
	"to_topic_id" uuid NOT NULL,
	"edge_type" "edge_type" NOT NULL,
	"weight" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_edges_from_to_type_unique" UNIQUE("from_topic_id","to_topic_id","edge_type"),
	CONSTRAINT "topic_edges_no_self_ref" CHECK ("topic_edges"."from_topic_id" != "topic_edges"."to_topic_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_version_id" uuid NOT NULL,
	"parent_topic_id" uuid,
	"name" varchar(255) NOT NULL,
	"code" varchar(50),
	"depth" integer DEFAULT 0 NOT NULL,
	"sort_order" integer NOT NULL,
	"description" text,
	"estimated_hours" numeric(4, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_embeddings_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "scope_type" NOT NULL,
	"learner_id" uuid,
	"org_id" uuid,
	"class_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_collections_scope_check" CHECK (("source_collections"."scope" = 'system' AND "source_collections"."learner_id" IS NULL AND "source_collections"."org_id" IS NULL AND "source_collections"."class_id" IS NULL) OR ("source_collections"."scope" = 'private' AND "source_collections"."learner_id" IS NOT NULL) OR ("source_collections"."scope" IN ('household', 'org') AND "source_collections"."org_id" IS NOT NULL) OR ("source_collections"."scope" = 'class' AND "source_collections"."class_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"topic_id" uuid,
	"component_id" uuid,
	"confidence" numeric(3, 2) NOT NULL,
	"mapping_method" "mapping_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_mappings_has_target" CHECK ("source_mappings"."topic_id" IS NOT NULL OR "source_mappings"."component_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "confidence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"block_attempt_id" uuid,
	"self_rated" numeric(4, 3) NOT NULL,
	"actual" numeric(4, 3) NOT NULL,
	"delta" numeric(4, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_component_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"predicted_grade" varchar(10),
	"predicted_percent" numeric(5, 2),
	"confidence" numeric(4, 3) DEFAULT '0.000' NOT NULL,
	"last_assessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_component_state_learner_component_unique" UNIQUE("learner_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "learner_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"source" varchar(50) DEFAULT 'inferred' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_preferences_learner_key_unique" UNIQUE("learner_id","key")
);
--> statement-breakpoint
CREATE TABLE "learner_topic_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"mastery_level" numeric(4, 3) DEFAULT '0.000' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.000' NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.50' NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_topic_state_learner_topic_unique" UNIQUE("learner_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "memory_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_confirmed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"source_candidate_id" uuid,
	"confirmed_by" varchar(50) NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "misconception_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"misconception_rule_id" uuid,
	"block_attempt_id" uuid,
	"description" text NOT NULL,
	"severity" integer NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"block_attempt_id" uuid,
	"interval_days" integer NOT NULL,
	"outcome" "retention_outcome" NOT NULL,
	"ease_factor_before" numeric(4, 2) NOT NULL,
	"ease_factor_after" numeric(4, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"block_id" uuid,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"summary" text,
	"topics_covered" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"blocks_completed" integer DEFAULT 0 NOT NULL,
	"total_duration_minutes" integer,
	"mood_start" integer,
	"mood_end" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid,
	"learner_id" uuid NOT NULL,
	"set_by_user_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"source_file_id" uuid,
	"topic_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"score" numeric(5, 2),
	"confidence_before" numeric(4, 3),
	"confidence_after" numeric(4, 3),
	"help_requested" boolean DEFAULT false NOT NULL,
	"help_timing" "help_timing",
	"misconceptions_detected" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"raw_interaction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"type" varchar(100) NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"subject" varchar(255),
	"payload" jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"reason" "review_reason" NOT NULL,
	"priority" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"block_attempt_id" uuid,
	"flag_type" "flag_type" NOT NULL,
	"severity" "flag_severity" NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"block_type" "block_type" NOT NULL,
	"scheduled_date" date,
	"scheduled_order" integer,
	"duration_minutes" integer NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" "block_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"plan_type" "plan_type" NOT NULL,
	"title" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"plan_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"summary" text NOT NULL,
	"mastery_changes" jsonb NOT NULL,
	"sessions_completed" integer NOT NULL,
	"total_study_minutes" integer NOT NULL,
	"topics_reviewed" integer NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_qualifications" ADD CONSTRAINT "learner_qualifications_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learners" ADD CONSTRAINT "learners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learners" ADD CONSTRAINT "learners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_qualification_version_id_qualification_versions_id_fk" FOREIGN KEY ("qualification_version_id") REFERENCES "public"."qualification_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_words" ADD CONSTRAINT "command_words_qualification_version_id_qualification_versions_id_fk" FOREIGN KEY ("qualification_version_id") REFERENCES "public"."qualification_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_rules" ADD CONSTRAINT "misconception_rules_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_versions" ADD CONSTRAINT "qualification_versions_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_versions" ADD CONSTRAINT "qualification_versions_exam_board_id_exam_boards_id_fk" FOREIGN KEY ("exam_board_id") REFERENCES "public"."exam_boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_types" ADD CONSTRAINT "question_types_qualification_version_id_qualification_versions_id_fk" FOREIGN KEY ("qualification_version_id") REFERENCES "public"."qualification_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_rules" ADD CONSTRAINT "task_rules_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_rules" ADD CONSTRAINT "task_rules_question_type_id_question_types_id_fk" FOREIGN KEY ("question_type_id") REFERENCES "public"."question_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_edges" ADD CONSTRAINT "topic_edges_from_topic_id_topics_id_fk" FOREIGN KEY ("from_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_edges" ADD CONSTRAINT "topic_edges_to_topic_id_topics_id_fk" FOREIGN KEY ("to_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_qualification_version_id_qualification_versions_id_fk" FOREIGN KEY ("qualification_version_id") REFERENCES "public"."qualification_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_source_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_collections" ADD CONSTRAINT "source_collections_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_collections" ADD CONSTRAINT "source_collections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_collections" ADD CONSTRAINT "source_collections_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_collection_id_source_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."source_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_mappings" ADD CONSTRAINT "source_mappings_chunk_id_source_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_mappings" ADD CONSTRAINT "source_mappings_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_mappings" ADD CONSTRAINT "source_mappings_component_id_assessment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."assessment_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confidence_events" ADD CONSTRAINT "confidence_events_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confidence_events" ADD CONSTRAINT "confidence_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_component_state" ADD CONSTRAINT "learner_component_state_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_component_state" ADD CONSTRAINT "learner_component_state_component_id_assessment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."assessment_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_preferences" ADD CONSTRAINT "learner_preferences_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_topic_state" ADD CONSTRAINT "learner_topic_state_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_topic_state" ADD CONSTRAINT "learner_topic_state_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_candidates" ADD CONSTRAINT "memory_candidates_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_confirmed" ADD CONSTRAINT "memory_confirmed_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_confirmed" ADD CONSTRAINT "memory_confirmed_source_candidate_id_memory_candidates_id_fk" FOREIGN KEY ("source_candidate_id") REFERENCES "public"."memory_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_events" ADD CONSTRAINT "misconception_events_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_events" ADD CONSTRAINT "misconception_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_events" ADD CONSTRAINT "misconception_events_misconception_rule_id_misconception_rules_id_fk" FOREIGN KEY ("misconception_rule_id") REFERENCES "public"."misconception_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_events" ADD CONSTRAINT "retention_events_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_events" ADD CONSTRAINT "retention_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_file_id_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_attempts" ADD CONSTRAINT "block_attempts_block_id_study_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."study_blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_block_attempt_id_block_attempts_id_fk" FOREIGN KEY ("block_attempt_id") REFERENCES "public"."block_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_blocks" ADD CONSTRAINT "study_blocks_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_blocks" ADD CONSTRAINT "study_blocks_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_blocks" ADD CONSTRAINT "study_blocks_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "topics_qualification_version_id_idx" ON "topics" USING btree ("qualification_version_id");--> statement-breakpoint
CREATE INDEX "topics_parent_topic_id_idx" ON "topics" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "chunk_embeddings_embedding_idx" ON "chunk_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "source_chunks_file_id_idx" ON "source_chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "source_collections_learner_id_idx" ON "source_collections" USING btree ("learner_id") WHERE "source_collections"."learner_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "source_collections_org_id_idx" ON "source_collections" USING btree ("org_id") WHERE "source_collections"."org_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "source_collections_class_id_idx" ON "source_collections" USING btree ("class_id") WHERE "source_collections"."class_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "source_files_collection_id_idx" ON "source_files" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "source_files_status_idx" ON "source_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_mappings_chunk_id_idx" ON "source_mappings" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "source_mappings_topic_id_idx" ON "source_mappings" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "learner_topic_state_next_review_idx" ON "learner_topic_state" USING btree ("learner_id","next_review_at");--> statement-breakpoint
CREATE INDEX "memory_candidates_learner_id_idx" ON "memory_candidates" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "memory_confirmed_learner_id_idx" ON "memory_confirmed" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "misconception_events_learner_topic_idx" ON "misconception_events" USING btree ("learner_id","topic_id");--> statement-breakpoint
CREATE INDEX "study_sessions_learner_id_idx" ON "study_sessions" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "study_sessions_status_idx" ON "study_sessions" USING btree ("learner_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "notification_events_user_idx" ON "notification_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "review_queue_learner_due_idx" ON "review_queue" USING btree ("learner_id","due_at") WHERE "review_queue"."fulfilled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "safety_flags_learner_idx" ON "safety_flags" USING btree ("learner_id") WHERE "safety_flags"."resolved" = false;--> statement-breakpoint
CREATE INDEX "study_blocks_learner_status_idx" ON "study_blocks" USING btree ("learner_id","status");--> statement-breakpoint
CREATE INDEX "study_blocks_scheduled_idx" ON "study_blocks" USING btree ("learner_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "study_plans_learner_status_idx" ON "study_plans" USING btree ("learner_id","status");