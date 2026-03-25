import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyE2ESessionCookie } from "@/lib/e2e-auth";

function makeRequest(
  body: Record<string, unknown>,
  options?: { secret?: string; url?: string }
): NextRequest {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options?.secret) {
    headers.set("x-e2e-auth-secret", options.secret);
  }

  return new NextRequest(options?.url ?? "http://localhost:3000/api/auth/e2e-session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/e2e-session", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.E2E_AUTH_BYPASS_SECRET;
  });

  it("returns a signed session cookie when authorized locally", async () => {
    process.env.E2E_AUTH_BYPASS_SECRET = "local-test-secret";

    const response = await POST(
      makeRequest(
        { kind: "student" },
        { secret: "local-test-secret" }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.data.sessionCookie).toBe("string");
    expect(verifyE2ESessionCookie(body.data.sessionCookie)?.uid).toBe(
      "e2e-test-student"
    );
  });

  it("returns 404 when the bypass is not configured", async () => {
    const response = await POST(
      makeRequest(
        { kind: "student" },
        { secret: "missing-secret" }
      )
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when the secret is wrong", async () => {
    process.env.E2E_AUTH_BYPASS_SECRET = "local-test-secret";

    const response = await POST(
      makeRequest(
        { kind: "student" },
        { secret: "wrong-secret" }
      )
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 for non-local hosts", async () => {
    process.env.E2E_AUTH_BYPASS_SECRET = "local-test-secret";

    const response = await POST(
      makeRequest(
        { kind: "student" },
        {
          secret: "local-test-secret",
          url: "https://staging.example.com/api/auth/e2e-session",
        }
      )
    );

    expect(response.status).toBe(404);
  });
});
