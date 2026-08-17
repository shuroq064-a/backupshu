const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
const rawWsBaseUrl = process.env.NEXT_PUBLIC_WS_URL;

function publicUrl(name: string, value: string | undefined, localFallback: string) {
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set for production builds`);
  }

  return (value || localFallback).replace(/\/+$/, "");
}

function websocketUrl(value: string | undefined, apiUrl: string) {
  if (value) return value.replace(/\/+$/, "");

  if (apiUrl.startsWith("https://")) {
    return apiUrl.replace(/^https:\/\//, "wss://");
  }

  if (apiUrl.startsWith("http://")) {
    return apiUrl.replace(/^http:\/\//, "ws://");
  }

  return "ws://localhost:8000";
}

export const API_BASE_URL = publicUrl(
  "NEXT_PUBLIC_API_URL",
  rawApiBaseUrl,
  "http://localhost:8001"
);

export const WS_BASE_URL = websocketUrl(rawWsBaseUrl, API_BASE_URL);

// Streaming (SSE) base URL. The Next.js dev rewrite proxy (/api/backend) buffers
// response bodies, which collapses token-by-token SSE into one final flush. For
// the assistant chat stream we bypass the proxy and hit the backend directly.
// CORS (backend CORS_ORIGINS) and the dev CSP (connect-src http://localhost:8001)
// already permit this. Override with NEXT_PUBLIC_STREAM_URL if needed.
const rawStreamUrl = process.env.NEXT_PUBLIC_STREAM_URL;
export const STREAM_BASE_URL = (
  rawStreamUrl ||
  (API_BASE_URL.includes("/api/backend") ? "http://localhost:8001" : API_BASE_URL)
).replace(/\/+$/, "");
