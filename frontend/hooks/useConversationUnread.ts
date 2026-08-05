"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messageApi } from "@/lib/api";

/**
 * Tracks per-booking unread chat counts for the current user by polling the
 * conversations endpoint (8s, paused while the tab is hidden). Opening a
 * thread marks messages read server-side, so a stale badge can be cleared
 * immediately with `clearBooking`.
 */
export function useConversationUnread(callerRole: "client" | "worker") {
  const [unreadByBooking, setUnreadByBooking] = useState<Record<string, number>>({});
  const roleRef = useRef(callerRole);
  roleRef.current = callerRole;

  const refresh = useCallback(async () => {
    try {
      const list = await messageApi.conversations();
      const map: Record<string, number> = {};
      for (const c of list) {
        if (c.callerRole !== roleRef.current) continue;
        if (c.unread > 0) map[c.bookingId] = c.unread;
      }
      setUnreadByBooking(map);
    } catch {}
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const clearBooking = useCallback((bookingId: string) => {
    setUnreadByBooking((prev) => {
      if (!prev[bookingId]) return prev;
      const next = { ...prev };
      delete next[bookingId];
      return next;
    });
  }, []);

  return { unreadByBooking, clearBooking };
}
