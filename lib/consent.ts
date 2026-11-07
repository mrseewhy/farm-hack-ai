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

export type ConsentRecord = {
  consentKey: string;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
};
