"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

const STYLES: Record<ToastType, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  info:    "bg-violet-50 border-violet-200 text-violet-800",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 duration-300">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg max-w-sm ${STYLES[toast.type]}`}
      >
        <span className="text-lg flex-shrink-0">{ICONS[toast.type]}</span>
        <p className="text-sm font-medium flex-1">{toast.message}</p>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 ml-1 flex-shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Helper hook
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  function showToast(message: string, type: ToastType = "info") {
    setToast({ id: Date.now().toString(), message, type });
  }

  function dismiss() {
    setToast(null);
  }

  return { toast, showToast, dismiss };
}