"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const POPUP_POS_KEY = "shuroqx_chat_popup_pos";
const POPUP_W = 420;
const POPUP_H = 560;

interface DraggableChatPopupProps {
  header: ReactNode;
  children: ReactNode;
}

/**
 * Floating chat popup shell. The header acts as the drag handle (pointer
 * capture, synchronous compositor-only transform), position is clamped to
 * the viewport and remembered across sessions. Fixed, generously sized.
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
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    width: number;
    height: number;
  } | null>(null);

  function applyTransform(x: number, y: number) {
    const el = wrapRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  // Keep coordinates fully inside the viewport (popup width/height from its
  // current layout, so it also survives viewport changes between sessions).
  function clampToViewport(next: { x: number; y: number }) {
    const el = wrapRef.current;
    if (!el) return next;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max(next.x, 0), Math.max(window.innerWidth - r.width, 0)),
      y: Math.min(Math.max(next.y, 0), Math.max(window.innerHeight - r.height, 0)),
    };
  }

  // The wrapper is always anchored at left/top 0 and moved with an absolute
  // viewport transform, so dragging is jump-free. When no position was saved,
  // measure the element's natural bottom-right spot once and commit it as the
  // starting position before the first paint.
  useLayoutEffect(() => {
    if (posRef.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = clampToViewport({ x: Math.round(r.left), y: Math.round(r.top) });
    posRef.current = next;
    setPos(next);
  }, []);

  // Keep the popup fully on-screen if the viewport shrinks while positioned,
  // and clamp the restored position once on mount (a saved spot may come from
  // a larger viewport or a stale value).
  useEffect(() => {
    if (!pos) return;
    const onResize = () => {
      const next = clampToViewport(pos);
      if (next.x !== pos.x || next.y !== pos.y) {
        posRef.current = next;
        setPos(next);
        applyTransform(next.x, next.y);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  function handleHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const wrapper = wrapRef.current;
    if (!wrapper) return;
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
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  // Transform is written synchronously per pointermove (pointer events already
  // arrive at display rate), so no frame is ever dropped and the final release
  // position always matches the pointer — no snap-back.
  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(
      Math.max(d.origX + (e.clientX - d.startX), 0),
      Math.max(window.innerWidth - d.width, 0),
    );
    const y = Math.min(
      Math.max(d.origY + (e.clientY - d.startY), 0),
      Math.max(window.innerHeight - d.height, 0),
    );
    const next = { x, y };
    dragPosRef.current = next;
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
    const final = dragPosRef.current;
    dragPosRef.current = null;
    if (final) {
      posRef.current = final;
      setPos(final);
      try {
        localStorage.setItem(POPUP_POS_KEY, JSON.stringify(final));
      } catch {}
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`fixed z-50 ${pos ? "left-0 top-0" : "bottom-4 right-4 sm:bottom-6 sm:right-6"}`}
      style={
        pos
          ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, willChange: "transform" }
          : undefined
      }
    >
      <div className="w-[calc(100vw-2rem)] max-w-[420px] h-[560px] max-h-[85vh] flex flex-col overflow-hidden rounded-3xl bg-surface-container-lowest shadow-[0_24px_80px_-12px_rgba(0,0,0,0.45),0_8px_24px_-8px_rgba(0,0,0,0.3)] ring-1 ring-inset ring-black/[0.05] animate-pop-in">
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
}