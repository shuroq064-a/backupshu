import type { Session } from "@/types";

const SESSION_KEY = "shuroqx_session";

/** Persist session to localStorage */
export function persistSession(session: Session): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable — silently ignore
  }
}

/** Load session from localStorage */
export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    // Basic validation
    if (!parsed.user?.id || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear session from localStorage */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Per-tab token cache, updated from the Redux auth state (see store/index.ts).
 *
 * Why this exists: the token used to be re-read from the single shared
 * localStorage key on every API call, while the UI identity lived in Redux.
 * On a machine with multiple accounts (shared browser, parallel testing),
 * a stale tab would authenticate requests with whichever session was most
 * recently written to localStorage — so bookings created from that tab got
 * stamped with ANOTHER account's client_id while carrying this tab's user
 * details. The cache keeps API calls tied to the tab's own session.
 *
 * The cache is empty on a fresh page load, so getToken() falls back to the
 * persisted session (which hydration then adopts) — behavior is unchanged
 * for the single-tab case.
 */
let cachedToken: string | null | undefined = undefined;

export function setCachedToken(token: string | null): void {
  cachedToken = token;
}

/** Get auth token synchronously (for API interceptor) */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  if (cachedToken !== undefined) return cachedToken;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed.token || null;
  } catch {
    return null;
  }
}