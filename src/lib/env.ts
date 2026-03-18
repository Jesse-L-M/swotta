import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_TEST_URL: z.string().url().optional(),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),

  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),

  GCS_BUCKET_NAME: z.string().min(1),
  GCS_PROJECT_ID: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.format();
    const message = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, val]) => {
        const errors = (val as { _errors: string[] })._errors;
        return `  ${key}: ${errors.join(", ")}`;
      })
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${message}`);
  }
  return parsed.data;
}

export const env = validateEnv();
