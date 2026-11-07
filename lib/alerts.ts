/**
 * Operational alert rules.
 *
 * Pure functions only: the cron route gathers the snapshot, this module decides
 * whether a human should be paged, and delivery lives in the route. Keeping the
 * thresholds here makes them reviewable and unit-testable instead of buried in
 * a dashboard query.
 */

export type AlertSnapshot = {
  windowMinutes: number;
  totalAssessments: number;
  errors: number;
  quotaFailures: number;
  p95LatencyMs: number;
  degradedRate: number;
  errorEvents: number;
  queuedJobs: number;
  deadJobs: number;
};

export type OperationalAlert = {
  key: string;
  severity: "warning" | "critical";
  metric: string;
  value: string;
  threshold: string;
  message: string;
};

export const ALERT_THRESHOLDS = {
  /** Minimum sample size before rate alerts fire. */
  minimumAssessments: 5,
  errorRate: 0.2,
  p95LatencyMs: 45_000,
  quotaFailures: 3,
  degradedRate: 0.5,
  errorEvents: 10,
  queuedJobs: 10,
  deadJobs: 1,
} as const;

/** Do not repeat the same alert more often than this. */
export const ALERT_COOLDOWN_MINUTES = 30;

export function errorRate(snapshot: Pick<AlertSnapshot, "totalAssessments" | "errors">): number {
  return snapshot.totalAssessments > 0
    ? snapshot.errors / snapshot.totalAssessments
    : 0;
}

export function evaluateAlerts(snapshot: AlertSnapshot): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const window = `${snapshot.windowMinutes}m`;
  const enoughSamples =
    snapshot.totalAssessments >= ALERT_THRESHOLDS.minimumAssessments;
  const rate = errorRate(snapshot);

  if (enoughSamples && rate >= ALERT_THRESHOLDS.errorRate) {
    alerts.push({
      key: "assessment_error_rate",
      severity: "critical",
      metric: "assessment_error_rate",
      value: `${Math.round(rate * 100)}%`,
      threshold: `>= ${Math.round(ALERT_THRESHOLDS.errorRate * 100)}%`,
      message: `Assessment error rate is ${Math.round(rate * 100)}% over the last ${window} (${snapshot.errors}/${snapshot.totalAssessments}).`,
    });
  }

  if (enoughSamples && snapshot.p95LatencyMs >= ALERT_THRESHOLDS.p95LatencyMs) {
    alerts.push({
      key: "assessment_p95_latency",
      severity: "warning",
      metric: "assessment_p95_latency_ms",
      value: `${snapshot.p95LatencyMs} ms`,
      threshold: `>= ${ALERT_THRESHOLDS.p95LatencyMs} ms`,
      message: `p95 assessment latency is ${snapshot.p95LatencyMs} ms over the last ${window}.`,
    });
  }

  if (snapshot.quotaFailures >= ALERT_THRESHOLDS.quotaFailures) {
    alerts.push({
      key: "provider_quota_failures",
      severity: "critical",
      metric: "provider_quota_failures",
      value: String(snapshot.quotaFailures),
      threshold: `>= ${ALERT_THRESHOLDS.quotaFailures}`,
      message: `${snapshot.quotaFailures} provider quota/rate-limit failures were recorded in the last ${window}.`,
    });
  } else if (
    enoughSamples &&
    snapshot.degradedRate >= ALERT_THRESHOLDS.degradedRate
  ) {
    alerts.push({
      key: "assessment_degraded_rate",
      severity: "warning",
      metric: "assessment_degraded_rate",
      value: `${Math.round(snapshot.degradedRate * 100)}%`,
      threshold: `>= ${Math.round(ALERT_THRESHOLDS.degradedRate * 100)}%`,
      message: `${Math.round(snapshot.degradedRate * 100)}% of assessments needed a fallback or failed in the last ${window}.`,
    });
  }

  if (snapshot.errorEvents >= ALERT_THRESHOLDS.errorEvents) {
    alerts.push({
      key: "server_error_spike",
      severity: "critical",
      metric: "server_error_events",
      value: String(snapshot.errorEvents),
      threshold: `>= ${ALERT_THRESHOLDS.errorEvents}`,
      message: `${snapshot.errorEvents} server errors were captured in the last ${window}.`,
    });
  }

  if (snapshot.queuedJobs >= ALERT_THRESHOLDS.queuedJobs) {
    alerts.push({
      key: "assessment_queue_backlog",
      severity: "warning",
      metric: "assessment_queue_depth",
      value: String(snapshot.queuedJobs),
      threshold: `>= ${ALERT_THRESHOLDS.queuedJobs}`,
      message: `${snapshot.queuedJobs} assessments are waiting for a retry.`,
    });
  }

  if (snapshot.deadJobs >= ALERT_THRESHOLDS.deadJobs) {
    alerts.push({
      key: "assessment_queue_dead",
      severity: "critical",
      metric: "assessment_queue_dead",
      value: String(snapshot.deadJobs),
      threshold: `>= ${ALERT_THRESHOLDS.deadJobs}`,
      message: `${snapshot.deadJobs} assessment retry job(s) exhausted their attempts.`,
    });
  }

  return alerts;
}

export function shouldSuppressAlert(
  lastAlertAt: Date | null,
  now: Date,
  cooldownMinutes: number = ALERT_COOLDOWN_MINUTES
): boolean {
  if (!lastAlertAt) return false;
  return (
    now.getTime() - lastAlertAt.getTime() <
    Math.max(0, cooldownMinutes) * 60_000
  );
}

/** Slack-compatible payload with structured fields for any webhook consumer. */
export function buildAlertWebhookPayload(
  alerts: OperationalAlert[],
  snapshot: AlertSnapshot
): Record<string, unknown> {
  const header =
    alerts.length === 1
      ? `[FarmHack AI] ${alerts[0].severity.toUpperCase()}: ${alerts[0].metric}`
      : `[FarmHack AI] ${alerts.length} operational alerts`;
  const lines = alerts.map(
    (alert) => `• *${alert.severity}* ${alert.message}`
  );

  return {
    text: [header, ...lines].join("\n"),
    alerts,
    snapshot,
  };
}
