CREATE TYPE "public"."past_paper_signal_type" AS ENUM('mark_scheme_pattern', 'exam_technique');--> statement-breakpoint
CREATE TABLE "past_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualification_version_id" uuid NOT NULL REFERENCES "qualification_versions"("id"),
	"component_id" uuid NOT NULL REFERENCES "assessment_components"("id"),
	"slug" varchar(150) NOT NULL,
	"title" varchar(255) NOT NULL,
	"series" varchar(50) NOT NULL,
	"exam_year" integer NOT NULL,
	"paper_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_papers_qualification_slug_unique" UNIQUE("qualification_version_id","slug")
);
--> statement-breakpoint
CREATE TABLE "past_paper_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL REFERENCES "past_papers"("id") ON DELETE cascade,
	"question_number" varchar(50) NOT NULL,
	"question_order" integer NOT NULL,
	"locator" varchar(100) NOT NULL,
	"prompt_excerpt" text NOT NULL,
	"marks_available" integer NOT NULL,
	"question_type_id" uuid NOT NULL REFERENCES "question_types"("id"),
	"command_word_id" uuid REFERENCES "command_words"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_paper_questions_paper_question_number_unique" UNIQUE("paper_id","question_number"),
	CONSTRAINT "past_paper_questions_marks_positive" CHECK ("past_paper_questions"."marks_available" > 0)
);
--> statement-breakpoint
CREATE TABLE "past_paper_question_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"past_paper_question_id" uuid NOT NULL REFERENCES "past_paper_questions"("id") ON DELETE cascade,
	"topic_id" uuid REFERENCES "topics"("id"),
	"topic_hint" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.75' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_paper_question_topics_question_topic_hint_unique" UNIQUE("past_paper_question_id","topic_id","topic_hint"),
	CONSTRAINT "past_paper_question_topics_has_target" CHECK ("past_paper_question_topics"."topic_id" IS NOT NULL OR "past_paper_question_topics"."topic_hint" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "past_paper_question_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"past_paper_question_id" uuid NOT NULL REFERENCES "past_paper_questions"("id") ON DELETE cascade,
	"signal_type" "past_paper_signal_type" NOT NULL,
	"code" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_paper_question_signals_question_type_code_unique" UNIQUE("past_paper_question_id","signal_type","code")
);
--> statement-breakpoint
CREATE INDEX "past_papers_qualification_version_id_idx" ON "past_papers" USING btree ("qualification_version_id");--> statement-breakpoint
CREATE INDEX "past_papers_component_id_idx" ON "past_papers" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "past_paper_questions_paper_id_idx" ON "past_paper_questions" USING btree ("paper_id");--> statement-breakpoint
CREATE INDEX "past_paper_questions_question_type_id_idx" ON "past_paper_questions" USING btree ("question_type_id");--> statement-breakpoint
CREATE INDEX "past_paper_questions_command_word_id_idx" ON "past_paper_questions" USING btree ("command_word_id");--> statement-breakpoint
CREATE INDEX "past_paper_question_topics_question_id_idx" ON "past_paper_question_topics" USING btree ("past_paper_question_id");--> statement-breakpoint
CREATE INDEX "past_paper_question_topics_topic_id_idx" ON "past_paper_question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "past_paper_question_signals_question_id_idx" ON "past_paper_question_signals" USING btree ("past_paper_question_id");--> statement-breakpoint
CREATE INDEX "past_paper_question_signals_signal_type_idx" ON "past_paper_question_signals" USING btree ("signal_type");
