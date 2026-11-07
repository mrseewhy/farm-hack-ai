"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import { conversations, messageImages, messages } from "@/lib/data/dal";
import { looksLikeImage } from "@/lib/image";
import { deleteStoredImage, storeCropImage } from "@/lib/media";
import { and, eq } from "drizzle-orm";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGES_PER_CONVERSATION = 5;

/**
 * Upload a crop photo to Cloudinary.
 * Returns { success, publicId, secureUrl, conversationId } or { error }.
 */
export async function uploadCropImage(formData: FormData, messageId: number) {
  "use server";

  const file = formData.get("file") as File | null;
  const conversationIdRaw = formData.get("conversationId");
  const conversationId = conversationIdRaw ? Number(conversationIdRaw) : NaN;

  if (
    !file ||
    !conversationId ||
    Number.isNaN(conversationId) ||
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {
    return { error: "Missing file, conversation ID, or message ID" };
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Invalid image type. Use JPEG, PNG, or WebP." };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return { error: "Image too large. Maximum 10MB." };
  }

  // Get authenticated user
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return { error: "Not authenticated" };
  }

  const user = session.user;

  // Verify conversation ownership
  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, user.id)
      )
    )
    .limit(1);

  if (conversation.length === 0) {
    return { error: "Conversation not found or access denied" };
  }

  // Validate image count per conversation
  const existingImages = await db
    .select({ id: messageImages.id })
    .from(messageImages)
    .innerJoin(messages, eq(messageImages.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId));
  if (existingImages.length >= MAX_IMAGES_PER_CONVERSATION) {
    return {
      error: `Maximum ${MAX_IMAGES_PER_CONVERSATION} images per conversation reached.`,
    };
  }

  // Verify the message belongs to this user's conversation BEFORE uploading to
  // Cloudinary. A failed check must never leave an orphaned Cloudinary file
  // behind. Conversation ownership was already established above, so matching
  // the message's conversationId is sufficient.
  const message = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (message.length === 0) {
    return { error: "Message not found" };
  }
  if (message[0].conversationId !== conversationId) {
    return { error: "Message does not belong to this conversation" };
  }

  // Upload to Cloudinary
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // The browser-supplied MIME type is only a hint. Check the file signature
    // so a renamed non-image cannot be uploaded to Cloudinary.
    if (!looksLikeImage(buffer)) {
      return { error: "File is not a valid JPEG, PNG, or WebP image." };
    }

    const uploadResult = await storeCropImage(buffer, file.type);

    // Bind the verified upload to the message. Ownership was already checked
    // above, so no remote file is left behind by a failed access check.
    let imageId: number | null = null;
    try {
      const [image] = await db
        .insert(messageImages)
        .values({
          messageId,
          cloudinaryPublicId: uploadResult.publicId,
          secureUrl: uploadResult.secureUrl,
        })
        .returning();
      imageId = image.id;
    } catch (insertError) {
      // The file is already stored; if binding it to the database fails,
      // delete it so it cannot become an orphan.
      try {
        await deleteStoredImage(uploadResult.publicId);
      } catch {
        console.error(
          "Failed to delete orphaned uploaded image",
          uploadResult.publicId,
          insertError
        );
      }
      throw insertError;
    }

    return {
      success: true,
      publicId: uploadResult.publicId,
      secureUrl: uploadResult.secureUrl,
      conversationId,
      imageId,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return { error: "Upload failed. Please try again." };
  }
}
