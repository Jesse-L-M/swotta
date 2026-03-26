import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function normalizeSecret(secret: string | null | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? trimmed : null;
}

export function getE2EAuthSecretFilePath(): string {
  return (
    normalizeSecret(process.env.E2E_AUTH_BYPASS_SECRET_FILE)
    ?? path.join(process.cwd(), ".context", "e2e-auth-bypass-secret")
  );
}

function readE2EAuthSecretFile(): string | null {
  try {
    return normalizeSecret(
      readFileSync(getE2EAuthSecretFilePath(), "utf8")
    );
  } catch {
    return null;
  }
}

function persistE2EAuthSecret(secret: string): void {
  const filePath = getE2EAuthSecretFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${secret}\n`, "utf8");
}

export function getConfiguredE2EAuthSecret(): string | null {
  const envSecret = normalizeSecret(process.env.E2E_AUTH_BYPASS_SECRET);
  if (envSecret) {
    return envSecret;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return readE2EAuthSecretFile();
}

export function ensureE2EAuthBypassSecret(): string {
  const secret = getConfiguredE2EAuthSecret() ?? randomUUID();
  process.env.E2E_AUTH_BYPASS_SECRET = secret;
  persistE2EAuthSecret(secret);
  return secret;
}
