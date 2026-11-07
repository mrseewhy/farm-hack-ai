/**
 * Retry-later policy for failed assessments.
 *
 * Kept dependency-free so the queue policy can be unit-tested without a
 * database. The worker stores `attempts` as the number of claims already made,
 * so the delay after the first failure is the first entry below.
 */

export const ASSESSMENT_JOB_MAX_ATTEMPTS = 5;

/** Exponential backoff with a cap: 1 min, 5 min, 15 min, 1 h, 6 h. */
const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

export function retryDelayMs(attempts: number): number {
  const index = Math.max(0, Math.trunc(attempts) - 1);
  return RETRY_DELAYS_MS[Math.min(index, RETRY_DELAYS_MS.length - 1)];
}

export function nextRetryAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + retryDelayMs(attempts));
}

export function isJobExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= Math.max(1, Math.trunc(maxAttempts));
}

/** Bound provider error text before it is written to a job row. */
export function safeJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 500) || "Assessment failed";
}
