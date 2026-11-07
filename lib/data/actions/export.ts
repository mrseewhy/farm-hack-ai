"use server";

import { headers } from "next/headers";
import { asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import {
  assessments,
  conversations,
  followUps,
  messageImages,
  messages,
} from "@/lib/data/dal/schema";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";

/**
 * Farmer-initiated data export.
 *
 * Returns only rows owned by the authenticated session user, with images joined
 * to their message. This is the "export" half of the retention policy; the cron
 * worker handles scheduled deletion.
 */
export async function exportMyData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  const userId = session.user.id;
  const ownedConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(asc(conversations.createdAt));

  const conversationIds = ownedConversations.map((row) => row.id);

  const ownedMessages = conversationIds.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .orderBy(asc(messages.createdAt))
    : [];

  const messageIds = ownedMessages.map((row) => row.id);

  const [ownedImages, ownedAssessments, ownedFollowUps] = await Promise.all([
    messageIds.length
      ? db
          .select()
          .from(messageImages)
          .where(inArray(messageImages.messageId, messageIds))
      : Promise.resolve([]),
    conversationIds.length
      ? db
          .select()
          .from(assessments)
          .where(inArray(assessments.conversationId, conversationIds))
      : Promise.resolve([]),
    conversationIds.length
      ? db
          .select()
          .from(followUps)
          .where(inArray(followUps.conversationId, conversationIds))
      : Promise.resolve([]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    consentPolicyVersion: CONSENT_POLICY_VERSION,
    account: {
      id: userId,
      name: session.user.name,
      email: session.user.email,
      preferredLanguage: session.user.preferredLanguage ?? "English",
    },
    conversations: ownedConversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      crop: conversation.crop,
      language: conversation.language,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: ownedMessages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          language: message.language,
          createdAt: message.createdAt,
          images: ownedImages.filter((image) => image.messageId === message.id),
        })),
      assessments: ownedAssessments.filter(
        (assessment) => assessment.conversationId === conversation.id
      ),
      followUps: ownedFollowUps.filter(
        (followUp) => followUp.conversationId === conversation.id
      ),
    })),
  };
}
