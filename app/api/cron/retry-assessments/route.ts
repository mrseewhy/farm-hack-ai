import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { processAssessmentJobs } from "@/lib/assessment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Retry-later worker. Claims due assessment jobs with SKIP LOCKED and runs the
 * same pipeline as the farmer action. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  const summary = await processAssessmentJobs(10);
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "cache-control": "no-store" } }
  );
}
