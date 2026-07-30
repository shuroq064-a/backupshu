/**
 * Sanitizes a redirect URL to prevent open-redirect attacks.
 *
 * Rules:
 *  - Must start with "/" (relative path)
 *  - Must NOT start with "//" (protocol-relative)
 *  - Must NOT contain "://" (absolute URL)
 *  - Must NOT start with "javascript:" or "data:"
 *  - If all checks fail, returns the fallback ("/dashboard").
 */
export function sanitizeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || typeof raw !== "string") return fallback;

  const trimmed = raw.trim();

  // Must start with /
  if (!trimmed.startsWith("/")) return fallback;

  // Protocol-relative: //evil.com
  if (trimmed.startsWith("//")) return fallback;

  // Contains a scheme: http://, https://, javascript:, data:, etc.
  if (/^[a-zA-Z]+:/.test(trimmed)) return fallback;

  // Null bytes
  if (trimmed.includes("\0")) return fallback;

  return trimmed;
}
