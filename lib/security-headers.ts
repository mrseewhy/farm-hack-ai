/**
 * Production security headers.
 *
 * Kept dependency-free and separate from `next.config.ts` so the policy can be
 * unit-tested. The policy is deliberately origin-locked: scripts and styles
 * come from this app, images from this app and Cloudinary (crop photos), and
 * frames are refused.
 *
 * Known trade-off: Next.js injects inline bootstrap scripts, and the theme
 * initialiser in `app/layout.tsx` is inline, so `script-src` allows
 * `'unsafe-inline'`. A nonce-based policy would remove that allowance, but it
 * requires threading a per-request nonce through the proxy and every inline
 * script. That remains a documented hardening step rather than a claim of a
 * strict CSP.
 */

export type SecurityHeader = { key: string; value: string };

export function contentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // Next.js and the theme initialiser need inline scripts. Development also
    // needs eval for the Turbopack runtime.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind and component styles are injected as inline style tags.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    // Dev needs the websocket for hot reload; production stays same-origin.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' https://res.cloudinary.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // Only meaningful over HTTPS, and it would break plain-HTTP local dev.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

export function securityHeaders(
  isDev: boolean = process.env.NODE_ENV !== "production"
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];

  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
