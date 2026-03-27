WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "learner_id", "topic_id"
      ORDER BY "due_at" DESC, "created_at" DESC, "id" DESC
    ) AS row_num
  FROM "review_queue"
  WHERE "reason" = 'scheduled'
    AND "fulfilled_at" IS NULL
)
UPDATE "review_queue" AS rq
SET "fulfilled_at" = now()
FROM ranked
WHERE rq."id" = ranked."id"
  AND ranked.row_num > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_queue_active_scheduled_unique_idx"
ON "review_queue" USING btree ("learner_id", "topic_id")
WHERE "reason" = 'scheduled' AND "fulfilled_at" IS NULL;
