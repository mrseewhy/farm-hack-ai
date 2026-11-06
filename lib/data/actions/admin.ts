"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import {
  assessments,
  adminAuditEvents,
  knowledgeArticles,
} from "@/lib/data/dal";
import { desc, sql, eq, asc } from "drizzle-orm";
import { z } from "zod";

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
 * Log an admin audit event.
 */
export async function logAdminAuditEvent(input: {
  action: string;
  targetType: string;
  targetId: string;
}) {
  const admin = await getCurrentAdmin();

  const [event] = await db
    .insert(adminAuditEvents)
    .values({
      adminId: admin.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
    })
    .returning();

  return event;
}

/**
 * Validation schema for knowledge articles.
 */
const knowledgeArticleSchema = z.object({
  id: z.number().int().positive().optional(),
  crop: z.string().min(1).max(100).default("tomato"),
  problem: z.string().min(1).max(200),
  signs: z.string().min(1).max(2000),
  distinguishingQuestions: z.string().min(1).max(2000),
  approvedActions: z.string().min(1).max(2000),
  status: z.enum(["draft", "in_review", "published"]).default("draft"),
  version: z.string().min(1).max(20).default("1.0"),
  reviewer: z.string().min(1).max(200).optional(),
  reviewedAt: z.string().optional(),
});

export type KnowledgeArticleInput = z.infer<typeof knowledgeArticleSchema>;

/**
 * List all knowledge articles, ordered by crop, problem, version.
 */
export async function getKnowledgeArticles() {
  await getCurrentAdmin();

  const articles = await db
    .select()
    .from(knowledgeArticles)
    .orderBy(asc(knowledgeArticles.crop), asc(knowledgeArticles.problem), desc(knowledgeArticles.version));

  // Log that admin accessed knowledge articles
  await logAdminAuditEvent({
    action: "view_knowledge_articles",
    targetType: "knowledge_articles",
    targetId: "all",
  });

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
  const validated = knowledgeArticleSchema.parse(input);
  await getCurrentAdmin();

  const [article] = await db
    .insert(knowledgeArticles)
    .values({
      crop: validated.crop,
      problem: validated.problem,
      signs: validated.signs,
      distinguishingQuestions: validated.distinguishingQuestions,
      approvedActions: validated.approvedActions,
      status: "draft",
      version: validated.version,
      reviewer: null,
      reviewedAt: null,
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
  const validated = knowledgeArticleSchema.parse(input);
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

  const [article] = await db
    .update(knowledgeArticles)
    .set({
      crop: validated.crop,
      problem: validated.problem,
      signs: validated.signs,
      distinguishingQuestions: validated.distinguishingQuestions,
      approvedActions: validated.approvedActions,
      status: validated.status,
      version: validated.version,
      reviewer: validated.reviewer ?? null,
      reviewedAt: validated.reviewedAt ? new Date(validated.reviewedAt) : null,
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
 * Publish a knowledge article. Requires reviewer and reviewedAt.
 */
export async function publishKnowledgeArticle(id: number, reviewer: string) {
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

  const [article] = await db
    .update(knowledgeArticles)
    .set({
      status: "published",
      reviewer,
      reviewedAt: new Date(),
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
    .orderBy(desc(assessments.createdAt))
    .limit(50);

  // Filter to high-uncertainty assessments in application code
  // (Drizzle JSON filtering is database-specific)
  const flagged = results
    .map((row) => {
      try {
        const parsed = JSON.parse(row.structuredResult);
        const uncertainty = parsed.uncertainty ?? {};
        if (uncertainty.level === "high" || uncertainty.level === "medium") {
          return {
            id: row.id,
            conversationId: row.conversationId,
            messageId: row.messageId,
            uncertainty: uncertainty,
            observedSigns: parsed.observedSigns ?? [],
            possibleCauses: parsed.possibleCauses ?? [],
            createdAt: row.createdAt,
            model: row.model,
          };
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

  // Log that admin accessed the review queue
  await logAdminAuditEvent({
    action: "view_review_queue",
    targetType: "review_queue",
    targetId: "all",
  });

  return flagged;
}

/**
 * Get an individual conversation for admin review.
 * Logs an audit event for this access.
 */
export async function getAdminConversation(conversationId: number) {
  await getCurrentAdmin();

  // Log audit event for individual report access
  await logAdminAuditEvent({
    action: "view_report",
    targetType: "conversation",
    targetId: String(conversationId),
  });

  const { getConversation } = await import("./chat");
  return getConversation(conversationId);
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
    SELECT count(DISTINCT m."conversationId") as count
    FROM messages m
    INNER JOIN message_images mi ON mi."messageId" = m.id
    WHERE m.role = 'user'
  `);
  const cropReports = Number(reportResult.rows[0]?.count ?? 0);

  // Count assessments needing review (high uncertainty)
  const reviewResult = await db.execute(sql`
    SELECT count(*) as count FROM assessments a
    WHERE (a."structuredResult")::jsonb ->> 'uncertainty' = '{}'
       OR (a."structuredResult")::jsonb -> 'uncertainty' ->> 'level' = 'high'
  `);
  const needsReview = Number(reviewResult.rows[0]?.count ?? 0);

  return {
    farmers,
    conversations: conversationsCount,
    cropReports,
    needsReview,
  };
}
