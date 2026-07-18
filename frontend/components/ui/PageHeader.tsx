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
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-primary transition-colors"
            aria-label="Go back"
          >
            ←
          </button>
        )}
        <h1 className="text-xl font-bold text-on-surface">{title}</h1>
      </div>

      {showBell && (
        <button
          onClick={onBellClick}
          className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-primary transition-colors"
          aria-label="Notifications"
        >
          🔔
        </button>
      )}
    </div>
  );
}