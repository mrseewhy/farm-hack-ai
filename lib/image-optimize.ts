import sharp, { type Metadata } from "sharp";

/**
 * Pre-model image normalisation.
 *
 * Cloudinary already stores a browser-friendly derivative, but the AI pipeline
 * was fetching and forwarding the original asset. That wastes tokens, latency,
 * and provider quota on multi-megapixel phone photos. This module:
 *   - rejects images too small or too distorted to inspect;
 *   - auto-rotates using EXIF orientation;
 *   - downsizes the long edge to 1280 px without enlargement;
 *   - re-encodes as JPEG, stripping location/device metadata.
 *
 * The output is always JPEG, one of the formats Gemini accepts. Callers should
 * treat a failure here as an image-attachment failure, not send original bytes.
 */

export const MODEL_IMAGE_MAX_DIMENSION = 1280;
export const MODEL_IMAGE_JPEG_QUALITY = 82;
export const MODEL_IMAGE_MIN_PIXELS = 10_000; // ~100 x 100
export const MODEL_IMAGE_MAX_ASPECT_RATIO = 8;

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
  /** True when dimensions, format, or byte size changed. */
  optimized: boolean;
};

export class ImageQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageQualityError";
  }
}

export async function optimizeImageForModel(
  input: Buffer
): Promise<OptimizedImage> {
  if (input.byteLength === 0) {
    throw new ImageQualityError("Image is empty");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new ImageQualityError("Image could not be decoded");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new ImageQualityError("Image dimensions are missing");
  }
  if (width * height < MODEL_IMAGE_MIN_PIXELS) {
    throw new ImageQualityError(
      "Image is too small to inspect; please upload a larger photo"
    );
  }

  const aspectRatio = Math.max(width / height, height / width);
  if (!Number.isFinite(aspectRatio) || aspectRatio > MODEL_IMAGE_MAX_ASPECT_RATIO) {
    throw new ImageQualityError(
      "Image has an unusable shape; please upload a normal crop photo"
    );
  }

  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: MODEL_IMAGE_MAX_DIMENSION,
      height: MODEL_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: MODEL_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const resized =
    info.width !== width ||
    info.height !== height ||
    metadata.format !== "jpeg" ||
    data.byteLength !== input.byteLength;

  return {
    buffer: data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
    originalBytes: input.byteLength,
    optimizedBytes: data.byteLength,
    optimized: resized,
  };
}
