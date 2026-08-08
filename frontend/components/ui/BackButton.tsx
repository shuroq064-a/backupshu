"use client";

import { useRouter } from "next/navigation";

/**
 * Back/Close affordance for pages without one. Goes back in history when
 * possible, otherwise falls back to a default destination.
 */
export default function BackButton({
  label = "Back",
  fallback = "/dashboard",
  className = "",
}: {
  label?: string;
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10 ${className}`}
    >
      <span className="material-symbols-outlined text-lg">arrow_back</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
