import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useCache: true,
    ppr: true,
    cacheComponents: true,
  },
};

export default nextConfig;
