import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Turbopack's on-disk cache was serving a stale globals.css after edits (the CSS goes through the Tailwind
    // loader rule below), so a warm build could ship old styles. Vercel restores .next/cache between deploys,
    // so build and dev both compile CSS fresh every time instead.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
  cacheComponents: true,
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
