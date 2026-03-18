import type { Page } from "@playwright/test";

/**
 * Authenticate a Playwright page by setting a Firebase session cookie.
 * In E2E tests, we bypass Firebase Auth and set the cookie directly.
 */
export async function authenticateAsStudent(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "__session",
      value: "e2e-test-student-session",
      domain: "localhost",
      path: "/",
    },
  ]);
}

export async function authenticateAsParent(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "__session",
      value: "e2e-test-parent-session",
      domain: "localhost",
      path: "/",
    },
  ]);
}
