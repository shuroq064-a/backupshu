"use client";

import { Toaster as SonnerToaster } from "sonner";

// App-wide toast viewport, themed to match ShuroqX (teal primary, rounded,
// Material-style). Imported once in the root layout so any screen can fire a
// notification via the `notify()` helper without mounting its own Toast.
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors
      expand
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-outline-variant !bg-surface-container-lowest !text-on-surface !shadow-lg !transition-all",
          title: "!text-on-surface !font-semibold",
          description: "!text-on-surface-variant",
          actionButton: "!bg-primary !text-on-primary",
          cancelButton: "!bg-surface-container !text-on-surface",
          closeButton: "!bg-surface-container !text-on-surface-variant !border-outline-variant",
        },
      }}
    />
  );
}
