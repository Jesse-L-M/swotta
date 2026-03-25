import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "@/test/setup";

// Route all runtime db imports through the shared test connection so files do
// not create their own pooled postgres clients against the same database.
vi.mock("@/lib/db", async () => {
  const { getTestDb } = await import("@/test/setup");
  return { db: getTestDb() };
});

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
