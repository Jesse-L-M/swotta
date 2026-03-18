import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "@/test/setup";

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await cleanupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
