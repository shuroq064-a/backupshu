import type { WorkerService } from "@/types";

export function SkillBadges({
  services,
  dark = false,
}: {
  services?: WorkerService[];
  dark?: boolean;
}) {
  if (!services?.length) {
    return (
      <span className={dark ? "text-xs text-gray-500" : "text-xs text-gray-400"}>
        No skills submitted
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {services.map((service) => {
        const verified = service.status === "verified";
        const cls = verified
          ? dark
            ? "bg-green-500/10 text-green-300 border-green-700/50"
            : "bg-green-50 text-green-700 border-green-200"
          : dark
          ? "bg-gray-800 text-gray-400 border-gray-700"
          : "bg-gray-100 text-gray-500 border-gray-200";

        return (
          <span
            key={service.service_id}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
          >
            {service.service_name}
            {!verified && <span className="font-semibold">Pending</span>}
          </span>
        );
      })}
    </div>
  );
}
