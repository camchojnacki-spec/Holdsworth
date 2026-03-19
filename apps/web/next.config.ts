import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@holdsworth/db"],
  serverActions: {
    bodySizeLimit: "20mb",
  },
};

export default nextConfig;
