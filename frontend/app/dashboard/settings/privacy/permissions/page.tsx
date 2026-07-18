"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/components/ui";

// ── Permission definitions ────────────────────
const INITIAL_PERMISSIONS = [
  {
    id: "location",
    icon: "location_on",
    label: "Location Access",
    subtitle: "Improve results based on your location.",
    enabled: true,
  },
  {
    id: "notifications",
    icon: "notifications",
    label: "Notification Alerts",
    subtitle: "Get important updates and reminders.",
    enabled: true,
  },
  {
    id: "analytics",
    icon: "insights",
    label: "Usage Analytics",
    subtitle: "Help us improve the app's performance.",
    enabled: false,
  },
  {
    id: "contacts",
    icon: "contacts",
    label: "Contacts Access",
    subtitle: "Seamlessly reach out to your saved contacts.",
    enabled: false,
  },
  {
    id: "microphone",
    icon: "mic",
    label: "Microphone",
    subtitle: "Enable speech recognition features.",
    enabled: true,
  },
  {
    id: "background",
    icon: "autorenew",
    label: "Background App Refresh",
    subtitle: "Allow app to refresh data in the background.",
    enabled: false,
  },
  {
    id: "camera",
    icon: "photo_camera",
    label: "Camera",
    subtitle: "Allow access to your camera.",
    enabled: false,
  },
  {
    id: "files",
    icon: "folder",
    label: "Files",
    subtitle: "Access your files for easy uploads.",
    enabled: true,
  },
];

export default function PermissionsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState(INITIAL_PERMISSIONS);

  function togglePermission(id: string) {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 font-sans md:px-8">
      {/* ── Header ─────────────────────────── */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">
            Permissions
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Control what ShuroqX can access on your device.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/settings/privacy")}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Privacy
        </button>
      </header>

      {/* ── Info banner ─────────────────────── */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <span className="material-symbols-outlined text-primary">shield</span>
        <p className="font-body-md text-body-md text-on-surface-variant">
          You have full control over what we can access. Toggle any permission
          on or off at any time — your privacy is always yours.
        </p>
      </div>

      {/* ── Permission rows ─────────────────── */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-sm">
        {permissions.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-4 rounded-lg px-4 py-3.5 transition-soft hover:bg-surface-container-low"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                <span className="material-symbols-outlined">{p.icon}</span>
              </div>
              <div>
                <p className="font-label-md text-label-md">{p.label}</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">{p.subtitle}</p>
              </div>
            </div>
            <Toggle value={p.enabled} onChange={() => togglePermission(p.id)} />
          </div>
        ))}
      </div>

      {/* ── Footer note ─────────────────────── */}
      <p className="mt-6 text-center text-xs text-on-surface-variant">
        We value your privacy.{" "}
        <a href="#" className="font-medium text-primary hover:underline">
          Learn more in our Privacy Policy
        </a>
      </p>
    </div>
  );
}
