import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { isE2eMode } from "@/lib/e2e";

/**
 * Cloudinary access with a local-only E2E fallback.
 *
 * Production always stores crop photos in Cloudinary. Playwright cannot depend
 * on a Cloudinary account or network, so E2E_MODE (development only, see
 * `lib/e2e.ts`) writes the uploaded bytes to `public/e2e-uploads`. Deletion
 * handles both backends, which is also what the retention worker needs.
 */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const E2E_PUBLIC_ID_PREFIX = "e2e/";

export type StoredImage = {
  publicId: string;
  secureUrl: string;
};

export async function storeCropImage(
  buffer: Buffer,
  mimeType: string
): Promise<StoredImage> {
  if (isE2eMode()) {
    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const filename = `${randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), "public", "e2e-uploads");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), buffer);
    return {
      publicId: `${E2E_PUBLIC_ID_PREFIX}${filename}`,
      secureUrl: `/e2e-uploads/${filename}`,
    };
  }

  return new Promise<StoredImage>((resolve, reject) => {
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
          else {
            resolve({
              publicId: result.public_id,
              secureUrl: result.secure_url,
            });
          }
        }
      )
      .end(buffer);
  });
}

/** Best-effort deletion used by farmer deletion, E2E cleanup, and retention. */
export async function deleteStoredImage(publicId: string): Promise<void> {
  if (publicId.startsWith(E2E_PUBLIC_ID_PREFIX)) {
    const filename = publicId.slice(E2E_PUBLIC_ID_PREFIX.length);
    const filePath = path.join(
      process.cwd(),
      "public",
      "e2e-uploads",
      path.basename(filename)
    );
    try {
      await unlink(filePath);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT") throw error;
    }
    return;
  }

  await cloudinary.uploader.destroy(publicId);
}
