import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Conversations table
 * Owned by the user who created it. References Better Auth's users table
 * by user_id (no FK constraint here to avoid conflicts with auth schema).
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New conversation"),
  crop: text("crop").notNull().default("tomato"),
  language: text("language").notNull().default("English"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
  index("conversations_updated_at_idx").on(table.updatedAt),
]);

/**
 * Messages table
 * Belongs to a conversation. Role is user or assistant.
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  language: text("language").notNull().default("English"),
  status: text("status").notNull().default("pending"), // "pending" | "sent" | "failed"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  index("messages_created_at_idx").on(table.createdAt),
]);

/**
 * Message images table
 * Stores Cloudinary metadata for photos attached to assistant/user messages.
 */
export const messageImages = pgTable("message_images", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  cloudinaryPublicId: text("cloudinary_public_id").notNull(),
  secureUrl: text("secure_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("message_images_message_id_idx").on(table.messageId),
]);

/**
 * Assessments table
 * Stores structured AI assessment results for a message.
 */
export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  messageId: integer("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  // The assistant reply that this assessment produced. Stored explicitly so
  // retries and history reloads never have to guess which reply belongs to
  // which farmer message (previously inferred from array position, which broke
  // after deletes or concurrent turns).
  assistantMessageId: integer("assistant_message_id").references(
    () => messages.id,
    { onDelete: "set null" }
  ),
  structuredResult: text("structured_result").notNull(), // JSON string
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("assessments_conversation_id_idx").on(table.conversationId),
  index("assessments_assistant_message_id_idx").on(table.assistantMessageId),
  // One assessment per message. This makes the runAssessment idempotency check
  // atomic under concurrent submissions instead of a check-then-insert race.
  uniqueIndex("assessments_message_id_unique").on(table.messageId),
]);

/**
 * Admin audit events table
 * Logs admin access to individual farmer reports and other sensitive actions.
 * adminId references the Better Auth user id (stored as text, no FK constraint
 * to avoid conflicts with the auth schema).
 */
export const adminAuditEvents = pgTable("admin_audit_events", {
  id: serial("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  action: text("action").notNull(), // e.g. "view_report", "publish_guidance"
  targetType: text("target_type").notNull(), // e.g. "conversation", "guidance"
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * AI telemetry events table
 * One row per model assessment attempt, used to monitor provider health and
 * safety behaviour in production. Deliberately metadata-only: it stores no
 * farmer text, prompts, model output, or image URLs.
 *
 * conversation_id is nullable and set to null when a conversation is deleted,
 * so operational metrics survive data deletion.
 */
export const aiEvents = pgTable("ai_events", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(
    () => conversations.id,
    { onDelete: "set null" }
  ),
  eventType: text("event_type").notNull().default("assessment"),
  promptVersion: text("prompt_version").notNull(),
  modelRequested: text("model_requested").notNull(),
  modelUsed: text("model_used"),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  fallbackAttempts: integer("fallback_attempts").notNull().default(1),
  latencyMs: integer("latency_ms").notNull().default(0),
  safetyFlagCount: integer("safety_flag_count").notNull().default(0),
  imageTotal: integer("image_total").notNull().default(0),
  imageFailed: integer("image_failed").notNull().default(0),
  validationOutcome: text("validation_outcome").notNull().default("valid"),
  outcome: text("outcome").notNull().default("ok"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ai_events_created_at_idx").on(table.createdAt),
  index("ai_events_outcome_idx").on(table.outcome),
]);

/**
 * Relations for query building
 */
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  assessments: many(assessments),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  images: many(messageImages),
  assessment: one(assessments, {
    fields: [messages.id],
    references: [assessments.messageId],
  }),
}));

export const messageImagesRelations = relations(messageImages, ({ one }) => ({
  message: one(messages, {
    fields: [messageImages.messageId],
    references: [messages.id],
  }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  conversation: one(conversations, {
    fields: [assessments.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [assessments.messageId],
    references: [messages.id],
  }),
}));

/**
 * Knowledge articles table
 * Curated crop guidance for tomato problems, used as retrieval context for the
 * AI assessment pipeline. Status flow: draft → in_review → published.
 *
 * Provenance is the critical trust field. It is deliberately NOT tied to
 * publication status: an administrator publishing an article does NOT imply
 * agricultural expert approval.
 *   source_backed   paraphrased or quoted from a cited, publicly available
 *                   source (see the source_* columns)
 *   expert_reviewed content an appropriately qualified human expert actually
 *                   reviewed (see reviewer / reviewed_at)
 * The distinction is enforced by `lib/guidance.ts` and surfaced to the model in
 * the prompt, so source-backed guidance is never described as expert-reviewed.
 */
export const knowledgeArticles = pgTable("knowledge_articles", {
  id: serial("id").primaryKey(),
  crop: text("crop").notNull().default("tomato"),
  problem: text("problem").notNull(), // e.g. "Early blight", "Bacterial wilt"
  signs: text("signs").notNull(), // observable signs
  distinguishingQuestions: text("distinguishing_questions").notNull(), // questions to ask farmer
  approvedActions: text("approved_actions").notNull(), // safe actions from the source or expert
  status: text("status").notNull().default("draft"), // draft | in_review | published
  version: text("version").notNull().default("1.0"),
  provenance: text("provenance").notNull().default("source_backed"), // source_backed | expert_reviewed
  reviewer: text("reviewer"), // name of agricultural expert who reviewed (expert_reviewed only)
  reviewedAt: timestamp("reviewed_at"), // when an expert reviewed it
  sourcePublisher: text("source_publisher"), // e.g. "University of California Statewide IPM Program"
  sourceTitle: text("source_title"), // e.g. "Early Blight — UC IPM Pest Management Guidelines: Tomato"
  sourceUrl: text("source_url"), // canonical URL
  sourceAccessedAt: timestamp("source_accessed_at"), // when the source was retrieved/paraphrased
  sourceLicense: text("source_license"), // usage/attribution terms for the source
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const knowledgeArticlesRelations = relations(knowledgeArticles, ({}) => ({}));

/**
 * Follow-ups table
 * Farmer feedback on whether AI advice helped, and observed outcomes.
 */
export const followUps = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  messageId: integer("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  farmerObservation: text("farmer_observation").notNull(), // what the farmer observed
  outcome: text("outcome").notNull(), // helped | not_helped | unsure
  helpful: text("helpful").notNull().default("unsure"), // yes | no | unsure
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("follow_ups_conversation_id_idx").on(table.conversationId),
]);

export const followUpsRelations = relations(followUps, ({ one }) => ({
  conversation: one(conversations, {
    fields: [followUps.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [followUps.messageId],
    references: [messages.id],
  }),
}));

/**
 * Table exports for queries
 */
export const tables = {
  conversations,
  messages,
  messageImages,
  assessments,
  adminAuditEvents,
  aiEvents,
  knowledgeArticles,
  followUps,
} as const;
