import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Experimental features for WASM support
  // This tells Next.js to treat these packages as external and not bundle them
  experimental: {
    serverComponentsExternalPackages: ['@prisma/internals', '@prisma/prisma-schema-wasm'],
  },
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
