import { test, expect } from "@playwright/test";
import {
  sendSymptom,
  signUp,
  signUpAdmin,
  uniqueAdminEmail,
  uniqueEmail,
} from "./helpers";

/**
 * Admin journey: a farmer creates a flagged assessment, an admin sees it in the
 * review queue, opens the conversation, and records a human safety review.
 *
 * Two isolated browser contexts are used so the admin session never mixes with
 * the farmer session.
 */
test("an admin can review a farmer's flagged assessment", async ({ browser }) => {
  const farmerContext = await browser.newContext();
  const farmerPage = await farmerContext.newPage();

  await signUp(farmerPage, { email: uniqueEmail("farmer") });
  await sendSymptom(
    farmerPage,
    "Lower leaves are turning yellow and curling, and the spots are spreading."
  );

  await expect(farmerPage).toHaveURL(/\/chat\/\d+/);
  const conversationId = farmerPage.url().match(/\/chat\/(\d+)/)?.[1];
  expect(conversationId).toBeTruthy();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await signUpAdmin(adminPage, { email: uniqueAdminEmail() });
  await expect(adminPage).toHaveURL(/\/admin\/dashboard/);
  await expect(adminPage.getByText(/review queue/i).first()).toBeVisible();
  await expect(adminPage.getByText(/farmhack ai \/ admin/i)).toBeVisible();

  // Open the exact conversation the farmer just created.
  await adminPage.goto(`/admin/review/${conversationId}`);
  await expect(
    adminPage.getByText(`Conversation #${conversationId}`)
  ).toBeVisible();
  await expect(adminPage.getByText(/crop assessment/i)).toBeVisible();

  // The human-review loop must persist a decision and show it back.
  await adminPage.getByLabel("Decision").selectOption("needs_follow_up");
  await adminPage
    .getByLabel("Notes")
    .fill("E2E review: uncertainty is appropriate, action list is safe.");
  await adminPage.getByRole("button", { name: /save review/i }).click();

  await expect(adminPage.getByText(/review saved/i)).toBeVisible();
  await expect(adminPage.getByText("needs_follow_up").first()).toBeVisible();

  await farmerContext.close();
  await adminContext.close();
});
