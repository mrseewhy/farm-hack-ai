import { createHash } from "node:crypto";
import { db } from "@/lib/data/dal";
import { errorEvents } from "@/lib/data/dal/schema";

/**
 * Privacy-bounded server error tracking.
 *
 * Called from Next's onRequestError instrumentation. Stores a bounded error
 * message, route shape, digest, and a hash of the stack. It never stores the
 * request body, headers, cookies, query string, or a raw stack. This is enough
 * to detect a spike and group duplicates without duplicating user content.
 */

export type RequestErrorInput = {
  route: string;
  method: string;
  routePath?: string;
  error: unknown;
  digest?: string;
  source?: string;
};

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Strip query strings and collapse dynamic segments for safe grouping. */
export function safeRoutePath(value: string | undefined): string | null {
  if (!value) return null;
  const pathOnly = value.split("?")[0].split("#")[0];
  if (!pathOnly) return null;
  return pathOnly
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi,
      "/:uuid"
    )
    .slice(0, 300);
}

export async function recordRequestError(input: RequestErrorInput): Promise<void> {
  const error =
    input.error instanceof Error
      ? input.error
      : new Error(String(input.error ?? "Unknown error"));

  const stackHash = error.stack
    ? createHash("sha256").update(error.stack).digest("hex").slice(0, 32)
    : null;

  try {
    await db.insert(errorEvents).values({
      source: input.source ?? "server",
      route: bounded(input.route, 200) ?? "unknown",
      method: bounded(input.method, 20) ?? "unknown",
      routePath: safeRoutePath(input.routePath),
      errorName: bounded(error.name, 120),
      message: bounded(error.message, 500) ?? "Unknown error",
      digest: bounded(input.digest, 200),
      stackHash,
    });
  } catch (trackingError) {
    // Observability must never take down the request that was already failing.
    console.error("Failed to persist request error:", trackingError);
  }
}
