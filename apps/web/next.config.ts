import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cardscanner/db"],
};

export default nextConfig;
