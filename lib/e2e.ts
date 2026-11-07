/**
 * Deterministic local-only test mode for Playwright.
 *
 * The production pipeline must never fabricate an assessment. This module
 * therefore refuses to activate unless ALL of the following hold:
 *   - E2E_MODE is explicitly "1";
 *   - Next is running in development (the Playwright dev server);
 *   - the deployment is not Vercel production.
 *
 * The CI and local Playwright commands start `next dev`, so these tests can
 * exercise signup, upload, assessment, and admin journeys without a live model
 * or Cloudinary account. Production builds cannot enter this branch.
 */
export function isE2eMode(): boolean {
  return (
    process.env.E2E_MODE === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production"
  );
}

/**
 * A valid, deliberately conservative assessment fixture. It exercises the
 * normal schema/safety path and remains useful when a test asserts the UI.
 */
export function e2eAssessmentText(hasImages: boolean): string {
  return JSON.stringify({
    observedSigns: hasImages
      ? ["Yellowing on the lower leaves", "A test crop photo was attached"]
      : ["Lower leaves are turning yellow"],
    possibleCauses: ["Possible nutrient deficiency", "Possible water stress"],
    followUpQuestions: ["When did the yellowing start?"],
    immediateActions: [
      "Remove the most affected leaves",
      "Check that the soil drains well",
    ],
    whenToSeekHelp:
      "Consult a local agricultural extension worker if the yellowing spreads.",
    uncertainty: {
      level: "medium",
      reason: "This is a preliminary assessment from limited evidence.",
    },
  });
}
