import { Resend } from "resend";
import type { OperationalAlert } from "@/lib/alerts";

/**
 * Alert delivery. A webhook covers Slack/Discord/PagerDuty-style endpoints; an
 * optional Resend email covers deployments that only have email configured.
 * Delivery failure is returned, never thrown, so the health endpoint can still
 * report the snapshot and the alert row can record the failure.
 */

export type AlertDeliveryResult = {
  delivered: boolean;
  channels: string[];
  error: string | null;
};

function alertText(alerts: OperationalAlert[]): string {
  return alerts
    .map(
      (alert) =>
        `[${alert.severity.toUpperCase()}] ${alert.message} (value ${alert.value}, threshold ${alert.threshold})`
    )
    .join("\n");
}

export async function deliverAlerts(
  alerts: OperationalAlert[],
  payload: Record<string, unknown>
): Promise<AlertDeliveryResult> {
  if (alerts.length === 0) {
    return { delivered: true, channels: [], error: null };
  }

  const channels: string[] = [];
  const failures: string[] = [];

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        failures.push(`webhook returned HTTP ${response.status}`);
      } else {
        channels.push("webhook");
      }
    } catch (error) {
      failures.push(
        `webhook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  const emailTo = process.env.ALERT_EMAIL_TO;
  if (resendKey && emailFrom && emailTo) {
    try {
      const resend = new Resend(resendKey);
      const result = await resend.emails.send({
        from: emailFrom,
        to: emailTo
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
        subject: `[FarmHack AI] ${alerts.length} operational alert${alerts.length === 1 ? "" : "s"}`,
        text: alertText(alerts),
      });
      if (result.error) {
        failures.push(`email failed: ${result.error.message}`);
      } else {
        channels.push("email");
      }
    } catch (error) {
      failures.push(
        `email failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (channels.length > 0) {
    return {
      delivered: true,
      channels,
      error: failures.length > 0 ? failures.join("; ") : null,
    };
  }

  return {
    delivered: false,
    channels: [],
    error:
      failures.join("; ") ||
      "No alert channel configured (ALERT_WEBHOOK_URL or RESEND_API_KEY + ALERT_EMAIL_TO + EMAIL_FROM).",
  };
}
