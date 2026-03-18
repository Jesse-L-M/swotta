-- Rename clerk_id to firebase_uid on users table
ALTER TABLE "users" RENAME COLUMN "clerk_id" TO "firebase_uid";

-- Drop old index and create new one
DROP INDEX IF EXISTS "users_clerk_id_idx";
CREATE INDEX "users_firebase_uid_idx" ON "users" USING btree ("firebase_uid");
