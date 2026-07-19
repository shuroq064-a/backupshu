"use client";

import { toast } from "sonner";

type NotifyType = "success" | "error" | "info" | "warning";

const ICONS: Record<NotifyType, string> = {
  success: "",
  error: "",
  info: "",
  warning: "",
};

// App-wide notification helper. Drop-in replacement for the old per-page
// showToast — no provider/dismiss wiring needed.
//
//   notify("Availability turned ON! You are listed for client bookings.")
//   notify.error("Could not reach the server.")
//   notify.info("Tracking your specialist…")
export function notify(message: string, type: NotifyType = "info") {
  const text = message;
  switch (type) {
    case "success":
      return toast.success(text);
    case "error":
      return toast.error(text);
    case "warning":
      return toast.warning(text);
    default:
      return toast(text);
  }
}

notify.success = (message: string) => notify(message, "success");
notify.error = (message: string) => notify(message, "error");
notify.info = (message: string) => notify(message, "info");
notify.warning = (message: string) => notify(message, "warning");
