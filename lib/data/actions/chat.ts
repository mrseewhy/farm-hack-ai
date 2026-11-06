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
  knowledgeArticles,
} from "@/lib/data/dal";
import { eq, desc, and } from "drizzle-orm";
import {
  createConversationSchema,
  createMessageSchema,
  createMessageImageSchema,
  conversationListSchema,
  type CreateConversationInput,
  type CreateMessageInput,
  type CreateMessageImageInput,
  type ConversationListInput,
} from "@/lib/data/validation";
import { assessCropHealth } from "@/lib/ai";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
export async function createConversation(
  input: CreateConversationInput
) {
  const validated = createConversationSchema.parse(input);
  const user = await getCurrentUser();

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: user.id,
      title: validated.title,
      crop: validated.crop,
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
  const validated = conversationListSchema.parse(input);
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

  const messagesWithImages = await Promise.all(
    conversationMessages.map(async (message) => {
      const images = await db
        .select()
        .from(messageImages)
        .where(eq(messageImages.messageId, message.id));
      return { ...message, images };
    })
  );

  const assessment = await db
    .select()
    .from(assessments)
    .where(eq(assessments.conversationId, conversationId))
    .limit(1);

  return {
    ...conversation[0],
    messages: messagesWithImages,
    assessment: assessment[0] ?? null,
  };
}

/**
 * Create a new message in a conversation.
 * Only the conversation owner can create messages.
 */
export async function createMessage(input: CreateMessageInput) {
  const validated = createMessageSchema.parse(input);
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
      const title = validated.content.length > 50
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
      status: validated.status,
    })
    .returning();

  return message;
}

/**
 * Associate Cloudinary images with a message.
 * Only the conversation owner can add images.
 */
export async function createMessageImages(input: CreateMessageImageInput[]) {
  const user = await getCurrentUser();
  const results = [];

  for (const item of input) {
    const validated = createMessageImageSchema.parse(item);

    // Verify the message belongs to the user's conversation
    const message = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
      })
      .from(messages)
      .where(eq(messages.id, validated.messageId))
      .limit(1);

    if (message.length === 0) {
      throw new Error(`Message ${validated.messageId} not found`);
    }

    const conversation = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, message[0].conversationId))
      .limit(1);

    if (conversation.length === 0 || conversation[0].userId !== user.id) {
      throw new Error("Access denied to message");
    }

    const [image] = await db
      .insert(messageImages)
      .values({
        messageId: validated.messageId,
        cloudinaryPublicId: validated.cloudinaryPublicId,
        secureUrl: validated.secureUrl,
      })
      .returning();

    results.push(image);
  }

  return results;
}

/**
 * Delete a conversation and all its messages, images, and assessments.
 * Only the conversation owner can delete it.
 * Cloudinary media is deleted before DB records.
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

  // Fetch all Cloudinary public_ids for images in this conversation
  const images = await db
    .select({ cloudinaryPublicId: messageImages.cloudinaryPublicId })
    .from(messageImages)
    .innerJoin(messages, eq(messageImages.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId));

  // Delete Cloudinary media
  for (const img of images) {
    try {
      await cloudinary.uploader.destroy(img.cloudinaryPublicId);
    } catch (error) {
      console.error(`Failed to delete Cloudinary media ${img.cloudinaryPublicId}:`, error);
    }
  }

  // Delete DB records (cascade handles messages, images, assessments)
  await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId));

  return { success: true, conversationId };
}

/**
 * Run AI crop health assessment for a user message and save the result.
 * Only the conversation owner can trigger an assessment.
 */
export async function runAssessment(input: {
  conversationId: number;
  messageId: number;
  symptoms: string;
  images: Array<{ secureUrl: string }>;
  language: string;
}) {
  const user = await getCurrentUser();

  // Verify the message and conversation belong to the user
  const message = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
    })
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);

  if (message.length === 0) {
    throw new Error("Message not found");
  }

  const conversation = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, message[0].conversationId))
    .limit(1);

  if (conversation.length === 0 || conversation[0].userId !== user.id) {
    throw new Error("Access denied to conversation");
  }

  // Run AI assessment
  // Fetch expert-reviewed guidance for context
  const guidanceArticles = await db
    .select({
      problem: knowledgeArticles.problem,
      signs: knowledgeArticles.signs,
      distinguishingQuestions: knowledgeArticles.distinguishingQuestions,
      approvedActions: knowledgeArticles.approvedActions,
    })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.status, "published"));

  let guidanceContext = "";
  if (guidanceArticles.length > 0) {
    guidanceContext = "\nEXPERT-REVIEWED TOMATO GUIDANCE:\n";
    for (const article of guidanceArticles) {
      guidanceContext += `
Problem: ${article.problem}
Signs: ${article.signs}
Distinguishing questions: ${article.distinguishingQuestions}
Approved actions: ${article.approvedActions}
---`;
    }
    guidanceContext += "\nUse this guidance to inform your assessment. Reference approved actions when symptoms match known problems.";
  }

  const assessment = await assessCropHealth({
    symptoms: input.symptoms,
    images: input.images,
    language: input.language,
    guidanceContext,
  });

  // Save assessment to database
  const [assessmentRecord] = await db
    .insert(assessments)
    .values({
      conversationId: input.conversationId,
      messageId: input.messageId,
      structuredResult: JSON.stringify(assessment),
      model: "gemini-1.5-flash",
    })
    .returning();

  return { assessment, assessmentId: assessmentRecord.id };
}

