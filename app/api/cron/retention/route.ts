import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { runRetentionCleanup } from "@/lib/retention-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Enforced retention worker. Deletes expired conversations, stored photos,
 * telemetry, and error records in bounded batches. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  const summary = await runRetentionCleanup();
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "cache-control": "no-store" } }
  );
}
