import {
  getTestDb,
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "@/test/setup";
import { resetFixtureCounter } from "@/test/fixtures";

type EvalDb = ReturnType<typeof getTestDb>;

let readyPromise: Promise<EvalDb> | null = null;

async function ensureEvalDatabase(): Promise<EvalDb> {
  if (!readyPromise) {
    readyPromise = setupTestDatabase().then(() => getTestDb());
  }

  return readyPromise;
}

export async function withIsolatedEvalDb<T>(
  run: (db: EvalDb) => Promise<T>
): Promise<T> {
  const db = await ensureEvalDatabase();
  await cleanupTestDatabase();
  resetFixtureCounter();

  try {
    return await run(db);
  } finally {
    await cleanupTestDatabase();
    resetFixtureCounter();
  }
}

export async function closeEvalDatabase(): Promise<void> {
  await teardownTestDatabase();
  readyPromise = null;
}
