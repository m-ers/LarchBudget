import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build in .next/standalone, used by the Dockerfile.
  output: "standalone",
  cacheComponents: true,
  experimental: {
    // The import screen sends a bank file's text to a Server Action in one
    // go. Files are capped at 4 MB (src/lib/import/limits.ts); as JSON they
    // can grow somewhat, and the default limit is only 1 MB.
    serverActions: { bodySizeLimit: "8mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
