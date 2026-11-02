import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le CRM est entièrement dynamique (données par organisation et par session) :
  // on reste sur le modèle de rendu dynamique classique.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
