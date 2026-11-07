/**
 * Follow-up reminder policy.
 *
 * After a farmer receives an assessment, we want to ask whether the advice
 * helped once enough time has passed for the crop to respond. "Enough time" is
 * a policy decision, not a UI detail, so it lives here with explicit bounds and
 * a configurable override.
 *
 * This module has no runtime imports so the dependency-free test runner in
 * `scripts/reminders.test.mjs` can execute it.
 */

/** Hours to wait after an assessment before asking the farmer for an outcome. */
export const DEFAULT_FOLLOW_UP_REMINDER_HOURS = 48;

/** Bounds on the configured value: at least an hour, at most 30 days. */
export const MIN_FOLLOW_UP_REMINDER_HOURS = 1;
export const MAX_FOLLOW_UP_REMINDER_HOURS = 24 * 30;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Coerce a configured value into a usable, bounded hour count. Unknown or
 * nonsensical values fall back to the default rather than disabling reminders
 * silently.
 */
export function parseReminderHours(value: unknown): number {
  // An empty string (e.g. `AI_FOLLOW_UP_REMINDER_HOURS=`) means "unset".
  if (typeof value === "string" && value.trim() === "") {
    return DEFAULT_FOLLOW_UP_REMINDER_HOURS;
  }
  const raw =
    typeof value === "string" ? Number(value.trim()) : (value as number);
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_FOLLOW_UP_REMINDER_HOURS;
  }
  if (raw < MIN_FOLLOW_UP_REMINDER_HOURS) return MIN_FOLLOW_UP_REMINDER_HOURS;
  if (raw > MAX_FOLLOW_UP_REMINDER_HOURS) return MAX_FOLLOW_UP_REMINDER_HOURS;
  return Math.round(raw);
}

/**
 * Resolve the reminder window from the environment.
 * Reads `AI_FOLLOW_UP_REMINDER_HOURS`.
 */
export function followUpReminderHours(
  env: Record<string, string | undefined> = process.env
): number {
  return parseReminderHours(env.AI_FOLLOW_UP_REMINDER_HOURS);
}

/** The instant before which an assessment is old enough to remind about. */
export function reminderCutoff(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}

/** Whether an assessment dated `assessedAt` is due for a reminder. */
export function isReminderDue(
  assessedAt: Date,
  now: Date,
  hours: number
): boolean {
  return assessedAt.getTime() <= reminderCutoff(now, hours).getTime();
}

/** Whole days elapsed since an assessment, floored at zero. */
export function reminderDaysElapsed(assessedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - assessedAt.getTime()) / (24 * HOUR_MS)));
}
