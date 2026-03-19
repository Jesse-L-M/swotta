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

let cached: Env | null = null;
let cachedDiagnosticSessionEnv: DiagnosticSessionEnv | null = null;

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

export function resetEnvCache(): void {
  cached = null;
  cachedDiagnosticSessionEnv = null;
}
