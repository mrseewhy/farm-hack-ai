import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
