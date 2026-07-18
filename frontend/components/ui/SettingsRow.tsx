"use client";

import { Toggle } from "./Toggle";

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  // Right side options — pick one
  type?: "arrow" | "toggle" | "value";
  value?: boolean | string;
  onToggle?: (v: boolean) => void;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  bordered?: boolean;
}

export function SettingsRow({
  icon,
  label,
  subtitle,
  type = "arrow",
  value,
  onToggle,
  onClick,
  danger = false,
  disabled = false,
  bordered = true,
}: SettingsRowProps) {
  const isClickable = type === "arrow" || (type === "value" && onClick);

  return (
    <button
      onClick={isClickable && !disabled ? onClick : undefined}
      disabled={disabled}
      className={`w-full flex items-center gap-4 py-4 text-left transition-colors
        ${bordered ? "border-b border-outline-variant/60 last:border-0" : ""}
        ${isClickable && !disabled ? "hover:bg-primary/5 cursor-pointer" : "cursor-default"}
        ${disabled ? "opacity-50" : ""}
      `}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center text-xl flex-shrink-0">
        {icon}
      </div>

      {/* Label + subtitle */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-red-600" : "text-gray-800"}`}>
          {label}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right side */}
      {type === "arrow" && (
        <span className="text-gray-400 text-sm flex-shrink-0">›</span>
      )}
      {type === "toggle" && onToggle && (
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            value={value as boolean}
            onChange={onToggle}
            disabled={disabled}
          />
        </div>
      )}
      {type === "value" && typeof value === "string" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm text-gray-400">{value}</span>
          {onClick && <span className="text-gray-400 text-sm">›</span>}
        </div>
      )}
    </button>
  );
}