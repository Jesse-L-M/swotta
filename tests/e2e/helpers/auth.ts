import type { Page } from "@playwright/test";

const E2E_AUTH_ENDPOINT = "http://localhost:3000/api/auth/e2e-session";

/**
 * Authenticate a Playwright page by minting a signed local-only session cookie.
 */
async function createSessionCookie(kind: "student" | "parent"): Promise<string> {
  const secret = process.env.E2E_AUTH_BYPASS_SECRET;
  if (!secret) {
    throw new Error("E2E_AUTH_BYPASS_SECRET must be set for Playwright auth");
  }

  const response = await fetch(E2E_AUTH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-e2e-auth-secret": secret,
    },
    body: JSON.stringify({ kind }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to mint E2E session cookie (${response.status})`
    );
  }

  const body = (await response.json()) as {
    data?: { sessionCookie?: string };
  };

  const sessionCookie = body.data?.sessionCookie;
  if (!sessionCookie) {
    throw new Error("E2E auth endpoint did not return a session cookie");
  }

  return sessionCookie;
}

async function authenticateAs(page: Page, kind: "student" | "parent"): Promise<void> {
  const sessionCookie = await createSessionCookie(kind);
  await page.context().addCookies([
    {
      name: "__session",
      value: sessionCookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function authenticateAsStudent(page: Page): Promise<void> {
  await authenticateAs(page, "student");
}

export async function authenticateAsParent(page: Page): Promise<void> {
  await authenticateAs(page, "parent");
}
