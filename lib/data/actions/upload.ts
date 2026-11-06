"use server";

import { v2 as cloudinary } from "cloudinary";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/data/dal";
import { conversations } from "@/lib/data/dal";
import { and, eq } from "drizzle-orm";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Upload a crop photo to Cloudinary.
 * Returns { success, publicId, secureUrl, conversationId } or { error }.
 */
export async function uploadCropImage(formData: FormData) {
  "use server";

  const file = formData.get("file") as File | null;
  const conversationIdRaw = formData.get("conversationId");
  const conversationId = conversationIdRaw ? Number(conversationIdRaw) : NaN;

  if (!file || !conversationId || Number.isNaN(conversationId)) {
    return { error: "Missing file or conversation ID" };
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

  // Upload to Cloudinary
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResult = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "image",
            folder: "farmhackai/crops",
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

    return {
      success: true,
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      conversationId,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return { error: "Upload failed. Please try again." };
  }
}
