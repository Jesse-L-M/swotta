import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import path from "path";

const TEST_DATABASE_URL =
  process.env.DATABASE_TEST_URL ??
  "postgresql://swotta:swotta_test@localhost:5433/swotta_test";

let migrationClient: ReturnType<typeof postgres>;
let queryClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

export function getTestDb() {
  if (!testDb) {
    queryClient = postgres(TEST_DATABASE_URL, { max: 5 });
    testDb = drizzle(queryClient, { schema });
  }
  return testDb;
}

export async function setupTestDatabase() {
  migrationClient = postgres(TEST_DATABASE_URL, { max: 1 });
  const migrationDb = drizzle(migrationClient);

  // Enable pgvector extension
  await migrationDb.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  await migrate(migrationDb, {
    migrationsFolder: path.resolve(__dirname, "../db/migrations"),
  });
  await migrationClient.end();

  return getTestDb();
}

export async function cleanupTestDatabase() {
  const db = getTestDb();

  // Truncate all tables in reverse dependency order
  // Layer 5 (Planning)
  await db.execute(sql`TRUNCATE TABLE audit_log CASCADE`);
  await db.execute(sql`TRUNCATE TABLE safety_flags CASCADE`);
  await db.execute(sql`TRUNCATE TABLE notification_events CASCADE`);
  await db.execute(sql`TRUNCATE TABLE weekly_reports CASCADE`);
  await db.execute(sql`TRUNCATE TABLE teacher_notes CASCADE`);
  await db.execute(sql`TRUNCATE TABLE assignments CASCADE`);
  await db.execute(sql`TRUNCATE TABLE review_queue CASCADE`);
  await db.execute(sql`TRUNCATE TABLE block_attempts CASCADE`);
  await db.execute(sql`TRUNCATE TABLE study_blocks CASCADE`);
  await db.execute(sql`TRUNCATE TABLE study_plans CASCADE`);

  // Layer 4 (Learner State)
  await db.execute(sql`TRUNCATE TABLE study_sessions CASCADE`);
  await db.execute(sql`TRUNCATE TABLE retention_events CASCADE`);
  await db.execute(sql`TRUNCATE TABLE confidence_events CASCADE`);
  await db.execute(sql`TRUNCATE TABLE misconception_events CASCADE`);
  await db.execute(sql`TRUNCATE TABLE memory_confirmed CASCADE`);
  await db.execute(sql`TRUNCATE TABLE memory_candidates CASCADE`);
  await db.execute(sql`TRUNCATE TABLE learner_preferences CASCADE`);
  await db.execute(sql`TRUNCATE TABLE learner_component_state CASCADE`);
  await db.execute(sql`TRUNCATE TABLE learner_topic_state CASCADE`);

  // Layer 3 (Sources)
  await db.execute(sql`TRUNCATE TABLE source_mappings CASCADE`);
  await db.execute(sql`TRUNCATE TABLE chunk_embeddings CASCADE`);
  await db.execute(sql`TRUNCATE TABLE source_chunks CASCADE`);
  await db.execute(sql`TRUNCATE TABLE source_files CASCADE`);
  await db.execute(sql`TRUNCATE TABLE source_collections CASCADE`);

  // Layer 2 (Curriculum)
  await db.execute(sql`TRUNCATE TABLE task_rules CASCADE`);
  await db.execute(sql`TRUNCATE TABLE misconception_rules CASCADE`);
  await db.execute(sql`TRUNCATE TABLE command_words CASCADE`);
  await db.execute(sql`TRUNCATE TABLE question_types CASCADE`);
  await db.execute(sql`TRUNCATE TABLE topic_edges CASCADE`);
  await db.execute(sql`TRUNCATE TABLE topics CASCADE`);
  await db.execute(sql`TRUNCATE TABLE assessment_components CASCADE`);
  await db.execute(sql`TRUNCATE TABLE qualification_versions CASCADE`);
  await db.execute(sql`TRUNCATE TABLE qualifications CASCADE`);
  await db.execute(sql`TRUNCATE TABLE subjects CASCADE`);
  await db.execute(sql`TRUNCATE TABLE exam_boards CASCADE`);

  // Layer 1 (Identity)
  await db.execute(sql`TRUNCATE TABLE policies CASCADE`);
  await db.execute(sql`TRUNCATE TABLE learner_qualifications CASCADE`);
  await db.execute(sql`TRUNCATE TABLE enrollments CASCADE`);
  await db.execute(sql`TRUNCATE TABLE cohorts CASCADE`);
  await db.execute(sql`TRUNCATE TABLE classes CASCADE`);
  await db.execute(sql`TRUNCATE TABLE staff_profiles CASCADE`);
  await db.execute(sql`TRUNCATE TABLE guardian_links CASCADE`);
  await db.execute(sql`TRUNCATE TABLE learners CASCADE`);
  await db.execute(sql`TRUNCATE TABLE memberships CASCADE`);
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  await db.execute(sql`TRUNCATE TABLE organizations CASCADE`);
}

export async function teardownTestDatabase() {
  if (queryClient) {
    await queryClient.end();
  }
}
