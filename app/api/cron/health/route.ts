import { NextResponse } from "next/server";
import { and, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/data/dal";
import { operationalAlerts } from "@/lib/data/dal/schema";
import { authorizeCron } from "@/lib/cron";
import { getOperationalSnapshot } from "@/lib/health";
import {
  ALERT_COOLDOWN_MINUTES,
  buildAlertWebhookPayload,
  evaluateAlerts,
  shouldSuppressAlert,
  type OperationalAlert,
} from "@/lib/alerts";
import { deliverAlerts } from "@/lib/alert-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Protected operational health check.
 *
 * Vercel Cron (or any scheduler) sends `Authorization: Bearer $CRON_SECRET`.
 * The route evaluates error-rate, p95 latency, quota, server-error, and retry
 * queue thresholds, deduplicates repeats, and delivers to configured channels.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  const snapshot = await getOperationalSnapshot(60);
  const alerts = evaluateAlerts(snapshot);
  const now = new Date();

  let suppressed = 0;
  const toFire: OperationalAlert[] = [];

  if (alerts.length > 0) {
    const lastAlerts = await db
      .select({
        alertKey: operationalAlerts.alertKey,
        createdAt: operationalAlerts.createdAt,
      })
      .from(operationalAlerts)
      .where(
        and(
          inArray(
            operationalAlerts.alertKey,
            alerts.map((alert) => alert.key)
          ),
          gte(
            operationalAlerts.createdAt,
            new Date(
              now.getTime() - ALERT_COOLDOWN_MINUTES * 60_000
            )
          )
        )
      );

    const lastByKey = new Map<string, Date>();
    for (const row of lastAlerts) {
      const previous = lastByKey.get(row.alertKey);
      if (!previous || previous < row.createdAt) {
        lastByKey.set(row.alertKey, row.createdAt);
      }
    }

    for (const alert of alerts) {
      if (shouldSuppressAlert(lastByKey.get(alert.key) ?? null, now)) {
        suppressed += 1;
      } else {
        toFire.push(alert);
      }
    }
  }

  let delivered = true;
  let deliveryError: string | null = null;

  if (toFire.length > 0) {
    const inserted = await db
      .insert(operationalAlerts)
      .values(
        toFire.map((alert) => ({
          alertKey: alert.key,
          severity: alert.severity,
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
          windowMinutes: snapshot.windowMinutes,
          delivered: false,
        }))
      )
      .returning({ id: operationalAlerts.id });

    const result = await deliverAlerts(
      toFire,
      buildAlertWebhookPayload(toFire, snapshot)
    );
    delivered = result.delivered;
    deliveryError = result.error;

    if (inserted.length > 0) {
      await db
        .update(operationalAlerts)
        .set({ delivered: result.delivered, deliveryError: result.error })
        .where(
          inArray(
            operationalAlerts.id,
            inserted.map((row) => row.id)
          )
        );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot,
      alertsFired: toFire.map((alert) => alert.key),
      suppressed,
      delivered,
      deliveryError,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
