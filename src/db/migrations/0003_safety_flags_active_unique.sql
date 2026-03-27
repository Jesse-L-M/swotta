WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "learner_id", "flag_type"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS row_num
  FROM "safety_flags"
  WHERE "resolved" = false
)
UPDATE "safety_flags" AS sf
SET
  "resolved" = true,
  "resolved_at" = COALESCE(sf."resolved_at", now()),
  "resolution_notes" = COALESCE(
    sf."resolution_notes",
    'Superseded by duplicate cleanup migration'
  )
FROM ranked
WHERE sf."id" = ranked."id"
  AND ranked.row_num > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "safety_flags_active_unique_idx"
ON "safety_flags" USING btree ("learner_id", "flag_type")
WHERE "resolved" = false;
