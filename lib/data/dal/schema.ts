import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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
});

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
  structuredResult: text("structured_result").notNull(), // JSON string
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
 * Table exports for queries
 */
export const tables = {
  conversations,
  messages,
  messageImages,
  assessments,
  adminAuditEvents,
} as const;
