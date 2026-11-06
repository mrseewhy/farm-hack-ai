"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import {
  assessments,
  adminAuditEvents,
} from "@/lib/data/dal";
import { desc, sql } from "drizzle-orm";

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
