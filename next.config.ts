import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Playwright and other local tools reach the dev server over loopback. This
  // option only affects development; production builds ignore it.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    // Crop photos are stored on Cloudinary. next/image will only optimize
    // remote URLs explicitly listed here, which keeps the optimizer from being
    // used as an open image proxy.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    // CSP, HSTS, framing, referrer, and permissions policy. See
    // lib/security-headers.ts for the policy and its documented trade-offs.
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(process.env.NODE_ENV !== "production"),
      },
    ];
  },
  experimental: {
    serverActions: {
      // Crop photos are allowed up to 10MB in the upload UI and server action,
      // but Next limits server action request bodies to 1MB by default. Leave
      // headroom for multipart boundaries and field metadata.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
