import { ProgressCard, type Step } from "@/components/blocks/card-progress/progress-card";
import type { BookingDetail } from "@/types";

const LIFECYCLE: { key: string; title: string }[] = [
  { key: "upcoming", title: "Requested" },
  { key: "accepted", title: "Accepted" },
  { key: "started", title: "On the Way" },
  { key: "reached", title: "Arrived" },
  { key: "ongoing", title: "Working" },
  { key: "completed", title: "Completed" },
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
      { id: "req", title: "Requested", status: "complete" },
      { id: "end", title: status === "cancelled" ? "Cancelled" : "Rejected", status: "error" },
    ];
    return <ProgressCard steps={steps} />;
  }

  const curIdx = ORDER.indexOf(status);
  const steps: Step[] = LIFECYCLE.map((s, i) => ({
    id: s.key,
    title: s.title,
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
