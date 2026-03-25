import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createE2ESessionCookie,
  isLocalHostname,
  type E2EFixtureKind,
} from "@/lib/e2e-auth";

const requestSchema = z.object({
  kind: z.enum(["student", "parent"]),
});

function getConfiguredSecret(): string | null {
  const secret = process.env.E2E_AUTH_BYPASS_SECRET?.trim();
  return secret ? secret : null;
}

function isE2EAuthRouteEnabled(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const secret = getConfiguredSecret();
  if (!secret) {
    return false;
  }

  return isLocalHostname(new URL(request.url).hostname);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = getConfiguredSecret();
  if (!secret) {
    return false;
  }

  return request.headers.get("x-e2e-auth-secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!isE2EAuthRouteEnabled(request)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body" } },
      { status: 400 }
    );
  }

  const sessionCookie = createE2ESessionCookie(parsed.data.kind as E2EFixtureKind);
  if (!sessionCookie) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      sessionCookie,
    },
  });
}
