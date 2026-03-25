import crypto from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";

const E2E_SESSION_PREFIX = "e2e";
const E2E_SESSION_TTL_SECONDS = 60 * 10;

const e2eFixtureUids = {
  student: "e2e-test-student",
  parent: "e2e-test-parent",
} as const;

type E2EFixtureKind = keyof typeof e2eFixtureUids;

interface E2ESessionPayload {
  uid: string;
  exp: number;
  iat: number;
}

function getE2EAuthSecret(): string | null {
  const secret = process.env.E2E_AUTH_BYPASS_SECRET?.trim();
  return secret ? secret : null;
}

function signPayload(payloadBase64: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64url");
}

function decodePayload(payloadBase64: string): E2ESessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8")
    ) as Partial<E2ESessionPayload>;

    if (
      typeof parsed.uid !== "string"
      || typeof parsed.exp !== "number"
      || typeof parsed.iat !== "number"
    ) {
      return null;
    }

    return {
      uid: parsed.uid,
      exp: parsed.exp,
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

function verifySignature(signature: string, expectedSignature: string): boolean {
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
  );
}

export function createE2ESessionCookie(kind: E2EFixtureKind): string | null {
  const secret = getE2EAuthSecret();
  if (!secret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payloadBase64 = Buffer.from(
    JSON.stringify({
      uid: e2eFixtureUids[kind],
      iat: now,
      exp: now + E2E_SESSION_TTL_SECONDS,
    } satisfies E2ESessionPayload)
  ).toString("base64url");

  const signature = signPayload(payloadBase64, secret);
  return `${E2E_SESSION_PREFIX}.${payloadBase64}.${signature}`;
}

export function verifyE2ESessionCookie(
  sessionCookie: string
): DecodedIdToken | null {
  const secret = getE2EAuthSecret();
  if (!secret) {
    return null;
  }

  const parts = sessionCookie.split(".");
  if (parts.length !== 3 || parts[0] !== E2E_SESSION_PREFIX) {
    return null;
  }

  const [, payloadBase64, signature] = parts;
  const expectedSignature = signPayload(payloadBase64, secret);
  if (!verifySignature(signature, expectedSignature)) {
    return null;
  }

  const payload = decodePayload(payloadBase64);
  if (!payload) {
    return null;
  }

  if (!Object.values(e2eFixtureUids).includes(payload.uid)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }

  return {
    uid: payload.uid,
    aud: "swotta-e2e",
    auth_time: payload.iat,
    exp: payload.exp,
    firebase: { identities: {}, sign_in_provider: "custom" },
    iat: payload.iat,
    iss: "swotta-e2e",
    sub: payload.uid,
  } as DecodedIdToken;
}

export type { E2EFixtureKind };
