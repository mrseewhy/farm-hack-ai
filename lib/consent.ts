/**
 * Versioned consent policy.
 *
 * Bump CONSENT_POLICY_VERSION whenever the privacy notice changes in a way
 * that requires farmers to accept again. The signup form passes this exact
 * value to Better Auth; the user-create hook rejects signups without it and
 * writes an append-only consent record.
 */
export const CONSENT_POLICY_VERSION = "2026-11-07";

export const DATA_PROCESSING_CONSENT = "data_processing";

export const CONSENT_PURPOSES = [
  "Create crop conversations and store the text and photos you send",
  "Send text and photos to the AI provider to produce a crop assessment",
  "Store metadata-only operational telemetry (no farmer text or photos)",
  "Email you a follow-up reminder if you opt in to feedback requests",
] as const;

/**
 * Header the signup form sends alongside the Better Auth request.
 *
 * A header is used rather than an extra body field because Better Auth strips
 * unknown body properties before the signup hook runs, and the consent value
 * must be visible to that hook to reject an account without consent.
 */
export const CONSENT_HEADER = "x-farmhack-consent";

/** True only for the currently published policy version. */
export function isAcceptedConsentVersion(value: unknown): boolean {
  return typeof value === "string" && value.trim() === CONSENT_POLICY_VERSION;
}

export type ConsentRecord = {
  consentKey: string;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
};
