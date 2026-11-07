// Tests for the operational modules added to close the engineering gaps.
//
// Run with: npm run test:ops
//
// These are pure, dependency-free modules, so the retry policy, alert
// thresholds, cost maths, retention cutoffs, cron authentication, security
// headers, and consent version check can all be verified without a database,
// a scheduler, or a provider account.

import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateCostMicroUsd,
  costRatesFromEnv,
  formatMicroUsd,
  DEFAULT_INPUT_COST_PER_MILLION_USD,
  DEFAULT_OUTPUT_COST_PER_MILLION_USD,
} from "../lib/cost.ts";
import {
  ASSESSMENT_JOB_MAX_ATTEMPTS,
  isJobExhausted,
  nextRetryAt,
  retryDelayMs,
  safeJobError,
} from "../lib/jobs.ts";
import {
  ALERT_COOLDOWN_MINUTES,
  buildAlertWebhookPayload,
  errorRate,
  evaluateAlerts,
  shouldSuppressAlert,
} from "../lib/alerts.ts";
import {
  DEFAULT_CONVERSATION_RETENTION_DAYS,
  retentionCutoff,
  retentionDaysFromEnv,
  retentionSummary,
} from "../lib/retention.ts";
import { authorizeCron } from "../lib/cron.ts";
import {
  contentSecurityPolicy,
  securityHeaders,
} from "../lib/security-headers.ts";
import {
  CONSENT_POLICY_VERSION,
  CONSENT_HEADER,
  isAcceptedConsentVersion,
} from "../lib/consent.ts";
import { createConversationSchema } from "../lib/data/validation/chat.ts";

test("cost: estimates per-million input and output rates in micro-USD", () => {
  const cost = estimateCostMicroUsd(1_000_000, 1_000_000, {
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
  });
  assert.equal(cost, 2_800_000); // $0.30 + $2.50
});

test("cost: invalid token counts contribute zero instead of throwing", () => {
  assert.equal(
    estimateCostMicroUsd(Number.NaN, -50, {
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 1,
    }),
    0
  );
});

test("cost: rates are read from env and fall back on nonsense values", () => {
  const defaults = costRatesFromEnv({});
  assert.equal(defaults.inputPerMillionUsd, DEFAULT_INPUT_COST_PER_MILLION_USD);
  assert.equal(defaults.outputPerMillionUsd, DEFAULT_OUTPUT_COST_PER_MILLION_USD);

  const parsed = costRatesFromEnv({
    GEMINI_INPUT_COST_PER_M_USD: "1.25",
    GEMINI_OUTPUT_COST_PER_M_USD: "6",
  });
  assert.equal(parsed.inputPerMillionUsd, 1.25);
  assert.equal(parsed.outputPerMillionUsd, 6);

  const invalid = costRatesFromEnv({
    GEMINI_INPUT_COST_PER_M_USD: "not-a-number",
    GEMINI_OUTPUT_COST_PER_M_USD: "-2",
  });
  assert.equal(invalid.inputPerMillionUsd, DEFAULT_INPUT_COST_PER_MILLION_USD);
  assert.equal(invalid.outputPerMillionUsd, DEFAULT_OUTPUT_COST_PER_MILLION_USD);
});

test("cost: tiny costs stay visible instead of rounding to $0.00", () => {
  assert.equal(formatMicroUsd(0), "$0.00");
  assert.equal(formatMicroUsd(420), "$0.000420");
  assert.equal(formatMicroUsd(2_500_000), "$2.50");
});

test("jobs: backoff grows, caps, and tolerates garbage attempt counts", () => {
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 300_000);
  assert.equal(retryDelayMs(99), 6 * 60 * 60_000);
  assert.equal(retryDelayMs(0), 60_000);
});

test("jobs: retry timing and exhaustion follow the configured maximum", () => {
  const now = new Date("2026-11-07T10:00:00.000Z");
  assert.equal(
    nextRetryAt(now, 1).toISOString(),
    "2026-11-07T10:01:00.000Z"
  );
  assert.equal(isJobExhausted(ASSESSMENT_JOB_MAX_ATTEMPTS, ASSESSMENT_JOB_MAX_ATTEMPTS), true);
  assert.equal(isJobExhausted(1, ASSESSMENT_JOB_MAX_ATTEMPTS), false);
});

test("jobs: provider errors are bounded before storage", () => {
  assert.equal(safeJobError(new Error("  boom  ")), "boom");
  assert.equal(safeJobError(new Error("")), "Assessment failed");
  assert.ok(safeJobError(new Error("x".repeat(5000))).length <= 500);
});

test("alerts: error rate requires a minimum sample size", () => {
  const small = evaluateAlerts({
    windowMinutes: 60,
    totalAssessments: 2,
    errors: 2,
    quotaFailures: 0,
    p95LatencyMs: 100,
    degradedRate: 1,
    errorEvents: 0,
    queuedJobs: 0,
    deadJobs: 0,
  });
  assert.equal(small.length, 0);
});

test("alerts: error-rate, latency, quota, and error-spike thresholds fire", () => {
  const alerts = evaluateAlerts({
    windowMinutes: 60,
    totalAssessments: 10,
    errors: 3,
    quotaFailures: 3,
    p95LatencyMs: 60_000,
    degradedRate: 0.5,
    errorEvents: 12,
    queuedJobs: 10,
    deadJobs: 1,
  });
  const keys = alerts.map((alert) => alert.key).sort();
  assert.deepEqual(keys, [
    "assessment_error_rate",
    "assessment_p95_latency",
    "assessment_queue_backlog",
    "assessment_queue_dead",
    "provider_quota_failures",
    "server_error_spike",
  ]);
  assert.equal(errorRate({ totalAssessments: 10, errors: 3 }), 0.3);
});

test("alerts: a recent alert is suppressed during the cooldown", () => {
  const now = new Date("2026-11-07T10:00:00.000Z");
  const recent = new Date(now.getTime() - 5 * 60_000);
  const stale = new Date(
    now.getTime() - (ALERT_COOLDOWN_MINUTES + 1) * 60_000
  );
  assert.equal(shouldSuppressAlert(recent, now), true);
  assert.equal(shouldSuppressAlert(stale, now), false);
  assert.equal(shouldSuppressAlert(null, now), false);
});

test("alerts: webhook payload names the severity and metric", () => {
  const alerts = [
    {
      key: "assessment_error_rate",
      severity: "critical",
      metric: "assessment_error_rate",
      value: "30%",
      threshold: ">= 20%",
      message: "Error rate is high.",
    },
  ];
  const payload = buildAlertWebhookPayload(alerts, {
    windowMinutes: 60,
    totalAssessments: 10,
    errors: 3,
    quotaFailures: 0,
    p95LatencyMs: 1000,
    degradedRate: 0.3,
    errorEvents: 0,
    queuedJobs: 0,
    deadJobs: 0,
  });
  assert.match(String(payload.text), /CRITICAL: assessment_error_rate/);
  assert.deepEqual(payload.alerts, alerts);
});

test("retention: cutoffs are exact and invalid days fall back", () => {
  const now = new Date("2026-11-07T00:00:00.000Z");
  assert.equal(
    retentionCutoff(now, 10).toISOString(),
    "2026-10-28T00:00:00.000Z"
  );
  assert.equal(
    retentionDaysFromEnv({}).conversations,
    DEFAULT_CONVERSATION_RETENTION_DAYS
  );
  assert.equal(
    retentionDaysFromEnv({ RETENTION_CONVERSATION_DAYS: "-4" }).conversations,
    DEFAULT_CONVERSATION_RETENTION_DAYS
  );
  assert.equal(
    retentionDaysFromEnv({ RETENTION_CONVERSATION_DAYS: "30" }).conversations,
    30
  );
});

test("retention: the published summary uses the configured values", () => {
  const summary = retentionSummary({
    RETENTION_CONVERSATION_DAYS: "30",
    RETENTION_TELEMETRY_DAYS: "90",
    RETENTION_ERROR_DAYS: "7",
  });
  assert.match(summary, /deleted 30 days/);
  assert.match(summary, /90 days/);
  assert.match(summary, /7 days/);
});

test("cron: a missing secret disables rather than opens the endpoint", () => {
  assert.deepEqual(authorizeCron("Bearer anything", undefined), {
    ok: false,
    status: 503,
    message:
      "Scheduled operations are disabled because CRON_SECRET is not configured.",
  });
});

test("cron: only the exact bearer secret is accepted", () => {
  assert.deepEqual(authorizeCron("Bearer secret", "secret"), { ok: true });
  assert.equal(authorizeCron("Bearer nope", "secret").status, 401);
  assert.equal(authorizeCron(null, "secret").status, 401);
  assert.equal(authorizeCron("Basic secret", "secret").status, 401);
  assert.equal(authorizeCron("Bearer secret", "secret-longer").status, 401);
});

test("headers: production policy locks origins and adds HSTS", () => {
  const csp = contentSecurityPolicy(false);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.doesNotMatch(csp, /unsafe-eval/);

  const headers = securityHeaders(false);
  const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
  assert.match(byKey["Strict-Transport-Security"], /max-age=63072000/);
  assert.equal(byKey["X-Frame-Options"], "DENY");
  assert.equal(byKey["X-Content-Type-Options"], "nosniff");
  assert.match(byKey["Permissions-Policy"], /geolocation=\(\)/);
});

test("headers: development keeps eval and skips HSTS", () => {
  assert.match(contentSecurityPolicy(true), /unsafe-eval/);
  const keys = securityHeaders(true).map((header) => header.key);
  assert.ok(!keys.includes("Strict-Transport-Security"));
});

test("conversations: any plant name is accepted, empty is rejected", () => {
  assert.equal(createConversationSchema.parse({}).crop, "plant");
  for (const crop of ["tomato", "maize", "mango tree", "beans"]) {
    assert.equal(createConversationSchema.parse({ crop }).crop, crop);
  }
  assert.throws(() => createConversationSchema.parse({ crop: "   " }));
});

test("consent: only the current policy version is accepted", () => {
  assert.equal(CONSENT_HEADER, "x-farmhack-consent");
  assert.equal(isAcceptedConsentVersion(CONSENT_POLICY_VERSION), true);
  assert.equal(isAcceptedConsentVersion("2020-01-01"), false);
  assert.equal(isAcceptedConsentVersion(undefined), false);
  assert.equal(isAcceptedConsentVersion(null), false);
});
