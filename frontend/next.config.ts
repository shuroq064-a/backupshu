import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_URL must be set for production builds");
}

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8001";

// In dev the frontend talks to the backend over http/ws on localhost:8001
// (the REST API is proxied same-origin via /api/backend, but the live
// booking WebSocket connects directly), so CSP must allow those origins.
const isProd = process.env.NODE_ENV === "production";
const devConnectSrc = isProd
  ? ""
  : " http://localhost:8001 ws://localhost:8001";
// Next.js dev Fast Refresh (react-refresh) evaluates code at runtime, so
// 'unsafe-eval' is required in script-src during development only.
const devScriptSrc = isProd ? "" : " 'unsafe-eval'";
// upgrade-insecure-requests would force http://localhost -> https://, but the
// dev servers are HTTP-only, so it must be applied in production only.
const devUpgrade = isProd ? " upgrade-insecure-requests" : "";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" + devScriptSrc + "; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https: wss:" + devConnectSrc + "; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" + devUpgrade,
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  reactStrictMode: true,
};

export default nextConfig;
