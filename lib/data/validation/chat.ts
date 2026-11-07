import { z } from "zod";

/**
 * Validation schemas for chat data operations.
 * All schemas validate input to server actions before reaching the DAL.
 */

/**
 * Schema for creating a new conversation.
 * userId comes from the authenticated session, not the client.
 */
export const createConversationSchema = z.object({
  title: z.string().min(1).max(200).default("New conversation"),
  // Any plant is supported. Values are stored lowercase for retrieval; "plant"
  // means the farmer did not specify one.
  crop: z.string().trim().min(1).max(60).default("plant"),
  language: z.enum(["English", "Yoruba", "Hausa", "Igbo"]).default("English"),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/**
 * Schema for creating a new message.
 */
export const createMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  // Clients can only create user messages. Assistant messages are written
  // server-side by the AI pipeline via runAssessment.
  role: z.enum(["user"]),
  // Content may be empty for photo-only messages; images are bound to the
  // message server-side when the photo is uploaded via uploadCropImage.
  content: z.string().max(10000).default(""),
  language: z.enum(["English", "Yoruba", "Hausa", "Igbo"]).default("English"),
  // Message status is server-owned: every persisted message is "sent".
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

/**
 * Schema for associating Cloudinary images with a message.
 */
export const createMessageImageSchema = z.object({
  messageId: z.number().int().positive(),
  cloudinaryPublicId: z.string().min(1),
  secureUrl: z.string().url(),
});

export type CreateMessageImageInput = z.infer<typeof createMessageImageSchema>;

/**
 * Schema for conversation list query params.
 */
export const conversationListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ConversationListInput = z.infer<typeof conversationListSchema>;
