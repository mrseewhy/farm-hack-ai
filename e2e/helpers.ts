import { expect, type Page } from "@playwright/test";
import { CONSENT_POLICY_VERSION } from "../lib/consent";

/**
 * Shared Playwright helpers.
 *
 * Accounts are unique per run so a reused local database does not collide, and
 * every signup sends the consent policy version, exactly as the real form does.
 *
 * The admin domain is promoted only when `E2E_MODE=1` and Next is running in
 * development (see `lib/e2e.ts`), so this cannot create an admin in production.
 */
export const E2E_ADMIN_DOMAIN = "admin.e2e.test";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e.test`;
}

export function uniqueAdminEmail(): string {
  return `admin-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${E2E_ADMIN_DOMAIN}`;
}

async function waitForHydration(page: Page): Promise<void> {
  // React attaches its fiber/props markers to real DOM nodes once hydration
  // completes. Without this wait, a fast Playwright run can click submit before
  // the handler is attached, and the browser performs a native GET submit.
  await page.waitForFunction(
    () => {
      const target = document.querySelector("form") ?? document.body;
      return Object.keys(target).some(
        (key) =>
          key.startsWith("__reactFiber") || key.startsWith("__reactProps")
      );
    },
    undefined,
    { timeout: 30_000 }
  );
}

async function fillSignup(
  page: Page,
  options: { email: string; name?: string; password?: string }
): Promise<void> {
  const password = options.password ?? "FarmHack-e2e-2026";
  await page.goto("/signup");
  await waitForHydration(page);
  await page.getByLabel(/full name/i).fill(options.name ?? "E2E Farmer");
  await page.getByLabel(/email address/i).fill(options.email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /create account/i }).click();
}

export async function signUp(
  page: Page,
  options: { email: string; name?: string; password?: string }
): Promise<void> {
  await fillSignup(page, options);
  await page.waitForURL(/\/chat/, { timeout: 45_000 });
}

export async function signUpAdmin(
  page: Page,
  options: { email: string; name?: string; password?: string }
): Promise<void> {
  await fillSignup(page, options);
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 45_000 });
}

/** Open the composer, send one symptom description, and wait for the reply. */
export async function sendSymptom(page: Page, text: string): Promise<void> {
  await waitForHydration(page);
  const composer = page.getByPlaceholder(/describe what you see/i);
  await composer.fill(text);
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByText(/observed signs/i).first()).toBeVisible({
    timeout: 60_000,
  });
}

export const consentVersion = CONSENT_POLICY_VERSION;
