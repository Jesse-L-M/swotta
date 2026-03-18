import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Authenticate a Playwright page using Clerk's testing token.
 * Requires CLERK_TESTING_TOKEN env var to be set (from Clerk dashboard → Testing).
 */
export async function authenticateAsStudent(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}

export async function authenticateAsParent(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}
