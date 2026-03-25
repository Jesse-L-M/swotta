/**
 * Playwright global setup.
 * The Playwright config injects a per-run secret used by the local-only
 * E2E auth endpoint to mint signed session cookies.
 */
export default async function globalSetup() {
  // No-op — session cookies are minted per-test via the E2E auth endpoint.
}
