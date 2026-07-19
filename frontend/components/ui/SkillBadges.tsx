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
            ? "bg-primary-container/20 text-on-primary-container border-primary-container/40"
            : "bg-primary/10 text-primary border-primary/30"
          : dark
            ? "bg-surface-container-highest text-on-surface-variant border-outline-variant/50"
            : "bg-surface-container-low text-on-surface-variant border-outline-variant/60";

        return (
          <span
            key={service.service_id}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide ${cls}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                verified ? "bg-primary" : "bg-outline-variant"
              }`}
            />
            {service.service_name}
            {!verified && (
              <span className="font-bold uppercase text-[9px] opacity-70">Pending</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

