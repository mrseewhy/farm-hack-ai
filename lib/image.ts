/**
 * Shared image sniffing helpers.
 *
 * Both the upload action and the AI pipeline receive images from sources they
 * do not fully control (a browser form field, and a remote CDN URL). Neither
 * should trust a client- or server-supplied MIME type on its own. These helpers
 * inspect the actual leading bytes so a renamed text/HTML payload cannot be
 * treated as a crop photo.
 *
 * This module has no runtime dependencies or `@/` imports so it can also be
 * exercised by the dependency-free Node test runner.
 */

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

/**
 * An image that is too small to be a real crop photo is almost always an empty
 * body, a truncated download, or an error page. A 1x1 pixel PNG is only ~68
 * bytes, so this is intentionally low — it exists to reject obviously useless
 * payloads, not to judge photographic quality.
 */
export const MIN_IMAGE_BYTES = 128;

/**
 * Sniff the image type from its magic bytes. Returns null when the leading
 * bytes do not match a supported format.
 */
export function sniffImageMimeType(bytes: Uint8Array): ImageMimeType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }

  return null;
}

/** True when the leading bytes match a supported image format. */
export function looksLikeImage(bytes: Uint8Array): boolean {
  return sniffImageMimeType(bytes) !== null;
}

/**
 * Decide whether a `Content-Type` header is an image type. Some CDNs return
 * `image/jpeg; charset=...`, so only the media type before `;` is compared.
 */
export function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(";")[0].trim().toLowerCase().startsWith("image/");
}
