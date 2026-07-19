import { ProgressCard, type Step } from "@/components/blocks/card-progress/progress-card";
import type { BookingDetail } from "@/types";

const LIFECYCLE: { key: string; title: string; description: string }[] = [
  { key: "upcoming", title: "Requested", description: "Client requested the service" },
  { key: "accepted", title: "Accepted", description: "You accepted the job" },
  { key: "started", title: "On the Way", description: "Heading to the location" },
  { key: "reached", title: "Arrived", description: "Reached the client" },
  { key: "ongoing", title: "Working", description: "Service in progress" },
  { key: "completed", title: "Completed", description: "Job finished" },
];

const ORDER = ["upcoming", "accepted", "started", "reached", "ongoing", "completed"];

/**
 * Wraps the @roiui card-progress (shadcn) ProgressCard and feeds it the booking
 * lifecycle as steps. Only used on Active Jobs (not incoming requests).
 */
export function BookingProgressCard({ booking }: { booking: BookingDetail }) {
  const status = booking.status;

  if (status === "cancelled" || status === "rejected") {
    const steps: Step[] = [
      { id: "req", title: "Requested", description: "Client requested the service", status: "complete" },
      { id: "end", title: status === "cancelled" ? "Cancelled" : "Rejected", description: "Booking did not proceed", status: "error" },
    ];
    return <ProgressCard steps={steps} />;
  }

  const curIdx = ORDER.indexOf(status);
  const steps: Step[] = LIFECYCLE.map((s, i) => ({
    id: s.key,
    title: s.title,
    description: s.description,
    status:
      curIdx < 0
        ? "pending"
        : i < curIdx
        ? "complete"
        : i === curIdx
        ? "in_progress"
        : "pending",
  }));

  return <ProgressCard steps={steps} />;
}
