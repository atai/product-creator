import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Domain logic and API handlers live in the shared workspace package (TypeScript sources)
  transpilePackages: ['@pc/core'],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Treat these packages as external (not bundled) for Prisma WASM support
  serverExternalPackages: ['@prisma/internals', '@prisma/prisma-schema-wasm'],
  // Webpack configuration (fallback when not using turbopack)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Configure WASM support for webpack
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
    }
    return config;
  },
};

export default nextConfig;
