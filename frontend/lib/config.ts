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
