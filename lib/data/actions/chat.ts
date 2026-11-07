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
  aiEvents,
  knowledgeArticles,
} from "@/lib/data/dal";
import { eq, desc, and, inArray, ne, sql, gte } from "drizzle-orm";
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
  MODEL_CANDIDATES,
  MODEL_NAME,
  MAX_HISTORY_MESSAGES,
  type AssessmentResult,
} from "@/lib/ai";
import { buildAiEvent, logAiEvent, type AiEvent } from "@/lib/monitoring";
import { formatGuidanceContext } from "@/lib/guidance";
import {
  assessmentWindowStart,
  dailyAssessmentLimit,
  isDailyAssessmentLimitReached,
} from "@/lib/rate-limit";
import { aiEventToRow } from "@/lib/data/ai-event-row";
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

/** Build the persisted assistant reply text from a structured assessment. */
function buildAssistantContent(assessment: AssessmentResult): string {
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
  return (
    candidate?.code === "23505" || candidate?.cause?.code === "23505"
  );
}

/**
 * Persist one AI telemetry event and emit it as a structured log line.
 *
 * Monitoring must never break an assessment, so an insert failure is logged and
 * swallowed: the farmer still gets their answer even if the metrics table is
 * unavailable. The event carries no farmer text or model output.
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
 * it produced. If the link is missing (older rows, or a crash between saving
 * the assessment and the reply) the reply is created and linked once so a
 * retry can always finish the job.
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

  const assessment = JSON.parse(
    existing.structuredResult
  ) as AssessmentResult;
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
  const existing = await resolveExistingAssessment(
    input.conversationId,
    input.messageId,
    input.language
  );
  if (existing) return existing;

  // Per-user abuse and cost control. This runs after the idempotency check so
  // retrying an already-assessed message never consumes the allowance.
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
        eq(conversations.userId, user.id),
        gte(assessments.createdAt, assessmentWindowStart())
      )
    );

  if (isDailyAssessmentLimitReached(Number(recentAssessments), limit)) {
    console.warn(
      `AI assessment limit reached for user ${user.id}: ${recentAssessments}/${limit} in the last 24 hours.`
    );
    throw new Error(
      "Daily AI assessment limit reached. Please try again later."
    );
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

  // Fetch curated guidance for context. Provenance travels with each article
  // so the prompt can distinguish source-backed from expert-reviewed material
  // and never overstate either.
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
    // Tomato is the only supported crop. Filtering on crop prevents guidance
    // for a future crop from leaking into a tomato assessment.
    .where(
      and(
        eq(knowledgeArticles.status, "published"),
        eq(knowledgeArticles.crop, "tomato")
      )
    );

  const guidanceContext = formatGuidanceContext(guidanceArticles);

  let aiResult: Awaited<ReturnType<typeof assessCropHealth>>;
  try {
    aiResult = await assessCropHealth({
      symptoms,
      images,
      language: input.language,
      guidanceContext,
      history,
    });
  } catch (error) {
    // Every configured model failed. Record the failure before rethrowing so
    // provider outages show up in monitoring, not only in request logs.
    await recordAiEvent(
      buildAiEvent({
        eventType: "assessment",
        modelRequested: MODEL_NAME,
        modelUsed: null,
        // If the real responder threw, every configured candidate was tried.
        fallbackAttempts: MODEL_CANDIDATES.length,
        fallbackUsed: MODEL_CANDIDATES.length > 1,
        validationOutcome: "invalid",
        outcome: "error",
      }),
      input.conversationId
    );
    throw error;
  }

  const { assessment, model: assessmentModel, telemetry } = aiResult;

  // Build the assistant reply content server-side from the assessment.
  // The content is derived from the model output, never from caller input,
  // so a farmer cannot forge an assistant reply through a separate call.
  const assistantContent = buildAssistantContent(assessment);

  // Save the assessment and its assistant reply in one transaction, then
  // record the explicit link. The unique index on assessments.message_id makes
  // this atomic: a concurrent duplicate submission is rejected instead of
  // creating a second assessment and a second assistant reply.
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
          // Record the model that actually produced this result, which may be a
          // fallback when the primary model was unavailable.
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
    // A concurrent request won the race and already stored this assessment.
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

  // Record telemetry after the assessment is safely persisted and outside the
  // transaction's error handling. It is best-effort and self-contained, so a
  // monitoring problem can never affect the farmer's request.
  await recordAiEvent(
    buildAiEvent({ ...telemetry, occurredAt: new Date().toISOString() }),
    input.conversationId
  );

  return { assessment, ...saved };
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
