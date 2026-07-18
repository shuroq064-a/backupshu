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

/** Get auth token synchronously (for API interceptor) */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed.token || null;
  } catch {
    return null;
  }
}