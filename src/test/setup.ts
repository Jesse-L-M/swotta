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

  // Single statement truncates all tables. CASCADE handles FK dependencies.
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log, safety_flags, notification_events, weekly_reports,
      teacher_notes, assignments, review_queue, block_attempts,
      study_blocks, study_plans, study_sessions, retention_events,
      confidence_events, misconception_events, memory_confirmed,
      memory_candidates, learner_preferences, learner_component_state,
      learner_topic_state, source_mappings, chunk_embeddings,
      source_chunks, source_files, source_collections, task_rules,
      misconception_rules, command_words, question_types, topic_edges,
      topics, assessment_components, qualification_versions,
      qualifications, subjects, exam_boards, policies,
      learner_qualifications, enrollments, cohorts, classes,
      staff_profiles, guardian_links, learners, memberships,
      users, organizations
    CASCADE
  `);
}

export async function teardownTestDatabase() {
  if (queryClient) {
    await queryClient.end();
  }
}
