import { defineConfig, devices } from "@playwright/test";
import {
  ensureE2EAuthBypassSecret,
  getE2EAuthSecretFilePath,
} from "./src/lib/e2e-auth-secret";

const e2eAuthBypassSecret = ensureE2EAuthBypassSecret();
const e2eAuthSecretFilePath = getE2EAuthSecretFilePath();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    env: {
      E2E_AUTH_BYPASS_SECRET: e2eAuthBypassSecret,
      E2E_AUTH_BYPASS_SECRET_FILE: e2eAuthSecretFilePath,
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
