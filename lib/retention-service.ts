import { db } from "@/lib/data/dal";
import {
  aiEvents,
  conversations,
  errorEvents,
  messageImages,
  messages,
  operationalAlerts,
  retentionRuns,
} from "@/lib/data/dal/schema";
import { eq, lt, sql } from "drizzle-orm";
import { deleteStoredImage } from "@/lib/media";
import {
  RETENTION_BATCH_SIZE,
  retentionCutoff,
  retentionDaysFromEnv,
} from "@/lib/retention";

/**
 * Enforced retention. This is invoked by a protected cron route, not by a
 * farmer request. It deletes stored media first, then the database rows, so a
 * delete is not "successful" while the photo still exists in Cloudinary.
 *
 * Batches are bounded so a single invocation cannot exceed the serverless
 * function limit. `hasMore` tells the caller whether another run is needed.
 */

export type RetentionSummary = {
  cutoff: string;
  conversationsDeleted: number;
  imagesDeleted: number;
  telemetryDeleted: number;
  errorsDeleted: number;
  hasMore: boolean;
};

export async function runRetentionCleanup(
  now: Date = new Date()
): Promise<RetentionSummary> {
  const days = retentionDaysFromEnv();
  const conversationCutoff = retentionCutoff(now, days.conversations);
  const telemetryCutoff = retentionCutoff(now, days.telemetry);
  const errorCutoff = retentionCutoff(now, days.errors);

  const [run] = await db
    .insert(retentionRuns)
    .values({ status: "running" })
    .returning({ id: retentionRuns.id });

  let imagesDeleted = 0;
  let conversationsDeleted = 0;

  try {
    const expired = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(lt(conversations.updatedAt, conversationCutoff))
      .limit(RETENTION_BATCH_SIZE);

    for (const conversation of expired) {
      const images = await db
        .select({ publicId: messageImages.cloudinaryPublicId })
        .from(messageImages)
        .innerJoin(messages, eq(messageImages.messageId, messages.id))
        .where(eq(messages.conversationId, conversation.id));

      let mediaFailed = false;
      for (const image of images) {
        try {
          await deleteStoredImage(image.publicId);
          imagesDeleted += 1;
        } catch (error) {
          mediaFailed = true;
          console.error(
            `Retention could not delete stored image ${image.publicId}; keeping conversation ${conversation.id} for a later run:`,
            error
          );
        }
      }

      // Never delete the database record while its media may still exist.
      if (mediaFailed) continue;

      await db
        .delete(conversations)
        .where(eq(conversations.id, conversation.id));
      conversationsDeleted += 1;
    }

    const telemetry = await db.execute(sql`
      DELETE FROM ai_events WHERE created_at < ${telemetryCutoff.toISOString()}
    `);
    const errors = await db.execute(sql`
      DELETE FROM error_events WHERE created_at < ${errorCutoff.toISOString()}
    `);
    await db.execute(sql`
      DELETE FROM operational_alerts WHERE created_at < ${telemetryCutoff.toISOString()}
    `);

    const telemetryDeleted = telemetry.rowCount ?? 0;
    const errorsDeleted = errors.rowCount ?? 0;

    await db
      .update(retentionRuns)
      .set({
        status: "succeeded",
        conversationsDeleted,
        imagesDeleted,
        telemetryDeleted,
        errorsDeleted,
        finishedAt: new Date(),
      })
      .where(eq(retentionRuns.id, run.id));

    return {
      cutoff: conversationCutoff.toISOString(),
      conversationsDeleted,
      imagesDeleted,
      telemetryDeleted,
      errorsDeleted,
      hasMore: expired.length === RETENTION_BATCH_SIZE,
    };
  } catch (error) {
    await db
      .update(retentionRuns)
      .set({
        status: "failed",
        conversationsDeleted,
        imagesDeleted,
        finishedAt: new Date(),
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : String(error).slice(0, 500),
      })
      .where(eq(retentionRuns.id, run.id));
    throw error;
  }
}
