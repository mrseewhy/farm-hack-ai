import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite.
 *
 * The app runs against a real PostgreSQL database but in local `E2E_MODE`:
 * image uploads are written under `public/e2e-uploads` and the assessment is a
 * deterministic fixture instead of a Gemini call. `lib/e2e.ts` refuses to
 * activate outside development, so this cannot fabricate an assessment in a
 * production build.
 *
 * The suite therefore proves the journeys (signup, chat, upload, assessment,
 * admin access, human safety review), not model quality. Model behaviour is
 * covered by the evaluation harness.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E_MODE: "1",
      E2E_BASE_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
    },
  },
});
