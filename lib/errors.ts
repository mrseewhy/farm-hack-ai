/**
 * Error handling helpers shared by server actions and the farmer UI.
 *
 * Two separate problems are solved here:
 *
 *   1. `parseInput` runs a Zod (or any `parse`-shaped) schema and, on failure,
 *      logs the detailed issues server-side but throws a short, human-friendly
 *      message. Without this, a malformed server-action payload could surface a
 *      raw JSON issue list to the farmer.
 *
 *   2. `safeErrorMessage` is the client-side complement. Even if something on
 *      the server does throw a raw validation dump, the UI must never render
 *      JSON, a schema dump, or a stack frame. Anything that looks like an
 *      internal error is replaced with a caller-supplied fallback.
 *
 * This module deliberately has no runtime imports so it can be used from a
 * client component without pulling in Zod, and so the dependency-free test
 * runner in `scripts/errors.test.mjs` can execute it.
 */

/** Any object with a throwing `parse`, matching Zod's external shape. */
export type ParseSchema<T> = {
  parse: (input: unknown) => T;
};

/**
 * Parse `input` with `schema`, converting a validation failure into a friendly
 * error. The detailed Zod issues are logged for operators, never returned.
 */
export function parseInput<T>(
  schema: ParseSchema<T>,
  input: unknown,
  friendlyMessage: string
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    console.error(`[validation] ${friendlyMessage}`, error);
    throw new Error(friendlyMessage);
  }
}

const UNSAFE_MESSAGE_PATTERNS: RegExp[] = [
  /zod/i,
  /\binvalid_[a-z_]+/i,
  /"?(issues|invalid_union|unrecognized_keys|too_small|too_big)"?\s*:/i,
  /validation (failed|error)/i,
  // Stack frames: "at Object.<anonymous> (/path/file.ts:1:2)".
  /\bat\s+\S+\s*\(?[^)]*:\d+:\d+\)?/,
  /\n\s*at\s/,
  // Next.js generic server failure copy; never useful to a farmer.
  /server components render/i,
  /omitted in production/i,
];

/** True when a value parses as a JSON object or array, i.e. a raw dump. */
function looksLikeJson(message: string): boolean {
  const trimmed = message.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a message is unsafe to show a farmer. Exported so the policy can be
 * unit tested directly.
 */
export function isUnsafeErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  // Real product copy is short; anything long is likely an internal dump.
  if (trimmed.length > 300) return true;
  if (looksLikeJson(trimmed)) return true;
  return UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Return the message carried by `error` (an `Error` or a plain string) only
 * when it is safe to display; otherwise return `fallback`. Never throws.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw?.trim();
  if (!message) return fallback;
  if (isUnsafeErrorMessage(message)) return fallback;
  return message;
}
