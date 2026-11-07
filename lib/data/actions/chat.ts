"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import {
  conversations,
  messages,
  messageImages,
  assessments,
} from "@/lib/data/dal";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  createConversationSchema,
  createMessageSchema,
  conversationListSchema,
  type CreateConversationInput,
  type CreateMessageInput,
  type ConversationListInput,
} from "@/lib/data/validation";
import { parseInput } from "@/lib/errors";
import { deleteStoredImage } from "@/lib/media";
import {
  executeAssessment,
  type AssessmentRunResult,
} from "@/lib/assessment-service";

/**
 * Get the authenticated user from the session.
 * Redirects to /login if no session exists.
 */
async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Create a new conversation for the authenticated user.
 */
export async function createConversation(input: CreateConversationInput) {
  const validated = parseInput(
    createConversationSchema,
    input,
    "Could not start a new conversation. Please check your message and try again."
  );
  const user = await getCurrentUser();

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: user.id,
      title: validated.title,
      crop: validated.crop,
      language: validated.language,
    })
    .returning();

  return conversation;
}

/**
 * List the authenticated user's conversations, most recent first.
 */
export async function getConversations(
  input: Partial<ConversationListInput> = {}
) {
  const validated = parseInput(
    conversationListSchema,
    input,
    "Could not load your conversations. Please try again."
  );
  const user = await getCurrentUser();

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(validated.limit)
    .offset(validated.offset);
}

/**
 * Load a conversation by ID, including its messages and images.
 * Only returns the conversation if it belongs to the authenticated user.
 */
export async function getConversation(conversationId: number) {
  const user = await getCurrentUser();

  const conversation = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.userId, user.id))
    )
    .limit(1);

  if (conversation.length === 0) {
    return null;
  }

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  // One batched image query instead of one query per message (N+1).
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

  const assessmentsList = await db
    .select()
    .from(assessments)
    .where(eq(assessments.conversationId, conversationId))
    .orderBy(assessments.createdAt);

  return {
    ...conversation[0],
    messages: messagesWithImages,
    assessments: assessmentsList,
  };
}

/**
 * Create a new message in a conversation.
 * Only the conversation owner can create messages.
 */
export async function createMessage(input: CreateMessageInput) {
  const validated = parseInput(
    createMessageSchema,
    input,
    "Could not save your message. Please try again."
  );
  const user = await getCurrentUser();

  // Verify the conversation belongs to the user
  const conversation = await db
    .select({ id: conversations.id, userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, validated.conversationId))
    .limit(1);

  if (conversation.length === 0 || conversation[0].userId !== user.id) {
    throw new Error("Conversation not found or access denied");
  }

  // Update conversation title on first message if it's still default
  if (validated.role === "user") {
    const existingMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, validated.conversationId));

    if (existingMessages.length === 0) {
      // This is the first message - use content as title (truncated)
      const title =
        validated.content.length > 50
          ? validated.content.slice(0, 50) + "..."
          : validated.content;
      await db
        .update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, validated.conversationId));
    }
  }

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: validated.conversationId,
      role: validated.role,
      content: validated.content,
      language: validated.language,
      // Status is server-owned; persisted messages are always sent.
      status: "sent",
    })
    .returning();

  // Retention uses updated_at as "last activity", so every new message must
  // move it. Without this, an active conversation could be deleted because the
  // timestamp was frozen at the first message.
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, validated.conversationId));

  return message;
}

/**
 * Delete a conversation and all its messages, images, and assessments.
 * Only the conversation owner can delete it.
 * Stored media is deleted before DB records.
 */
export async function deleteConversation(conversationId: number) {
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

  // Fetch all stored public_ids for images in this conversation
  const images = await db
    .select({ cloudinaryPublicId: messageImages.cloudinaryPublicId })
    .from(messageImages)
    .innerJoin(messages, eq(messageImages.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId));

  // Delete stored media
  for (const img of images) {
    try {
      await deleteStoredImage(img.cloudinaryPublicId);
    } catch (error) {
      console.error(
        `Failed to delete stored image ${img.cloudinaryPublicId}:`,
        error
      );
    }
  }

  // Delete DB records (cascade handles messages, images, assessments, jobs)
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  return { success: true, conversationId };
}

/**
 * Run AI crop health assessment for a user message and save the result.
 * Only the conversation owner can trigger an assessment.
 *
 * The evidence sent to the AI is derived server-side from the stored message
 * and its attached images. The caller supplies only conversationId and
 * messageId; symptoms and image URLs are never trusted from the client.
 *
 * If every configured model fails, the assessment is queued for the protected
 * retry worker instead of being lost.
 */
export async function runAssessment(input: {
  conversationId: number;
  messageId: number;
  language: string;
}): Promise<AssessmentRunResult> {
  const user = await getCurrentUser();
  return executeAssessment({
    userId: user.id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    language: input.language,
  });
}

/**
 * Delete a single message. Only the conversation owner can delete it.
 * Used to roll back a user message when its photo upload fails so the farmer
 * can retry the attachment without leaving a duplicate text-only message.
 */
export async function deleteMessage(input: {
  messageId: number;
  conversationId: number;
}) {
  const user = await getCurrentUser();

  const message = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);

  if (message.length === 0) {
    throw new Error("Message not found");
  }

  if (message[0].conversationId !== input.conversationId) {
    throw new Error("Message does not belong to this conversation");
  }

  const conversation = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (conversation.length === 0 || conversation[0].userId !== user.id) {
    throw new Error("Access denied to conversation");
  }

  await db.delete(messages).where(eq(messages.id, input.messageId));

  return { success: true };
}
