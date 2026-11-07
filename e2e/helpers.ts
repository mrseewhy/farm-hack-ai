import { expect, type Page } from "@playwright/test";
import { CONSENT_POLICY_VERSION } from "../lib/consent";

/**
 * Shared Playwright helpers.
 *
 * Accounts are unique per run so a reused local database does not collide, and
 * every signup sends the consent policy version, exactly as the real form does.
 */
export const E2E_ADMIN_EMAIL = "admin@e2e.test";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e.test`;
}

export async function signUp(
  page: Page,
  options: { email: string; name?: string; password?: string }
): Promise<void> {
  const password = options.password ?? "FarmHack-e2e-2026";
  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill(options.name ?? "E2E Farmer");
  await page.getByLabel(/email/i).first().fill(options.email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
}

/** Open the composer, send one symptom description, and wait for the reply. */
export async function sendSymptom(page: Page, text: string): Promise<void> {
  const composer = page.getByPlaceholder(/describe what you see/i);
  await composer.fill(text);
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText(/observed signs/i).first()).toBeVisible({
    timeout: 45_000,
  });
}

export const consentVersion = CONSENT_POLICY_VERSION;
