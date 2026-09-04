import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The user's home directory is a broader Git worktree with its own lockfile.
  // Keep Turbopack scoped to this actual Next.js application.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
