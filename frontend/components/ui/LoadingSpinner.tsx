interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark" | "violet";
  fullScreen?: boolean;
  label?: string;
}

const sizes = {
  sm: "w-4 h-4 border-2",
  md: "w-8 h-8 border-2",
  lg: "w-12 h-12 border-3",
};

const variants = {
  light: "border-white/30 border-t-white",
  dark: "border-gray-700 border-t-gray-300",
  violet: "border-violet-200 border-t-violet-600",
};

export function LoadingSpinner({
  size = "md",
  variant = "violet",
  fullScreen = false,
  label,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${sizes[size]} ${variants[variant]} rounded-full animate-spin`}
      />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}