import { test, expect } from "@playwright/test";
import path from "node:path";
import { sendSymptom, signUp, uniqueEmail } from "./helpers";

/**
 * Farmer chat journeys.
 *
 * E2E_MODE replaces the Gemini call with a deterministic assessment fixture and
 * stores uploads under `public/e2e-uploads`, so these tests exercise the real
 * server actions, database writes, image validation, and UI rendering without
 * spending provider quota or needing a Cloudinary account.
 */

test("a farmer can describe symptoms and receive a structured assessment", async ({
  page,
}) => {
  await signUp(page, { email: uniqueEmail("chat") });
  await sendSymptom(
    page,
    "The lower leaves are turning yellow and some have dark spots."
  );

  await expect(page.getByText(/possible causes/i).first()).toBeVisible();
  await expect(page.getByText(/suggested actions/i).first()).toBeVisible();
  await expect(page.getByText(/when to seek help/i).first()).toBeVisible();
  await expect(page.getByText(/uncertainty/i).first()).toBeVisible();

  // The reply must be stored, so a reload restores it rather than re-asking.
  await page.reload();
  await expect(page.getByText(/observed signs/i).first()).toBeVisible();
});

test("a farmer can attach a crop photo and get an image-aware assessment", async ({
  page,
}) => {
  await signUp(page, { email: uniqueEmail("photo") });

  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join("e2e", "fixtures", "leaf.png"));
  await expect(page.getByText("leaf.png")).toBeVisible();

  await sendSymptom(page, "Yellowing on the lower leaves of my tomato plant.");

  // The fixture reports the attached photo as evidence in observed signs,
  // proving the upload reached the assessment path rather than being ignored.
  await expect(
    page.getByText(/test crop photo was attached/i)
  ).toBeVisible();
});

test("a provider failure keeps the message and offers a retry", async ({
  page,
}) => {
  await signUp(page, { email: uniqueEmail("retry") });

  // The marker is honoured only under E2E_MODE (see lib/e2e.ts), so this
  // exercises the real failure path: telemetry, retry-job insert, and the
  // farmer-facing queued state, without a provider outage.
  await page
    .getByPlaceholder(/describe what you see/i)
    .fill("e2e-force-provider-failure: lower leaves are turning yellow");
  await page.getByRole("button", { name: /send message/i }).click();

  await expect(
    page.getByText(/your message is saved and will be retried/i)
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /retry analysis/i })).toBeVisible();
});
