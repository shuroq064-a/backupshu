"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed top-4 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full border-2 border-outline-variant bg-surface-container text-on-surface shadow-lg transition-all hover:scale-105 hover:border-primary hover:text-primary active:scale-95"
    >
      <span className="material-symbols-outlined text-[20px]">
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
