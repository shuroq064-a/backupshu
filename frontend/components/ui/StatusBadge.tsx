type Status = "pending" | "approved" | "rejected" | "ongoing" | "upcoming" | "completed" | "cancelled";

interface StatusBadgeProps {
  status: Status;
  size?: "xs" | "sm";
}

const CONFIG: Record<Status, { label: string; icon: string; className: string }> = {
  pending:   { label: "Pending",   icon: "⏳", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  icon: "✓",  className: "bg-green-100 text-green-700 border-green-200" },
  rejected:  { label: "Rejected",  icon: "✕",  className: "bg-red-100 text-red-700 border-red-200" },
  ongoing:   { label: "Ongoing",   icon: "▶",  className: "bg-blue-100 text-blue-700 border-blue-200" },
  upcoming:  { label: "Upcoming",  icon: "🕐", className: "bg-violet-100 text-violet-700 border-violet-200" },
  completed: { label: "Completed", icon: "✓",  className: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled", icon: "✕",  className: "bg-gray-100 text-gray-600 border-gray-200" },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const { label, icon, className } = CONFIG[status] || CONFIG.pending;
  const sizeClass = size === "xs" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${sizeClass} ${className}`}
    >
      <span>{icon}</span>
      {label}
    </span>
  );
}