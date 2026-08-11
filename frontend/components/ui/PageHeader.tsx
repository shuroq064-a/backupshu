"use client";

import { useRouter } from "next/navigation";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  backHref?: string;
  showBell?: boolean;
  onBellClick?: () => void;
}

export function PageHeader({
  title,
  showBack = true,
  backHref,
  showBell = true,
  onBellClick,
}: PageHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <button
            onClick={handleBack}
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-primary transition-colors shrink-0"
            aria-label="Go back"
          >
            ←
          </button>
        )}
        <h1 className="text-lg sm:text-xl font-bold text-on-surface truncate">{title}</h1>
      </div>

      {showBell && (
        <button
          onClick={onBellClick}
          className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-primary transition-colors shrink-0"
          aria-label="Notifications"
        >
          🔔
        </button>
      )}
    </div>
  );
}