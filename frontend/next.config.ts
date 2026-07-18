import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_URL must be set for production builds");
}

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Allow images from any hostname (lock down in production)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },

  // Proxy /api calls to FastAPI during development
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },

  // Strict mode
  reactStrictMode: true,
};

export default nextConfig;
