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
import { eq, desc, and, inArray, ne } from "drizzle-orm";
import {
  createConversationSchema,
  createMessageSchema,
  conversationListSchema,
  type CreateConversationInput,
  type CreateMessageInput,
  type ConversationListInput,
} from "@/lib/data/validation";
import {
  assessCropHealth,
  MAX_HISTORY_MESSAGES,
  type AssessmentResult,
} from "@/lib/ai";
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
      // Status is server-owned; persisted messages are always sent.
      status: "sent",
    })
    .returning();

  return message;
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
 *
 * The evidence sent to the AI is derived server-side from the stored message
 * and its attached images. The caller supplies only conversationId and
 * messageId; symptoms and image URLs are never trusted from the client.
 */
export async function runAssessment(input: {
  conversationId: number;
  messageId: number;
  language: string;
}) {
  const user = await getCurrentUser();

  // Verify the message exists and belongs to a conversation owned by the user.
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

  if (conversation.length === 0 || conversation[0].userId !== user.id) {
    throw new Error("Access denied to conversation");
  }

  // Do not reassess a message that already has an assessment. This prevents
  // duplicate assistant replies and repeated model cost for the same message.
  const existingAssessment = await db
    .select({ id: assessments.id, structuredResult: assessments.structuredResult })
    .from(assessments)
    .where(eq(assessments.messageId, input.messageId))
    .limit(1);

  if (existingAssessment.length > 0) {
    const existing = JSON.parse(
      existingAssessment[0].structuredResult
    ) as AssessmentResult;
    const [assistantMessage] = await db
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          eq(messages.role, "assistant")
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return {
      assessment: existing,
      assessmentId: existingAssessment[0].id,
      assistantMessage: {
        id: assistantMessage?.id ?? -1,
        content: assistantMessage?.content ?? "",
      },
    };
  }

  // Use the stored message text as the symptom evidence, not caller input.
  const symptoms = message[0].content;

  // Use images attached to this stored message, not caller-supplied URLs.
  const attachedImages = await db
    .select({ secureUrl: messageImages.secureUrl })
    .from(messageImages)
    .where(eq(messageImages.messageId, input.messageId));
  const images = attachedImages.map((img) => ({ secureUrl: img.secureUrl }));

  // Prior turns give the model context for follow-up questions. Newest turns
  // are kept (bounded) and restored to chronological order.
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

  const { assessment, model: assessmentModel } = await assessCropHealth({
    symptoms,
    images,
    language: input.language,
    guidanceContext,
    history,
  });

  // Save the assessment. The unique index on assessments.message_id makes this
  // atomic: a concurrent duplicate submission is rejected instead of creating
  // a second assessment and a second assistant reply.
  let assessmentId: number;
  try {
    const [record] = await db
      .insert(assessments)
      .values({
        conversationId: input.conversationId,
        messageId: input.messageId,
        structuredResult: JSON.stringify(assessment),
        // Record the model that actually produced this result, which may be a
        // fallback when the primary model was unavailable.
        model: assessmentModel,
      })
      .returning({ id: assessments.id });
    assessmentId = record.id;
  } catch (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      const [existing] = await db
        .select({
          id: assessments.id,
          structuredResult: assessments.structuredResult,
        })
        .from(assessments)
        .where(eq(assessments.messageId, input.messageId))
        .limit(1);

      if (existing) {
        return {
          assessment: JSON.parse(
            existing.structuredResult
          ) as AssessmentResult,
          assessmentId: existing.id,
          assistantMessage: { id: -1, content: "" },
        };
      }
    }
    throw insertError;
  }

  // Build the assistant reply content server-side from the assessment.
  // The content is derived from the model output, never from caller input,
  // so a farmer cannot forge an assistant reply through a separate call.
  const contentParts: string[] = [];
  if (assessment.observedSigns.length > 0) {
    contentParts.push("**Observed signs:**\n" + assessment.observedSigns.map((s) => `- ${s}`).join("\n"));
  }
  if (assessment.possibleCauses.length > 0) {
    contentParts.push("\n**Possible causes:**\n" + assessment.possibleCauses.map((c) => `- ${c}`).join("\n"));
  }
  if (assessment.followUpQuestions.length > 0) {
    contentParts.push("\n**Things to check:**\n" + assessment.followUpQuestions.map((q) => `- ${q}`).join("\n"));
  }
  if (assessment.immediateActions.length > 0) {
    contentParts.push("\n**Suggested actions:**\n" + assessment.immediateActions.map((a) => `- ${a}`).join("\n"));
  }
  if (assessment.whenToSeekHelp) {
    contentParts.push("\n**When to seek help:**\n" + assessment.whenToSeekHelp);
  }
  if (assessment.uncertainty.level !== "low") {
    contentParts.push(`\n**Uncertainty:** ${assessment.uncertainty.level} — ${assessment.uncertainty.reason}`);
  }
  const assistantContent =
    contentParts.join("\n") ||
    "I couldn't generate an assessment. Please try again or describe your symptoms in more detail.";

  // Create the assistant message server-side. The role is fixed to "assistant".
  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: "assistant",
      content: assistantContent,
      language: input.language,
      status: "sent",
    })
    .returning();

  return { assessment, assessmentId, assistantMessage };
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
