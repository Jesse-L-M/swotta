import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "@/test/setup";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
