import { timingSafeEqual } from "node:crypto";

/**
 * Authentication for scheduled operations.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. A missing secret is
 * treated as "cron disabled", not "open to the public": the route returns 503
 * so a deploy without configuration cannot expose destructive jobs.
 */

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual requires equal lengths; compare the length separately
  // without leaking it through an early throw.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeCron(
  authorizationHeader: string | null,
  secret: string | undefined = process.env.CRON_SECRET
): CronAuthResult {
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message:
        "Scheduled operations are disabled because CRON_SECRET is not configured.",
    };
  }

  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match || !safeEqual(match[1], secret)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return { ok: true };
}
