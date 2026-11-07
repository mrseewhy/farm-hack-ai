import type { AiEvent } from "@/lib/monitoring";

/**
 * Map a monitoring event to an `ai_events` row.
 *
 * Kept in a plain module (not the `"use server"` action file) so the exact
 * production mapping can be unit-tested and reused by the DB integration test.
 * Exporting it from a `"use server"` file would turn it into a callable server
 * action, which would be a security hole.
 *
 * The shape is structural until it reaches Drizzle; there is no runtime import
 * of the database here, so this module stays dependency-free.
 */
export type AiEventRow = {
  conversationId: number | null;
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
  validationOutcome: string;
  outcome: string;
  createdAt: Date;
};

export function aiEventToRow(
  event: AiEvent,
  conversationId: number | null
): AiEventRow {
  return {
    conversationId,
    eventType: event.eventType,
    promptVersion: event.promptVersion,
    modelRequested: event.modelRequested,
    modelUsed: event.modelUsed,
    fallbackUsed: event.fallbackUsed,
    fallbackAttempts: event.fallbackAttempts,
    latencyMs: event.latencyMs,
    safetyFlagCount: event.safetyFlagCount,
    imageTotal: event.imageTotal,
    imageFailed: event.imageFailed,
    validationOutcome: event.validationOutcome,
    outcome: event.outcome,
    createdAt: new Date(event.occurredAt),
  };
}
