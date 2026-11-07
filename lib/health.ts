import { db } from "@/lib/data/dal";
import { sql } from "drizzle-orm";
import type { AlertSnapshot } from "@/lib/alerts";

/**
 * Operational snapshot for alerting. Aggregates are computed in Postgres so
 * the health check stays cheap as telemetry grows. Only metadata-only tables
 * are read.
 */
export async function getOperationalSnapshot(
  windowMinutes = 60
): Promise<AlertSnapshot> {
  const safeWindow = Number.isFinite(windowMinutes)
    ? Math.min(24 * 60, Math.max(5, Math.trunc(windowMinutes)))
    : 60;

  const ai = await db.execute(sql`
    SELECT
      count(*)::int AS total_assessments,
      count(*) FILTER (WHERE outcome = 'error')::int AS errors,
      count(*) FILTER (
        WHERE failure_kind = 'quota'
      )::int AS quota_failures,
      coalesce(
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),
        0
      )::int AS p95_latency_ms,
      count(*) FILTER (
        WHERE outcome IN ('fallback', 'error')
      )::int AS degraded
    FROM ai_events
    WHERE created_at >= now() - make_interval(mins => ${safeWindow})
  `);

  const aiRow = (ai.rows[0] ?? {}) as Record<string, unknown>;
  const total = Number(aiRow.total_assessments ?? 0);
  const degraded = Number(aiRow.degraded ?? 0);

  const errors = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM error_events
    WHERE created_at >= now() - make_interval(mins => ${safeWindow})
  `);

  const jobs = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE status = 'dead')::int AS dead
    FROM assessment_jobs
  `);

  const jobRow = (jobs.rows[0] ?? {}) as Record<string, unknown>;

  return {
    windowMinutes: safeWindow,
    totalAssessments: total,
    errors: Number(aiRow.errors ?? 0),
    quotaFailures: Number(aiRow.quota_failures ?? 0),
    p95LatencyMs: Number(aiRow.p95_latency_ms ?? 0),
    degradedRate: total > 0 ? degraded / total : 0,
    errorEvents: Number(errors.rows[0]?.count ?? 0),
    queuedJobs: Number(jobRow.queued ?? 0),
    deadJobs: Number(jobRow.dead ?? 0),
  };
}
