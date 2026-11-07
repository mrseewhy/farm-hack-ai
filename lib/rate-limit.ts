/**
 * Per-user AI assessment limiting.
 *
 * Gemini requests cost money and the free tier is small, so a single account
 * must not be able to consume the whole quota. This module owns the policy
 * (how many successful assessments one user may trigger in a rolling window)
 * and stays dependency-free so the dependency-free Node test runner can
 * exercise it without a database.
 *
 * The limit counts *stored assessments*, not HTTP calls: retrying a message
 * that already has an assessment is idempotent and does not consume the
 * budget. That also means failed model attempts are not counted here, so this
 * is an abuse deterrent rather than a complete cost ledger.
 */

export const DEFAULT_DAILY_ASSESSMENT_LIMIT = 20;
export const ASSESSMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_CONFIGURABLE_LIMIT = 500;

/**
 * Read the limit from `AI_MAX_ASSESSMENTS_PER_DAY`, clamped to a sane range.
 * A missing or malformed value falls back to the default rather than disabling
 * the limit, so a typo cannot silently remove the protection.
 */
export function dailyAssessmentLimit(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.AI_MAX_ASSESSMENTS_PER_DAY;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_DAILY_ASSESSMENT_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DAILY_ASSESSMENT_LIMIT;
  return Math.min(MAX_CONFIGURABLE_LIMIT, Math.max(1, Math.trunc(parsed)));
}

/** Start of the rolling window used by the count query. */
export function assessmentWindowStart(now: number = Date.now()): Date {
  return new Date(now - ASSESSMENT_WINDOW_MS);
}

/** True when the user has used up the allowance for the current window. */
export function isDailyAssessmentLimitReached(
  count: number,
  limit: number
): boolean {
  return count >= limit;
}