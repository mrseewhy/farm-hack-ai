/**
 * Structured monitoring for the AI assessment pipeline.
 *
 * Console logs disappear on serverless platforms and cannot be queried. This
 * module defines one normalised, machine-readable event for every assessment
 * attempt so the three failure modes seen in evaluation (provider 429s,
 * truncated/malformed responses, and safety filtering) become visible in
 * production instead of only in a terminal.
 *
 * Privacy: an event is metadata only. It never contains farmer text, model
 * output, prompts, or image URLs. That keeps monitoring useful for operations
 * without turning it into a second copy of user content.
 *
 * This module is intentionally free of runtime imports so the dependency-free
 * test runner in `scripts/monitoring.test.mjs` can execute it. Persistence and
 * transport live in the server action layer.
 */

/** Bump when the system prompt or output contract changes. */
export const PROMPT_VERSION = "assessment-v3";

export type AiValidationOutcome = "valid" | "recovered" | "invalid";

/**
 * ok       the model response passed every check untouched
 * filtered deterministic safeguards removed or replaced some content
 * fallback the response was unusable, or the final audit failed, so the safe
 *          fallback was returned instead
 * error    no model responded at all (every candidate failed)
 */
export type AiEventOutcome = "ok" | "filtered" | "fallback" | "error";

/**
 * Coarse failure classification used for quota and latency alerting. Provider
 * error strings are kept in server logs; only this bounded category is stored.
 */
export type AiFailureKind =
  | "none"
  | "quota"
  | "timeout"
  | "provider"
  | "safety"
  | "invalid"
  | "unknown";

export type AiEvent = {
  eventType: string;
  promptVersion: string;
  modelRequested: string;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackAttempts: number;
  latencyMs: number;
  safetyFlagCount: number;
  imageTotal: number;
  imageFailed: number;
  validationOutcome: AiValidationOutcome;
  outcome: AiEventOutcome;
  failureKind: AiFailureKind;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost at configured rates, stored as integer micro-USD. */
  estimatedCostMicroUsd: number;
  imageBytesOriginal: number;
  imageBytesSent: number;
  imageOptimized: number;
  occurredAt: string;
};

export type AiEventInput = Partial<
  Omit<AiEvent, "modelUsed" | "occurredAt" | "promptVersion">
> & {
  modelUsed?: string | null;
  occurredAt?: string;
  promptVersion?: string;
};

const MAX_LABEL_LENGTH = 120;
const MAX_LATENCY_MS = 600_000; // 10 minutes: anything longer is an outlier, not a signal
const MAX_FLAGS = 10_000;
const MAX_IMAGES = 50;
const MAX_ATTEMPTS = 50;
const MAX_TOKENS = 10_000_000;
const MAX_COST_MICRO_USD = 100_000_000; // $100 per event: a bug, not a real call
const MAX_IMAGE_BYTES_TOTAL = 1_000_000_000; // 1GB across one request

const VALIDATION_OUTCOMES: AiValidationOutcome[] = [
  "valid",
  "recovered",
  "invalid",
];
const OUTCOMES: AiEventOutcome[] = ["ok", "filtered", "fallback", "error"];
const FAILURE_KINDS: AiFailureKind[] = [
  "none",
  "quota",
  "timeout",
  "provider",
  "safety",
  "invalid",
  "unknown",
];

/**
 * Classify a provider failure from its message. Deliberately coarse: the full
 * provider error stays in server logs, while the database keeps enough signal
 * to distinguish quota exhaustion from timeouts and outages.
 */
export function classifyProviderFailure(message: string): AiFailureKind {
  const value = message.toLowerCase();
  if (
    /quota|rate.?limit|429|resource_exhausted|billing|exceeded.*(limit|quota)/.test(
      value
    )
  ) {
    return "quota";
  }
  if (/timed out|timeout|deadline exceeded|etimedout/.test(value)) {
    return "timeout";
  }
  if (/safety|blocked|responsible ai|content filter|prohibited/.test(value)) {
    return "safety";
  }
  if (
    /503|502|500|overloaded|high demand|unavailable|internal server|network|fetch failed/.test(
      value
    )
  ) {
    return "provider";
  }
  if (/invalid|parse|schema|malformed|empty response/.test(value)) {
    return "invalid";
  }
  return "unknown";
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function cleanLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}

function cleanOptionalLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_LABEL_LENGTH) : null;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Normalise any partial telemetry into a complete, bounded event.
 *
 * Every numeric field is clamped and every string is length-limited so a bug in
 * a caller cannot write an enormous or negative value into the metrics table.
 */
export function buildAiEvent(input: AiEventInput = {}): AiEvent {
  const modelRequested = cleanLabel(input.modelRequested, "unknown");
  const modelUsed = cleanOptionalLabel(input.modelUsed);

  const fallbackAttempts = clampInt(input.fallbackAttempts, 1, MAX_ATTEMPTS, 1);
  const fallbackUsed =
    typeof input.fallbackUsed === "boolean"
      ? input.fallbackUsed
      : fallbackAttempts > 1 ||
        (modelUsed !== null && modelUsed !== modelRequested);

  const imageTotal = clampInt(input.imageTotal, 0, MAX_IMAGES, 0);
  // A failed count can never exceed the total; enforce it here so dashboards
  // cannot show nonsensical ratios.
  const imageFailed = Math.min(
    imageTotal,
    clampInt(input.imageFailed, 0, MAX_IMAGES, 0)
  );

  const validationOutcome = VALIDATION_OUTCOMES.includes(
    input.validationOutcome as AiValidationOutcome
  )
    ? (input.validationOutcome as AiValidationOutcome)
    : "valid";

  const outcome = OUTCOMES.includes(input.outcome as AiEventOutcome)
    ? (input.outcome as AiEventOutcome)
    : "ok";

  const failureKind = FAILURE_KINDS.includes(input.failureKind as AiFailureKind)
    ? (input.failureKind as AiFailureKind)
    : "none";

  return {
    eventType: cleanLabel(input.eventType, "assessment"),
    promptVersion: cleanLabel(input.promptVersion, PROMPT_VERSION),
    modelRequested,
    modelUsed,
    fallbackUsed,
    fallbackAttempts,
    latencyMs: clampInt(input.latencyMs, 0, MAX_LATENCY_MS, 0),
    safetyFlagCount: clampInt(input.safetyFlagCount, 0, MAX_FLAGS, 0),
    imageTotal,
    imageFailed,
    validationOutcome,
    outcome,
    // Only failure outcomes can carry a failure classification. A successful
    // caller that accidentally passes one must not create a false alert.
    failureKind: outcome === "error" ? failureKind : "none",
    inputTokens: clampInt(input.inputTokens, 0, MAX_TOKENS, 0),
    outputTokens: clampInt(input.outputTokens, 0, MAX_TOKENS, 0),
    estimatedCostMicroUsd: clampInt(
      input.estimatedCostMicroUsd,
      0,
      MAX_COST_MICRO_USD,
      0
    ),
    imageBytesOriginal: clampInt(
      input.imageBytesOriginal,
      0,
      MAX_IMAGE_BYTES_TOTAL,
      0
    ),
    imageBytesSent: clampInt(
      input.imageBytesSent,
      0,
      MAX_IMAGE_BYTES_TOTAL,
      0
    ),
    imageOptimized: clampInt(
      input.imageOptimized,
      0,
      MAX_IMAGES,
      0
    ),
    occurredAt: normalizeTimestamp(input.occurredAt),
  };
}

/** Data-safe log record. Kept separate so tests can assert on it directly. */
export function toLogRecord(event: AiEvent): Record<string, unknown> {
  return { type: "ai_event", ...event };
}

/**
 * Emit one structured JSON line. Error events go to stderr; everything else to
 * stdout, so a log pipeline can route them differently.
 */
export function logAiEvent(event: AiEvent): void {
  const line = JSON.stringify(toLogRecord(event));
  if (event.outcome === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** Stable JSON for persistence. */
export function serializeAiEvent(event: AiEvent): string {
  return JSON.stringify(event);
}
