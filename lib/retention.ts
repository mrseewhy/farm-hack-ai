/**
 * Retention policy helpers. Dependency-free so the cutoffs can be tested.
 *
 * Defaults are deliberately explicit and overridable per deployment. The
 * scheduled cleanup is the enforcement point; these values are not just
 * documentation.
 */

export const DEFAULT_CONVERSATION_RETENTION_DAYS = 365;
export const DEFAULT_TELEMETRY_RETENTION_DAYS = 400;
export const DEFAULT_ERROR_RETENTION_DAYS = 90;
export const RETENTION_BATCH_SIZE = 100;

function positiveDays(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function retentionDaysFromEnv(
  env: Record<string, string | undefined> = process.env
) {
  return {
    conversations: positiveDays(
      env.RETENTION_CONVERSATION_DAYS,
      DEFAULT_CONVERSATION_RETENTION_DAYS
    ),
    telemetry: positiveDays(
      env.RETENTION_TELEMETRY_DAYS,
      DEFAULT_TELEMETRY_RETENTION_DAYS
    ),
    errors: positiveDays(
      env.RETENTION_ERROR_DAYS,
      DEFAULT_ERROR_RETENTION_DAYS
    ),
  };
}

export function retentionCutoff(now: Date, days: number): Date {
  const safeDays = Number.isFinite(days) && days > 0 ? days : 1;
  return new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
}

/** Human-readable policy used on the privacy page and in the README. */
export function retentionSummary(
  env: Record<string, string | undefined> = process.env
): string {
  const days = retentionDaysFromEnv(env);
  return `Crop conversations, messages, photos, and assessments are deleted ${days.conversations} days after their last update. Operational telemetry is kept for ${days.telemetry} days, and server error records for ${days.errors} days.`;
}
