"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import {
  assessments,
  adminAuditEvents,
  aiEvents,
  knowledgeArticles,
  conversations,
  messages,
  messageImages,
  followUps,
  safetyReviews,
} from "@/lib/data/dal";
import {
  desc,
  sql,
  eq,
  asc,
  and,
  inArray,
  ne,
  isNull,
  isNotNull,
  lt,
} from "drizzle-orm";
import { z } from "zod";
import {
  validatePublication,
  publicationWarnings,
  normalizeProvenance,
  EXPERT_REVIEWED,
} from "@/lib/guidance";
import { parseInput } from "@/lib/errors";
import { followUpReminderHours, reminderCutoff } from "@/lib/reminders";

/**
 * Get the authenticated admin user from the session.
 * Redirects to /login if no session or not an admin.
 */
async function getCurrentAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  if (session.user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return session.user;
}

/**
 * Get the authenticated user from the session (farmer or admin).
 */
async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  return session.user;
}

/**
 * Log an admin audit event.
 */
export async function logAdminAuditEvent(input: {
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = await getCurrentAdmin();

  const [event] = await db
    .insert(adminAuditEvents)
    .values({
      adminId: admin.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    })
    .returning();

  return event;
}

/**
 * Validation schema for knowledge articles.
 *
 * Provenance is required and defaults to the weaker "source_backed". The
 * source_* fields are optional at the schema level (a draft may still be being
 * filled in) but `validatePublication` refuses to publish source-backed
 * guidance without a publisher, title, and http(s) URL.
 */
const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(max).optional()
  );

const knowledgeArticleSchema = z.object({
  id: z.number().int().positive().optional(),
  crop: z.string().min(1).max(100).default("tomato"),
  problem: z.string().min(1).max(200),
  signs: z.string().min(1).max(2000),
  distinguishingQuestions: z.string().min(1).max(2000),
  approvedActions: z.string().min(1).max(2000),
  status: z.enum(["draft", "in_review", "published"]).default("draft"),
  version: z.string().min(1).max(20).default("1.0"),
  provenance: z.enum(["source_backed", "expert_reviewed"]).default("source_backed"),
  reviewer: optionalText(200),
  reviewedAt: optionalText(40),
  sourcePublisher: optionalText(300),
  sourceTitle: optionalText(300),
  sourceUrl: optionalText(2000),
  sourceAccessedAt: optionalText(40),
  sourceLicense: optionalText(1000),
});

export type KnowledgeArticleInput = z.infer<typeof knowledgeArticleSchema>;

/** Parse an optional ISO-ish date string into a Date, or null. */
function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Map validated article input onto the columns shared by create and update. */
function articleValues(validated: KnowledgeArticleInput) {
  return {
    crop: validated.crop,
    problem: validated.problem,
    signs: validated.signs,
    distinguishingQuestions: validated.distinguishingQuestions,
    approvedActions: validated.approvedActions,
    version: validated.version,
    provenance: normalizeProvenance(validated.provenance),
    // Reviewer details are only meaningful for expert-reviewed content. They
    // are cleared for source-backed articles so a reviewer name can never
    // silently imply expert review of source-backed text.
    reviewer:
      normalizeProvenance(validated.provenance) === EXPERT_REVIEWED
        ? validated.reviewer ?? null
        : null,
    reviewedAt:
      normalizeProvenance(validated.provenance) === EXPERT_REVIEWED
        ? parseOptionalDate(validated.reviewedAt)
        : null,
    sourcePublisher: validated.sourcePublisher ?? null,
    sourceTitle: validated.sourceTitle ?? null,
    sourceUrl: validated.sourceUrl ?? null,
    sourceAccessedAt: parseOptionalDate(validated.sourceAccessedAt),
    sourceLicense: validated.sourceLicense ?? null,
  };
}

/**
 * List all knowledge articles, ordered by crop, problem, version.
 */
export async function getKnowledgeArticles() {
  await getCurrentAdmin();

  const articles = await db
    .select()
    .from(knowledgeArticles)
    .orderBy(asc(knowledgeArticles.crop), asc(knowledgeArticles.problem), desc(knowledgeArticles.version));

  // Reading the article list is not sensitive enough to audit on every load;
  // auditing every page view drowns out real access events.
  return articles;
}

/**
 * Get a single knowledge article by ID.
 */
export async function getKnowledgeArticle(id: number) {
  await getCurrentAdmin();

  const [article] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);

  if (!article) {
    return null;
  }

  return article;
}

/**
 * Create a new knowledge article (draft).
 */
export async function createKnowledgeArticle(input: KnowledgeArticleInput) {
  const validated = parseInput(
    knowledgeArticleSchema,
    input,
    "Could not save the guidance article. Please check the fields and try again."
  );
  await getCurrentAdmin();

  const [article] = await db
    .insert(knowledgeArticles)
    .values({
      ...articleValues(validated),
      status: "draft",
    })
    .returning();

  // Log audit event
  await logAdminAuditEvent({
    action: "create_guidance",
    targetType: "knowledge_article",
    targetId: String(article.id),
  });

  return article;
}

/**
 * Update a knowledge article. Only draft or in_review articles can be updated.
 */
export async function updateKnowledgeArticle(id: number, input: KnowledgeArticleInput) {
  const validated = parseInput(
    knowledgeArticleSchema,
    input,
    "Could not save the guidance article. Please check the fields and try again."
  );
  await getCurrentAdmin();

  const [existing] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("Knowledge article not found");
  }

  if (existing.status === "published") {
    throw new Error("Cannot update a published article. Create a new version instead.");
  }

  // Publishing must go through publishKnowledgeArticle, which validates the
  // article's provenance. Direct status changes to "published" are rejected
  // here to prevent bypassing that check.
  if (validated.status === "published") {
    throw new Error(
      "Cannot publish through update. Use publishKnowledgeArticle, which validates provenance."
    );
  }

  const [article] = await db
    .update(knowledgeArticles)
    .set({
      ...articleValues(validated),
      status: validated.status,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticles.id, id))
    .returning();

  // Log audit event
  await logAdminAuditEvent({
    action: "update_guidance",
    targetType: "knowledge_article",
    targetId: String(article.id),
  });

  return article;
}

/**
 * Move a draft into review. Publishing is only allowed from this state.
 */
export async function setKnowledgeArticleInReview(id: number) {
  await getCurrentAdmin();

  const [existing] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("Knowledge article not found");
  }

  if (existing.status === "published") {
    throw new Error("A published article cannot move back to review.");
  }

  const [article] = await db
    .update(knowledgeArticles)
    .set({ status: "in_review", updatedAt: new Date() })
    .where(eq(knowledgeArticles.id, id))
    .returning();

  await logAdminAuditEvent({
    action: "submit_guidance_for_review",
    targetType: "knowledge_article",
    targetId: String(article.id),
  });

  return article;
}

/**
 * Publish a knowledge article. Requires an in-review article.
 *
 * Publication validates the article's provenance rather than assuming expert
 * review:
 *   - expert_reviewed articles need a named reviewer and review date;
 *   - source_backed articles need a cited publisher, title, and URL.
 *
 * An optional `review` argument lets the admin record the expert who signed off
 * (stamped with the current time) at publish time for expert-reviewed content.
 * It is ignored for source-backed articles, whose publication does NOT imply
 * expert approval.
 */
export async function publishKnowledgeArticle(
  id: number,
  review?: { reviewer?: string; reviewedAt?: string }
) {
  await getCurrentAdmin();

  const [existing] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("Knowledge article not found");
  }

  if (existing.status === "published") {
    throw new Error("Article is already published");
  }

  // Enforce the documented Draft -> In review -> Published flow so guidance
  // cannot reach the AI prompt without an explicit review step.
  if (existing.status !== "in_review") {
    throw new Error("Send the article to review before publishing it.");
  }

  const provenance = normalizeProvenance(existing.provenance);
  const providedReviewer = review?.reviewer?.trim() || null;
  const reviewer =
    provenance === EXPERT_REVIEWED
      ? providedReviewer ?? existing.reviewer
      : existing.reviewer;

  const reviewedAt =
    provenance === EXPERT_REVIEWED
      ? parseOptionalDate(review?.reviewedAt) ?? existing.reviewedAt ?? new Date()
      : existing.reviewedAt;

  // Single source of truth for the publish gate.
  const errors = validatePublication({ ...existing, provenance, reviewer, reviewedAt });
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  // Surface provenance gaps (missing access date or licence) in the server log
  // without blocking publication.
  const warnings = publicationWarnings({ ...existing, provenance });
  if (warnings.length > 0) {
    console.warn(
      `Guidance article ${existing.id} published with provenance warnings: ${warnings.join(" ")}`
    );
  }

  const [article] = await db
    .update(knowledgeArticles)
    .set({
      status: "published",
      provenance,
      reviewer,
      reviewedAt,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticles.id, id))
    .returning();

  // Log audit event
  await logAdminAuditEvent({
    action: "publish_guidance",
    targetType: "knowledge_article",
    targetId: String(article.id),
  });

  return article;
}

/**
 * Get published knowledge articles for a crop (used by AI assessment context).
 * This does NOT require admin auth - used by the chat AI pipeline.
 */
export async function getPublishedGuidance(crop: string = "tomato") {
  // Exported as a server action, so it must not be callable anonymously.
  await getCurrentUser();

  const articles = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.status, "published"))
    .orderBy(asc(knowledgeArticles.problem));

  return articles.filter((a) => a.crop === crop);
}

/**
 * Get the review queue — assessments flagged as needing human attention.
 * Returns aggregate data without exposing personal farmer details by default.
 */
export async function getReviewQueue() {
  await getCurrentAdmin();

  const results = await db
    .select({
      id: assessments.id,
      conversationId: assessments.conversationId,
      messageId: assessments.messageId,
      structuredResult: assessments.structuredResult,
      model: assessments.model,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .where(
      // Flag medium/high uncertainty at the database level so older reports
      // needing attention are never hidden behind a fixed-size recent window.
      sql`(${assessments.structuredResult})::jsonb -> 'uncertainty' ->> 'level' IN ('medium', 'high')`
    )
    .orderBy(desc(assessments.createdAt));

  const flagged = results
    .map((row) => {
      try {
        const parsed = JSON.parse(row.structuredResult);
        const uncertainty = parsed.uncertainty ?? {};
        return {
          id: row.id,
          conversationId: row.conversationId,
          messageId: row.messageId,
          uncertainty: uncertainty,
          observedSigns: parsed.observedSigns ?? [],
          possibleCauses: parsed.possibleCauses ?? [],
          createdAt: row.createdAt,
          model: row.model,
          latestReview: null as {
            decision: string;
            notes: string;
            createdAt: Date;
          } | null,
        };
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

  // Attach the most recent human review to each flagged assessment so the
  // dashboard can distinguish unreviewed cases from closed ones.
  if (flagged.length > 0) {
    const reviews = await db
      .select({
        assessmentId: safetyReviews.assessmentId,
        decision: safetyReviews.decision,
        notes: safetyReviews.notes,
        createdAt: safetyReviews.createdAt,
      })
      .from(safetyReviews)
      .where(
        inArray(
          safetyReviews.assessmentId,
          flagged.map((item) => item.id)
        )
      )
      .orderBy(desc(safetyReviews.createdAt));

    const latestByAssessment = new Map<
      number,
      { decision: string; notes: string; createdAt: Date }
    >();
    for (const review of reviews) {
      if (!latestByAssessment.has(review.assessmentId)) {
        latestByAssessment.set(review.assessmentId, {
          decision: review.decision,
          notes: review.notes,
          createdAt: review.createdAt,
        });
      }
    }
    for (const item of flagged) {
      item.latestReview = latestByAssessment.get(item.id) ?? null;
    }
  }

  return flagged;
}

const safetyReviewSchema = z.object({
  assessmentId: z.number().int().positive(),
  decision: z.enum(["approved", "needs_follow_up", "unsafe"]),
  notes: z.string().trim().min(3).max(2000),
});

/** Record a human safety review for one AI assessment. */
export async function recordSafetyReview(input: {
  assessmentId: number;
  decision: string;
  notes: string;
}) {
  const admin = await getCurrentAdmin();
  const validated = parseInput(
    safetyReviewSchema,
    input,
    "Could not save the safety review. Check the decision and notes."
  );

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, validated.assessmentId))
    .limit(1);

  if (!assessment) {
    throw new Error("Assessment not found");
  }

  const [review] = await db
    .insert(safetyReviews)
    .values({
      assessmentId: validated.assessmentId,
      adminId: admin.id,
      decision: validated.decision,
      notes: validated.notes,
    })
    .returning();

  await logAdminAuditEvent({
    action: "record_safety_review",
    targetType: "assessment",
    targetId: String(validated.assessmentId),
    metadata: {
      decision: validated.decision,
      reviewId: review.id,
    },
  });

  return review;
}

/** List human safety reviews for one assessment, newest first. */
export async function getSafetyReviews(assessmentId: number) {
  await getCurrentAdmin();

  return db
    .select()
    .from(safetyReviews)
    .where(eq(safetyReviews.assessmentId, assessmentId))
    .orderBy(desc(safetyReviews.createdAt));
}

/**
 * Get an individual conversation for admin review.
 * Unlike the farmer-scoped getConversation, this does not require the
 * caller to own the conversation — admin access is already enforced by
 * getCurrentAdmin. Logs an audit event for this access.
 */
export async function getAdminConversation(conversationId: number) {
  await getCurrentAdmin();

  const conversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (conversation.length === 0) {
    return null;
  }

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  // Batched image query instead of one query per message (N+1).
  const imagesByMessage = new Map<
    number,
    Array<typeof messageImages.$inferSelect>
  >();
  if (conversationMessages.length > 0) {
    const imageRows = await db
      .select()
      .from(messageImages)
      .where(
        inArray(
          messageImages.messageId,
          conversationMessages.map((message) => message.id)
        )
      )
      .orderBy(messageImages.createdAt);

    for (const image of imageRows) {
      const list = imagesByMessage.get(image.messageId) ?? [];
      list.push(image);
      imagesByMessage.set(image.messageId, list);
    }
  }

  const messagesWithImages = conversationMessages.map((message) => ({
    ...message,
    images: imagesByMessage.get(message.id) ?? [],
  }));

  // Return every assessment so the review page can show the specific flagged
  // one rather than always the first assessment in the conversation.
  const assessmentsList = await db
    .select()
    .from(assessments)
    .where(eq(assessments.conversationId, conversationId))
    .orderBy(asc(assessments.createdAt));

  // Log audit event for individual report access
  await logAdminAuditEvent({
    action: "view_report",
    targetType: "conversation",
    targetId: String(conversationId),
  });

  return {
    ...conversation[0],
    messages: messagesWithImages,
    assessments: assessmentsList,
  };
}

/**
 * Validation schema for follow-up feedback.
 */
const followUpSchema = z.object({
  conversationId: z.number().int().positive(),
  messageId: z.number().int().positive(),
  farmerObservation: z.string().min(1).max(2000),
  outcome: z.enum(["helped", "not_helped", "unsure"]),
  helpful: z.enum(["yes", "no", "unsure"]),
});

/**
 * Record a follow-up outcome from a farmer.
 */
export async function recordFollowUp(input: {
  conversationId: number;
  messageId: number;
  farmerObservation: string;
  outcome: string;
  helpful: string;
}) {
  const user = await getCurrentUser();

  const validated = parseInput(
    followUpSchema,
    input,
    "Could not save your feedback. Please try again."
  );

  // Verify the conversation belongs to the user
  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.id, validated.conversationId), eq(conversations.userId, user.id))
    )
    .limit(1);

  if (conversation.length === 0) {
    throw new Error("Conversation not found or access denied");
  }

  // Verify the feedback targets a message that actually belongs to this
  // conversation, so feedback cannot be attached to a different conversation's
  // message.
  const message = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, validated.messageId))
    .limit(1);

  if (message.length === 0 || message[0].conversationId !== validated.conversationId) {
    throw new Error("Message not found in this conversation");
  }

  const [followUp] = await db
    .insert(followUps)
    .values({
      conversationId: validated.conversationId,
      messageId: validated.messageId,
      farmerObservation: validated.farmerObservation,
      outcome: validated.outcome,
      helpful: validated.helpful,
    })
    .returning();

  return followUp;
}

/**
 * Get follow-ups for a conversation (owner only).
 */
export async function getFollowUps(conversationId: number) {
  const user = await getCurrentUser();

  // Verify ownership
  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.userId, user.id))
    )
    .limit(1);

  if (conversation.length === 0) {
    throw new Error("Conversation not found or access denied");
  }

  return db
    .select()
    .from(followUps)
    .where(eq(followUps.conversationId, conversationId))
    .orderBy(desc(followUps.createdAt));
}

/**
 * Get the most recent assessment that is old enough to ask the farmer about,
 * and for which no follow-up has been recorded yet. Owner-scoped.
 *
 * The follow-up is attached to the assistant message produced by the
 * assessment, so a reminder is only suppressed by feedback on that same
 * message. Returns null when nothing is due.
 */
export async function getFollowUpReminders() {
  const user = await getCurrentUser();
  const cutoff = reminderCutoff(new Date(), followUpReminderHours());

  const rows = await db
    .select({
      conversationId: assessments.conversationId,
      messageId: assessments.assistantMessageId,
      assessedAt: assessments.createdAt,
      conversationTitle: conversations.title,
    })
    .from(assessments)
    .innerJoin(conversations, eq(assessments.conversationId, conversations.id))
    // A recorded follow-up on the assistant message clears the reminder for it.
    .leftJoin(followUps, eq(followUps.messageId, assessments.assistantMessageId))
    .where(
      and(
        eq(conversations.userId, user.id),
        isNotNull(assessments.assistantMessageId),
        isNull(followUps.id),
        lt(assessments.createdAt, cutoff)
      )
    )
    .orderBy(desc(assessments.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Get admin overview metrics (aggregate data only).
 */
export async function getAdminOverview() {
  await getCurrentAdmin();

  // Count farmers from Better Auth user table (role = 'farmer')
  const farmerResult = await db.execute(sql`
    SELECT count(*) as count FROM "user" WHERE "role" = 'farmer'
  `);
  const farmers = Number(farmerResult.rows[0]?.count ?? 0);

  // Count conversations
  const convResult = await db.execute(sql`
    SELECT count(*) as count FROM conversations
  `);
  const conversationsCount = Number(convResult.rows[0]?.count ?? 0);

  // Count crop reports (user messages with images attached)
  const reportResult = await db.execute(sql`
    SELECT count(DISTINCT m.conversation_id) as count
    FROM messages m
    INNER JOIN message_images mi ON mi.message_id = m.id
    WHERE m.role = 'user'
  `);
  const cropReports = Number(reportResult.rows[0]?.count ?? 0);

  // Count assessments needing review (medium or high uncertainty), matching
  // the review queue so the dashboard count agrees with the queue.
  const reviewResult = await db.execute(sql`
    SELECT count(*) as count FROM assessments a
    WHERE (a.structured_result)::jsonb -> 'uncertainty' ->> 'level' IN ('medium', 'high')
  `);
  const needsReview = Number(reviewResult.rows[0]?.count ?? 0);

  return {
    farmers,
    conversations: conversationsCount,
    cropReports,
    needsReview,
  };
}

export type AiTelemetrySummary = {
  windowHours: number;
  total: number;
  ok: number;
  filtered: number;
  fallback: number;
  error: number;
  /** Share of attempts that needed the safe fallback or failed outright. */
  degradedRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  safetyFlagTotal: number;
  imageFailureTotal: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated at configured rates, stored as integer micro-USD. */
  estimatedCostMicroUsd: number;
  costPerAssessmentMicroUsd: number;
  quotaFailures: number;
  imageBytesOriginal: number;
  imageBytesSent: number;
  imageOptimized: number;
  queue: {
    queued: number;
    running: number;
    dead: number;
  };
  dailyTrend: Array<{
    day: string;
    total: number;
    errors: number;
    quotaFailures: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    estimatedCostMicroUsd: number;
  }>;
  recentIssues: Array<{
    id: number;
    outcome: string;
    failureKind: string;
    modelRequested: string;
    modelUsed: string | null;
    latencyMs: number;
    safetyFlagCount: number;
    imageFailed: number;
    validationOutcome: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostMicroUsd: number;
    createdAt: Date;
  }>;
};

/**
 * Aggregate AI pipeline health for the admin dashboard.
 *
 * Reads only the metadata-only `ai_events` table — never farmer text or model
 * output. Aggregates are computed in the database so the dashboard stays fast
 * as event volume grows. `windowHours` bounds how far back the counts look.
 */
export async function getAiTelemetrySummary(
  windowHours = 24
): Promise<AiTelemetrySummary> {
  await getCurrentAdmin();

  const safeWindow = Number.isFinite(windowHours)
    ? Math.min(24 * 30, Math.max(1, Math.trunc(windowHours)))
    : 24;

  const summaryResult = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE outcome = 'ok')::int AS ok,
      count(*) FILTER (WHERE outcome = 'filtered')::int AS filtered,
      count(*) FILTER (WHERE outcome = 'fallback')::int AS fallback,
      count(*) FILTER (WHERE outcome = 'error')::int AS error,
      coalesce(avg(latency_ms), 0)::int AS avg_latency_ms,
      coalesce(
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms),
        0
      )::int AS p50_latency_ms,
      coalesce(
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),
        0
      )::int AS p95_latency_ms,
      coalesce(sum(safety_flag_count), 0)::int AS safety_flag_total,
      coalesce(sum(image_failed), 0)::int AS image_failure_total,
      coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
      coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
      coalesce(sum(estimated_cost_micro_usd), 0)::bigint AS estimated_cost_micro_usd,
      count(*) FILTER (WHERE failure_kind = 'quota')::int AS quota_failures,
      coalesce(sum(image_bytes_original), 0)::bigint AS image_bytes_original,
      coalesce(sum(image_bytes_sent), 0)::bigint AS image_bytes_sent,
      coalesce(sum(image_optimized), 0)::int AS image_optimized
    FROM ai_events
    WHERE created_at >= now() - make_interval(hours => ${safeWindow})
  `);

  const row = (summaryResult.rows[0] ?? {}) as Record<string, unknown>;
  const num = (value: unknown) => Number(value ?? 0);
  const total = num(row.total);
  const fallback = num(row.fallback);
  const error = num(row.error);
  const estimatedCostMicroUsd = num(row.estimated_cost_micro_usd);

  const trendResult = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(
        current_date - make_interval(days => 13),
        current_date,
        interval '1 day'
      )::date AS day
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS day,
      count(events.id)::int AS total,
      count(events.id) FILTER (WHERE events.outcome = 'error')::int AS errors,
      count(events.id) FILTER (
        WHERE events.failure_kind = 'quota'
      )::int AS quota_failures,
      coalesce(avg(events.latency_ms), 0)::int AS avg_latency_ms,
      coalesce(
        percentile_cont(0.95) WITHIN GROUP (ORDER BY events.latency_ms),
        0
      )::int AS p95_latency_ms,
      coalesce(sum(events.estimated_cost_micro_usd), 0)::bigint AS estimated_cost_micro_usd
    FROM days
    LEFT JOIN ai_events events
      ON events.created_at >= days.day
      AND events.created_at < days.day + interval '1 day'
    GROUP BY days.day
    ORDER BY days.day
  `);

  const dailyTrend = trendResult.rows.map((trend) => {
    const trendRow = trend as Record<string, unknown>;
    return {
      day: String(trendRow.day),
      total: num(trendRow.total),
      errors: num(trendRow.errors),
      quotaFailures: num(trendRow.quota_failures),
      avgLatencyMs: num(trendRow.avg_latency_ms),
      p95LatencyMs: num(trendRow.p95_latency_ms),
      estimatedCostMicroUsd: num(trendRow.estimated_cost_micro_usd),
    };
  });

  const queueResult = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE status = 'running')::int AS running,
      count(*) FILTER (WHERE status = 'dead')::int AS dead
    FROM assessment_jobs
  `);
  const queueRow = (queueResult.rows[0] ?? {}) as Record<string, unknown>;

  const recentIssues = await db
    .select({
      id: aiEvents.id,
      outcome: aiEvents.outcome,
      failureKind: aiEvents.failureKind,
      modelRequested: aiEvents.modelRequested,
      modelUsed: aiEvents.modelUsed,
      latencyMs: aiEvents.latencyMs,
      safetyFlagCount: aiEvents.safetyFlagCount,
      imageFailed: aiEvents.imageFailed,
      validationOutcome: aiEvents.validationOutcome,
      inputTokens: aiEvents.inputTokens,
      outputTokens: aiEvents.outputTokens,
      estimatedCostMicroUsd: aiEvents.estimatedCostMicroUsd,
      createdAt: aiEvents.createdAt,
    })
    .from(aiEvents)
    .where(ne(aiEvents.outcome, "ok"))
    .orderBy(desc(aiEvents.createdAt))
    .limit(10);

  return {
    windowHours: safeWindow,
    total,
    ok: num(row.ok),
    filtered: num(row.filtered),
    fallback,
    error,
    degradedRate: total > 0 ? (fallback + error) / total : 0,
    avgLatencyMs: num(row.avg_latency_ms),
    p50LatencyMs: num(row.p50_latency_ms),
    p95LatencyMs: num(row.p95_latency_ms),
    safetyFlagTotal: num(row.safety_flag_total),
    imageFailureTotal: num(row.image_failure_total),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    estimatedCostMicroUsd,
    costPerAssessmentMicroUsd:
      total > 0 ? Math.round(estimatedCostMicroUsd / total) : 0,
    quotaFailures: num(row.quota_failures),
    imageBytesOriginal: num(row.image_bytes_original),
    imageBytesSent: num(row.image_bytes_sent),
    imageOptimized: num(row.image_optimized),
    queue: {
      queued: num(queueRow.queued),
      running: num(queueRow.running),
      dead: num(queueRow.dead),
    },
    dailyTrend,
    recentIssues,
  };
}
