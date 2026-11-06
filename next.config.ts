import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
