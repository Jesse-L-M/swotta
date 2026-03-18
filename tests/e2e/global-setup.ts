import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Playwright global setup.
 * Configures Clerk testing tokens so E2E tests can authenticate.
 * Requires CLERK_SECRET_KEY env var (from .env.local or CI secrets).
 */
export default async function globalSetup() {
  await clerkSetup();
}
