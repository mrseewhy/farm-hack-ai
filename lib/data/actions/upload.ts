"use server";

import { v2 as cloudinary } from "cloudinary";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import { conversations, messageImages, messages } from "@/lib/data/dal";
import { and, eq } from "drizzle-orm";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGES_PER_CONVERSATION = 5;

/**
 * Detect common image signatures. This mirrors the allowed MIME list and does
 * not trust the client-provided file.type.
 */
function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // WebP: "RIFF" .... "WEBP"
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

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

    const uploadResult = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "image",
            folder: "farmhackai/crops",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [
              { quality: "auto:good" },
              { fetch_format: "auto" },
              { width: 1200, height: 1200, crop: "limit" },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else if (!result) reject(new Error("Upload returned no result"));
            else resolve(result as { public_id: string; secure_url: string });
          }
        )
        .end(buffer);
    });

    // Bind the verified upload to the message. Ownership was already checked
    // above, so no Cloudinary file is left behind by a failed access check.
    let imageId: number | null = null;
    try {
      const [image] = await db
        .insert(messageImages)
        .values({
          messageId,
          cloudinaryPublicId: uploadResult.public_id,
          secureUrl: uploadResult.secure_url,
        })
        .returning();
      imageId = image.id;
    } catch (insertError) {
      // The Cloudinary file is already uploaded; if binding it to the database
      // fails, delete it so it cannot become an orphan.
      try {
        await cloudinary.uploader.destroy(uploadResult.public_id);
      } catch {
        // Best-effort cleanup; do not mask the original insert error.
        console.error(
          "Failed to delete orphaned Cloudinary file",
          uploadResult.public_id,
          insertError
        );
      }
      throw insertError;
    }

    return {
      success: true,
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      conversationId,
      imageId,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return { error: "Upload failed. Please try again." };
  }
}
