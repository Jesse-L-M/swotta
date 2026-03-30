CREATE TYPE "public"."diagnostic_status" AS ENUM('pending', 'completed', 'skipped');--> statement-breakpoint
ALTER TABLE "learner_qualifications" ADD COLUMN "diagnostic_status" "diagnostic_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "learner_qualifications" AS "lq"
SET "diagnostic_status" = 'skipped'
WHERE EXISTS (
  SELECT 1
  FROM "learner_topic_state" AS "lts"
  INNER JOIN "topics" AS "t" ON "t"."id" = "lts"."topic_id"
  WHERE "lts"."learner_id" = "lq"."learner_id"
    AND "t"."qualification_version_id" = "lq"."qualification_version_id"
);
