import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";

/**
 * Authentication and access-control journeys.
 *
 * These run against a real database and the real auth routes; only the AI
 * provider and file storage are replaced by E2E_MODE.
 */

test("a new farmer can sign up, reach chat, and cannot open admin routes", async ({
  page,
}) => {
  await signUp(page, { email: uniqueEmail("farmer") });

  await expect(page).toHaveURL(/\/chat/);
  await expect(
    page.getByPlaceholder(/describe what you see/i)
  ).toBeVisible();

  // Farmers must be redirected away from every admin route.
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/chat/);
});

test("signing up without the consent notice is rejected", async ({ request }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { "content-type": "application/json" },
    data: {
      name: "No Consent",
      email: uniqueEmail("no-consent"),
      password: "FarmHack-e2e-2026",
    },
  });

  expect(response.ok()).toBe(false);
  const body = await response.text();
  expect(body.toLowerCase()).toContain("privacy");
});

test("a farmer can download a copy of their account data", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("export") });
  await page.goto("/profile");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /download my data/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/farmhackai-export-.*\.json/);
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk.toString();
  const exported = JSON.parse(content);
  expect(exported.account.email).toContain("@e2e.test");
  expect(Array.isArray(exported.conversations)).toBe(true);
});
