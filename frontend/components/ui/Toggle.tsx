"use client";

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}

export function Toggle({
  value,
  onChange,
  disabled = false,
  size = "md",
  label,
}: ToggleProps) {
  const sizes = {
    sm: { track: "w-8 h-4", thumb: "w-3 h-3", translate: "translate-x-4" },
    md: { track: "w-11 h-6", thumb: "w-5 h-5", translate: "translate-x-5" },
  };
  const s = sizes[size];

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      {label && <span className="text-sm text-gray-700">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative ${s.track} rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          value ? "bg-primary" : "bg-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 ${s.thumb} bg-white rounded-full shadow-sm transition-transform duration-200 ${
            value ? s.translate : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}