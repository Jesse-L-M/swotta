import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_TEST_URL: z.string().url().optional(),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),

  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),

  GCS_BUCKET_NAME: z.string().min(1),
  GCS_PROJECT_ID: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),

  DIAGNOSTIC_SESSION_SECRET: z.string().min(1).optional(),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
type DiagnosticSessionEnv = Pick<Env, "DIAGNOSTIC_SESSION_SECRET">;

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).optional()
);

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().email().optional()
);

const storageEnvSchema = z.object({
  GCS_BUCKET_NAME: optionalNonEmptyString,
  GCS_PROJECT_ID: optionalNonEmptyString,
  FIREBASE_PROJECT_ID: optionalNonEmptyString,
  FIREBASE_CLIENT_EMAIL: optionalEmail,
  FIREBASE_PRIVATE_KEY: optionalNonEmptyString,
});

export type StorageEnv =
  | { mode: "unconfigured" }
  | {
      mode: "gcs";
      bucketName: string;
      projectId: string;
      clientEmail: string;
      privateKey: string;
    };

let cached: Env | null = null;
let cachedDiagnosticSessionEnv: DiagnosticSessionEnv | null = null;
let cachedStorageEnv: StorageEnv | null = null;

function formatEnvErrors(error: z.ZodError): string {
  const formatted = error.format();
  return Object.entries(formatted)
    .filter(([key]) => key !== "_errors")
    .map(([key, val]) => {
      const field = val as unknown as { _errors?: string[] };
      const errors = Array.isArray(field._errors) ? field._errors : [];
      return `  ${key}: ${errors.join(", ")}`;
    })
    .join("\n");
}

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = formatEnvErrors(parsed.error);
    throw new Error(`Missing or invalid environment variables:\n${message}`);
  }

  cached = parsed.data;
  return cached;
}

export function getDiagnosticSessionEnv(): DiagnosticSessionEnv {
  if (cachedDiagnosticSessionEnv) return cachedDiagnosticSessionEnv;

  const parsed = envSchema
    .pick({ DIAGNOSTIC_SESSION_SECRET: true })
    .safeParse(process.env);
  if (!parsed.success) {
    const message = formatEnvErrors(parsed.error);
    throw new Error(`Missing or invalid environment variables:\n${message}`);
  }

  cachedDiagnosticSessionEnv = parsed.data;
  return cachedDiagnosticSessionEnv;
}

export function getStorageEnv(): StorageEnv {
  if (cachedStorageEnv) return cachedStorageEnv;

  const parsed = storageEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = formatEnvErrors(parsed.error);
    throw new Error(`Missing or invalid storage environment variables:\n${message}`);
  }

  const bucketName = parsed.data.GCS_BUCKET_NAME;
  const projectId = parsed.data.GCS_PROJECT_ID ?? parsed.data.FIREBASE_PROJECT_ID;
  const clientEmail = parsed.data.FIREBASE_CLIENT_EMAIL;
  const privateKey = parsed.data.FIREBASE_PRIVATE_KEY;

  const hasAnyStorageConfig = Boolean(
    bucketName
      || parsed.data.GCS_PROJECT_ID
      || parsed.data.FIREBASE_PROJECT_ID
      || clientEmail
      || privateKey
  );

  if (!hasAnyStorageConfig) {
    cachedStorageEnv = { mode: "unconfigured" };
    return cachedStorageEnv;
  }

  const missing: string[] = [];

  if (!bucketName) {
    missing.push("GCS_BUCKET_NAME");
  }

  if (!projectId) {
    missing.push("GCS_PROJECT_ID or FIREBASE_PROJECT_ID");
  }

  if (!clientEmail) {
    missing.push("FIREBASE_CLIENT_EMAIL");
  }

  if (!privateKey) {
    missing.push("FIREBASE_PRIVATE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid storage environment variables:\n${missing.map((key) => `  ${key}: required when Cloud Storage uploads are enabled`).join("\n")}`
    );
  }

  const validatedBucketName = bucketName as string;
  const validatedProjectId = projectId as string;
  const validatedClientEmail = clientEmail as string;
  const validatedPrivateKey = privateKey as string;

  cachedStorageEnv = {
    mode: "gcs",
    bucketName: validatedBucketName,
    projectId: validatedProjectId,
    clientEmail: validatedClientEmail,
    privateKey: validatedPrivateKey.replace(/\\n/g, "\n"),
  };
  return cachedStorageEnv as StorageEnv;
}

export function resetEnvCache(): void {
  cached = null;
  cachedDiagnosticSessionEnv = null;
  cachedStorageEnv = null;
}
