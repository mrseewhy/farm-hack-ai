import type { Instrumentation } from "next";

/**
 * Next.js server error hook. Runs for Server Components, Route Handlers,
 * Server Actions, and proxy errors. The database writer is dynamically
 * imported only in the Node runtime; edge instrumentation is ignored.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest ?? "")
      : undefined;

  try {
    const { recordRequestError } = await import("@/lib/error-tracking");
    await recordRequestError({
      route: context.routePath,
      method: request.method,
      routePath: request.path,
      error: err,
      digest: digest || undefined,
    });
  } catch (trackingError) {
    console.error("onRequestError tracker failed:", trackingError);
  }
};
