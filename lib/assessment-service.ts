import { db } from "@/lib/data/dal";
import {
  assessments,
  assessmentJobs,
  conversations,
  knowledgeArticles,
  messageImages,
  messages,
  aiEvents,
} from "@/lib/data/dal/schema";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import {
  assessCropHealth,
  MODEL_CANDIDATES,
  MODEL_NAME,
  MAX_HISTORY_MESSAGES,
  type AssessmentResult,
} from "@/lib/ai";
import {
  buildAiEvent,
  classifyProviderFailure,
  logAiEvent,
  type AiEvent,
} from "@/lib/monitoring";
import { buildGuidanceCitations, formatGuidanceContext } from "@/lib/guidance";
import {
  assessmentWindowStart,
  dailyAssessmentLimit,
  isDailyAssessmentLimitReached,
} from "@/lib/rate-limit";
import { aiEventToRow } from "@/lib/data/ai-event-row";
import {
  ASSESSMENT_JOB_MAX_ATTEMPTS,
  isJobExhausted,
  nextRetryAt,
  safeJobError,
} from "@/lib/jobs";

/**
 * Shared assessment pipeline.
 *
 * The farmer-facing server action and the retry worker both call this module,
 * so there is exactly one place that validates ownership, applies the daily
 * limit, persists the assistant reply, records telemetry, and enqueues a retry.
 * A `"use server"` action must not export internal helpers; keeping them here
 * also makes the worker possible without weakening access control.
 */

export type AssessmentSuccess = {
  assessment: AssessmentResult;
  assessmentId: number;
  assistantMessage: { id: number; content: string };
  queued?: false;
};

export type AssessmentQueued = {
  queued: true;
  jobId: number;
  conversationId: number;
  messageId: number;
};

export type AssessmentRunResult = AssessmentSuccess | AssessmentQueued;

export type ExecuteAssessmentInput = {
  userId: string;
  conversationId: number;
  messageId: number;
  language: string;
  /** Worker retries should not consume the farmer's daily allowance again. */
  enforceRateLimit?: boolean;
  /** A worker failure is recorded on the job, not turned into a second job. */
  enqueueOnFailure?: boolean;
};

/** Build the persisted assistant reply text from a structured assessment. */
export function buildAssistantContent(assessment: AssessmentResult): string {
  const contentParts: string[] = [];
  if (assessment.observedSigns.length > 0) {
    contentParts.push(
      "**Observed signs:**\n" +
        assessment.observedSigns.map((s) => `- ${s}`).join("\n")
    );
  }
  if (assessment.possibleCauses.length > 0) {
    contentParts.push(
      "\n**Possible causes:**\n" +
        assessment.possibleCauses.map((c) => `- ${c}`).join("\n")
    );
  }
  if (assessment.followUpQuestions.length > 0) {
    contentParts.push(
      "\n**Things to check:**\n" +
        assessment.followUpQuestions.map((q) => `- ${q}`).join("\n")
    );
  }
  if (assessment.immediateActions.length > 0) {
    contentParts.push(
      "\n**Suggested actions:**\n" +
        assessment.immediateActions.map((a) => `- ${a}`).join("\n")
    );
  }
  if (assessment.whenToSeekHelp) {
    contentParts.push("\n**When to seek help:**\n" + assessment.whenToSeekHelp);
  }
  if (assessment.uncertainty.level !== "low") {
    contentParts.push(
      `\n**Uncertainty:** ${assessment.uncertainty.level} — ${assessment.uncertainty.reason}`
    );
  }
  if (assessment.imageIssues && assessment.imageIssues.failed > 0) {
    contentParts.push(
      `\n**Photo notice:** ${assessment.imageIssues.failed} of ${assessment.imageIssues.total} attached photo(s) could not be examined. Please upload a clear photo again.`
    );
  }
  return (
    contentParts.join("\n") ||
    "I couldn't generate an assessment. Please try again or describe your symptoms in more detail."
  );
}

/** Drizzle/pg may wrap the original driver error in a `cause`. */
function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

/**
 * Persist one AI telemetry event and emit it as a structured log line.
 * Monitoring must never break an assessment.
 */
async function recordAiEvent(event: AiEvent, conversationId: number) {
  logAiEvent(event);

  try {
    await db.insert(aiEvents).values(aiEventToRow(event, conversationId));
  } catch (error) {
    console.error("Failed to persist AI telemetry event:", error);
  }
}

/**
 * Return the assessment already stored for a message, with the assistant reply
 * it produced. Repairs a missing reply link once so a retry can finish the job.
 */
async function resolveExistingAssessment(
  conversationId: number,
  messageId: number,
  language: string
) {
  const [existing] = await db
    .select({
      id: assessments.id,
      structuredResult: assessments.structuredResult,
      assistantMessageId: assessments.assistantMessageId,
    })
    .from(assessments)
    .where(eq(assessments.messageId, messageId))
    .limit(1);

  if (!existing) return null;

  const assessment = JSON.parse(existing.structuredResult) as AssessmentResult;
  let assistantMessage: { id: number; content: string } | null = null;

  if (existing.assistantMessageId != null) {
    const [linked] = await db
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .where(eq(messages.id, existing.assistantMessageId))
      .limit(1);
    if (linked) assistantMessage = linked;
  }

  if (!assistantMessage) {
    const [created] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        content: buildAssistantContent(assessment),
        language,
        status: "sent",
      })
      .returning({ id: messages.id, content: messages.content });
    assistantMessage = created;
    await db
      .update(assessments)
      .set({ assistantMessageId: created.id })
      .where(eq(assessments.id, existing.id));
  }

  return {
    assessment,
    assessmentId: existing.id,
    assistantMessage,
  };
}

/**
 * Enqueue (or re-activate) one retry-later job. The unique message_id index
 * means a duplicate request cannot create a second job.
 */
export async function enqueueAssessmentRetry(input: {
  conversationId: number;
  messageId: number;
  userId: string;
  language: string;
  error: unknown;
}): Promise<number> {
  const now = new Date();
  const [job] = await db
    .insert(assessmentJobs)
    .values({
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: input.userId,
      language: input.language,
      status: "queued",
      attempts: 0,
      maxAttempts: ASSESSMENT_JOB_MAX_ATTEMPTS,
      availableAt: now,
      lastError: safeJobError(input.error),
    })
    .onConflictDoUpdate({
      target: assessmentJobs.messageId,
      set: {
        status: "queued",
        availableAt: now,
        lastError: safeJobError(input.error),
        updatedAt: now,
        completedAt: null,
      },
    })
    .returning({ id: assessmentJobs.id });

  return job.id;
}

/**
 * Run one assessment for a specific user.
 *
 * The caller must already have authenticated the user; every query is still
 * scoped by userId so a worker cannot read another farmer's conversation.
 */
export async function executeAssessment(
  input: ExecuteAssessmentInput
): Promise<AssessmentRunResult> {
  const message = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);

  if (message.length === 0) {
    throw new Error("Message not found");
  }

  if (message[0].conversationId !== input.conversationId) {
    throw new Error("Message does not belong to the given conversation");
  }

  const conversation = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (conversation.length === 0 || conversation[0].userId !== input.userId) {
    throw new Error("Access denied to conversation");
  }

  // Do not reassess a message that already has an assessment.
  const existing = await resolveExistingAssessment(
    input.conversationId,
    input.messageId,
    input.language
  );
  if (existing) return existing;

  // Per-user abuse and cost control, after idempotency so a retry of an
  // already-assessed message never consumes the allowance.
  if (input.enforceRateLimit !== false) {
    const limit = dailyAssessmentLimit();
    const [{ count: recentAssessments }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assessments)
      .innerJoin(
        conversations,
        eq(assessments.conversationId, conversations.id)
      )
      .where(
        and(
          eq(conversations.userId, input.userId),
          gte(assessments.createdAt, assessmentWindowStart())
        )
      );

    if (isDailyAssessmentLimitReached(Number(recentAssessments), limit)) {
      console.warn(
        `AI assessment limit reached for user ${input.userId}: ${recentAssessments}/${limit} in the last 24 hours.`
      );
      throw new Error(
        "Daily AI assessment limit reached. Please try again later."
      );
    }
  }

  const symptoms = message[0].content;

  const attachedImages = await db
    .select({ secureUrl: messageImages.secureUrl })
    .from(messageImages)
    .where(eq(messageImages.messageId, input.messageId));
  const images = attachedImages.map((img) => ({ secureUrl: img.secureUrl }));

  const priorTurns = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        ne(messages.id, input.messageId)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);

  const history = priorTurns.reverse().map((turn) => ({
    role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: turn.content,
  }));

  const guidanceArticles = await db
    .select({
      problem: knowledgeArticles.problem,
      signs: knowledgeArticles.signs,
      distinguishingQuestions: knowledgeArticles.distinguishingQuestions,
      approvedActions: knowledgeArticles.approvedActions,
      provenance: knowledgeArticles.provenance,
      reviewer: knowledgeArticles.reviewer,
      reviewedAt: knowledgeArticles.reviewedAt,
      sourcePublisher: knowledgeArticles.sourcePublisher,
      sourceTitle: knowledgeArticles.sourceTitle,
      sourceUrl: knowledgeArticles.sourceUrl,
      sourceAccessedAt: knowledgeArticles.sourceAccessedAt,
      sourceLicense: knowledgeArticles.sourceLicense,
    })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.status, "published"),
        eq(knowledgeArticles.crop, "tomato")
      )
    );

  const guidanceContext = formatGuidanceContext(guidanceArticles);
  const guidanceCitations = buildGuidanceCitations(guidanceArticles);

  let aiResult: Awaited<ReturnType<typeof assessCropHealth>>;
  try {
    aiResult = await assessCropHealth({
      symptoms,
      images,
      language: input.language,
      guidanceContext,
      guidanceCitations,
      history,
    });
  } catch (error) {
    const failureKind = classifyProviderFailure(
      error instanceof Error ? error.message : String(error)
    );

    // Record the failure before doing anything else so provider outages show
    // up in monitoring even if queueing also fails.
    await recordAiEvent(
      buildAiEvent({
        eventType: "assessment",
        modelRequested: MODEL_NAME,
        modelUsed: null,
        fallbackAttempts: MODEL_CANDIDATES.length,
        fallbackUsed: MODEL_CANDIDATES.length > 1,
        validationOutcome: "invalid",
        outcome: "error",
        failureKind,
      }),
      input.conversationId
    );

    if (input.enqueueOnFailure !== false) {
      try {
        const jobId = await enqueueAssessmentRetry({
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: input.userId,
          language: input.language,
          error,
        });

        return {
          queued: true,
          jobId,
          conversationId: input.conversationId,
          messageId: input.messageId,
        };
      } catch (queueError) {
        console.error("Failed to enqueue assessment retry:", queueError);
      }
    }

    throw error;
  }

  const { assessment, model: assessmentModel, telemetry } = aiResult;
  const assistantContent = buildAssistantContent(assessment);

  let saved: {
    assessmentId: number;
    assistantMessage: { id: number; content: string };
  };
  try {
    saved = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(assessments)
        .values({
          conversationId: input.conversationId,
          messageId: input.messageId,
          structuredResult: JSON.stringify(assessment),
          model: assessmentModel,
        })
        .returning({ id: assessments.id });

      const [assistantMessage] = await tx
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          role: "assistant",
          content: assistantContent,
          language: input.language,
          status: "sent",
        })
        .returning({ id: messages.id, content: messages.content });

      await tx
        .update(assessments)
        .set({ assistantMessageId: assistantMessage.id })
        .where(eq(assessments.id, record.id));

      return {
        assessmentId: record.id,
        assistantMessage,
      };
    });
  } catch (insertError) {
    if (isUniqueViolation(insertError)) {
      const concurrent = await resolveExistingAssessment(
        input.conversationId,
        input.messageId,
        input.language
      );
      if (concurrent) return concurrent;
    }
    throw insertError;
  }

  // A successful manual or worker run clears any stale queued job.
  await db
    .update(assessmentJobs)
    .set({
      status: "succeeded",
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(
      and(
        eq(assessmentJobs.messageId, input.messageId),
        ne(assessmentJobs.status, "succeeded")
      )
    );

  await recordAiEvent(
    buildAiEvent({ ...telemetry, occurredAt: new Date().toISOString() }),
    input.conversationId
  );

  return { assessment, ...saved };
}

type ClaimedJob = {
  id: number;
  conversation_id: number;
  message_id: number;
  user_id: string;
  language: string;
  attempts: number;
  max_attempts: number;
};

/**
 * Claim due jobs atomically. `FOR UPDATE SKIP LOCKED` lets several cron
 * invocations run at once without doing the same assessment twice.
 */
export async function claimAssessmentJobs(limit = 5): Promise<ClaimedJob[]> {
  const safeLimit = Math.min(25, Math.max(1, Math.trunc(limit)));
  const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id
      FROM assessment_jobs
      WHERE status = 'queued' AND available_at <= now()
      ORDER BY available_at ASC
      LIMIT ${safeLimit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE assessment_jobs job
    SET status = 'running', attempts = job.attempts + 1, updated_at = now()
    FROM claimed
    WHERE job.id = claimed.id
    RETURNING
      job.id,
      job.conversation_id,
      job.message_id,
      job.user_id,
      job.language,
      job.attempts,
      job.max_attempts
  `);

  return result.rows as unknown as ClaimedJob[];
}

export type JobProcessSummary = {
  processed: number;
  succeeded: number;
  retried: number;
  dead: number;
};

/** Process due retry jobs. Called only by the protected cron route. */
export async function processAssessmentJobs(
  limit = 5
): Promise<JobProcessSummary> {
  const jobs = await claimAssessmentJobs(limit);
  const summary: JobProcessSummary = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    dead: 0,
  };

  for (const job of jobs) {
    summary.processed += 1;
    try {
      await executeAssessment({
        userId: job.user_id,
        conversationId: job.conversation_id,
        messageId: job.message_id,
        language: job.language,
        enforceRateLimit: false,
        enqueueOnFailure: false,
      });

      await db
        .update(assessmentJobs)
        .set({
          status: "succeeded",
          completedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(assessmentJobs.id, job.id));
      summary.succeeded += 1;
    } catch (error) {
      const message = safeJobError(error);
      if (isJobExhausted(job.attempts, job.max_attempts)) {
        await db
          .update(assessmentJobs)
          .set({
            status: "dead",
            lastError: message,
            updatedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(assessmentJobs.id, job.id));
        summary.dead += 1;
      } else {
        await db
          .update(assessmentJobs)
          .set({
            status: "queued",
            availableAt: nextRetryAt(new Date(), job.attempts),
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(assessmentJobs.id, job.id));
        summary.retried += 1;
      }
      console.error(
        `Assessment retry job ${job.id} failed (attempt ${job.attempts}/${job.max_attempts}): ${message}`
      );
    }
  }

  return summary;
}
