"use client";

import { useEffect, useState } from "react";
import { notify } from "@/lib/notify";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const STYLES: Record<ToastType, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  info:    "bg-violet-50 border-violet-200 text-violet-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] animate-fade-in-up">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg max-w-sm ml-auto ${STYLES[toast.type]}`}
      >
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

// Helper hook — routes through the global sonner <Toaster> mounted in the
// root layout, so every page gets a single consistent notification surface.
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  function showToast(message: string, type: ToastType = "info") {
    if (type === "success") notify.success(message);
    else if (type === "error") notify.error(message);
    else if (type === "warning") notify.warning(message);
    else notify.info(message);
    // Keep local state in sync for any page that still inspects `toast`.
    setToast({ id: Date.now().toString(), message, type });
  }

  function dismiss() {
    setToast(null);
  }

  return { toast, showToast, dismiss };
}
