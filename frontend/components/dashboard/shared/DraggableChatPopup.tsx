"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const POPUP_POS_KEY = "shuroqx_chat_popup_pos";

const CARD_MAX_W = 420;
const CARD_MAX_H = 560;

interface DraggableChatPopupProps {
  header: ReactNode;
  children: ReactNode;
}

/**
 * Floating chat popup shell. The header acts as the drag handle (pointer
 * capture, synchronous compositor-only transform), position is clamped to
 * the viewport and remembered across sessions.
 *
 * The whole popup is rendered through a portal into document.body so that
 * `position: fixed` is always relative to the real viewport. When fixed
 * elements stay inside the page tree, any transformed/animated ancestor
 * (page transition wrappers, etc.) silently rebases their coordinates and
 * the clamping math goes wrong - which let the chat box be pushed off
 * screen even though the numbers looked correct. The portal removes that
 * whole class of bugs.
 *
 * The wrapper is ALWAYS anchored at top-left (0,0) and moved purely with an
 * absolute viewport transform. This keeps dragging jump-free and avoids the
 * layout reflow that happened when toggling between a bottom-right anchor
 * and a transformed top-left anchor mid-interaction.
 */
export function DraggableChatPopup({ header, children }: DraggableChatPopupProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POPUP_POS_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (typeof saved?.x === "number" && typeof saved?.y === "number") return saved;
    } catch {}
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<{ x: number; y: number } | null>(pos);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    width: number;
    height: number;
  } | null>(null);

  function viewportSize() {
    // clientWidth/Height exclude the scrollbar, so these are the real,
    // visible dimensions the popup must stay inside.
    return {
      vw: Math.max(document.documentElement.clientWidth, 1),
      vh: Math.max(document.documentElement.clientHeight, 1),
    };
  }

  function applyTransform(x: number, y: number) {
    const el = wrapRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  // Keep coordinates fully inside the viewport (popup width/height from its
  // current layout, so it also survives viewport changes between sessions).
  // Fall back to sensible sizes when the element hasn't been measured yet.
  function getSize() {
    const el = wrapRef.current;
    const r = el?.getBoundingClientRect();
    const w = r && r.width > 0 ? r.width : CARD_MAX_W;
    const h = r && r.height > 0 ? r.height : CARD_MAX_H;
    return { w, h };
  }

  function clampToViewport(next: { x: number; y: number }) {
    const { w, h } = getSize();
    const { vw, vh } = viewportSize();
    // Clamp the popup dimensions themselves first so a bogus measurement
    // can never widen the allowed range beyond the screen.
    const maxX = Math.max(vw - Math.min(w, vw), 0);
    const maxY = Math.max(vh - Math.min(h, vh), 0);
    return {
      x: Math.min(Math.max(next.x, 0), maxX),
      y: Math.min(Math.max(next.y, 0), maxY),
    };
  }

  // Before the first paint, position the popup. If a saved position exists we
  // honour it but ALWAYS clamp it to the current viewport so a position from a
  // larger/older window can never push the popup off-screen. With no saved
  // position we rest it at the bottom-right. The wrapper is always at top-left
  // (0,0); we only translate, so there is no base-position mismatch.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const place = () => {
      const { w, h } = getSize();
      const { vw, vh } = viewportSize();
      const target =
        posRef.current ?? {
          x: Math.round(vw - Math.min(w, vw) - 16),
          y: Math.round(vh - Math.min(h, vh) - 16),
        };
      const next = clampToViewport(target);
      posRef.current = next;
      setPos(next);
    };
    if (el.getBoundingClientRect().width > 0) place();
    else requestAnimationFrame(place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the popup fully on-screen if the viewport shrinks while positioned.
  useEffect(() => {
    if (!pos) return;
    const onResize = () => {
      const live = posRef.current ?? pos;
      const next = clampToViewport(live);
      if (next.x !== live.x || next.y !== live.y) {
        posRef.current = next;
        setPos(next);
        applyTransform(next.x, next.y);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  function handleHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const wrapper = wrapRef.current;
    if (!wrapper || e.button !== 0) return;
    const rect = wrapper.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }

  // Transform is written synchronously per pointermove (pointer events already
  // arrive at display rate), so no frame is ever dropped and the final release
  // position always matches the pointer — no snap-back. The position is clamped
  // to the popup's live measured size every move so it can never leave the screen.
  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    const el = wrapRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const w = r.width > 0 ? r.width : d.width;
    const h = r.height > 0 ? r.height : d.height;
    const { vw, vh } = viewportSize();
    const maxX = Math.max(vw - Math.min(w, vw), 0);
    const maxY = Math.max(vh - Math.min(h, vh), 0);
    const x = Math.min(Math.max(d.origX + (e.clientX - d.startX), 0), maxX);
    const y = Math.min(Math.max(d.origY + (e.clientY - d.startY), 0), maxY);
    posRef.current = { x, y };
    applyTransform(x, y);
  }

  function handleHeaderPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const final = posRef.current;
    if (final) {
      const clamped = clampToViewport(final);
      posRef.current = clamped;
      setPos(clamped);
      applyTransform(clamped.x, clamped.y);
      try {
        localStorage.setItem(POPUP_POS_KEY, JSON.stringify(clamped));
      } catch {}
    }
  }

  const popup = (
    <div
      ref={wrapRef}
      className="fixed left-0 top-0 z-50 overflow-hidden"
      style={{
        transform:
          pos != null ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : undefined,
        // Promote to its own layer and suppress transitions so the drag tracks
        // the pointer 1:1 instead of animating toward it.
        willChange: "transform",
        transition: "none",
      }}
    >
      <div className="w-[calc(100vw-2rem)] max-w-[420px] h-[560px] max-h-[85vh] flex flex-col overflow-hidden rounded-3xl bg-surface-container-lowest shadow-[0_24px_80px_-12px_rgba(0,0,0,0.45),0_8px_24px_-8px_rgba(0,0,0,0.3)] ring-1 ring-inset ring-black/[0.05]">
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerEnd}
          onPointerCancel={handleHeaderPointerEnd}
          className={`relative flex-shrink-0 overflow-hidden touch-none select-none cursor-grab ${
            dragging ? "cursor-grabbing" : ""
          }`}
        >
          {header}
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest">{children}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(popup, document.body);
}