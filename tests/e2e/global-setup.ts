/**
 * Playwright global setup.
 * Firebase Auth doesn't need a testing token setup like Clerk did.
 * E2E tests use session cookies set directly via the API.
 */
export default async function globalSetup() {
  // No-op — Firebase Auth session cookies are set per-test via API calls
}
