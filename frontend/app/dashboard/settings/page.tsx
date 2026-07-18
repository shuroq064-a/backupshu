"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store";
import {
  SettingsRow,
  Toggle,
  useAccountActions,
  PasswordModal,
  DeleteModal,
  DangerZone,
  SettingsFooter,
  DisplaySection,
  PreferencesSection,
  SupportInfoList,
} from "@/components/settings/SettingsShared";

export default function UserSettingsPage() {
  const router = useRouter();
  const { user } = useAppSelector((s) => s.auth);

  const account = useAccountActions();

  const [notifications, setNotifications] = useState(true);
  const [twoFA, setTwoFA] = useState(true);
  const [dark, setDark] = useState(false);

  const displayName = user?.name || "User";
  const displayEmail = user?.email || "";
  const initials = displayName[0]?.toUpperCase() || "U";

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function applyTheme(isDark: boolean) {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    try {
      localStorage.setItem("shuroqx-theme", isDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 font-sans md:px-8">
      {/* ── Header ─────────────────────────── */}
      <header className="mb-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-on-surface">
              Account Settings
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Manage your profile, security, and application preferences.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-container to-primary text-xl font-extrabold text-white">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-md text-headline-md leading-none text-on-surface">
                  {displayName}
                </h3>
                <span className="flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary-fixed">
                  <span
                    className="material-symbols-outlined text-[12px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    verified
                  </span>
                  Verified
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {displayEmail}
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard/profile")}
              className="ml-4 rounded-full p-2 text-primary transition-soft hover:bg-primary-container/10"
              aria-label="Edit profile"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Account & Security + Privacy */}
        <section className="flex flex-col gap-4 lg:col-span-8">
          {/* Account & Security */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-soft hover:shadow-md">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
                <span className="material-symbols-outlined">shield</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Account &amp; Security</h4>
            </div>
            <div className="space-y-4">
              <SettingsRow
                icon="lock"
                label="Password Reset"
                sub="Change your account password"
                onClick={() => account.setShowPw(true)}
              />
              <SettingsRow
                icon="vibration"
                label="Two-Factor Authentication"
                sub={twoFA ? "Enabled • Phone ending in 82" : "Disabled"}
                subClass={twoFA ? "text-tertiary font-bold" : ""}
                onClick={() => setTwoFA((v) => !v)}
                trailing={
                  <Toggle checked={twoFA} onChange={setTwoFA} />
                }
              />
              <SettingsRow
                icon="devices"
                label="Authorized Devices"
                sub="3 devices currently active"
                onClick={() => router.push("/dashboard/settings/privacy")}
              />
            </div>
          </div>

          {/* Privacy & Data */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-soft hover:shadow-md">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-secondary-container/10 p-2 text-secondary">
                <span className="material-symbols-outlined">visibility_off</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Privacy &amp; Data</h4>
            </div>
            <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
              Manage how your data is used and who can see your profile details.
            </p>
            <button
              onClick={() => router.push("/dashboard/settings/privacy")}
              className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
            >
              Explore Privacy Center
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </button>
          </div>

          {/* Session Management (compact, under Privacy & Data) */}
          <DangerZone
            onLogout={account.handleLogout}
            onRequestDelete={() => account.setShowDeleteConfirm(true)}
          />
        </section>

        {/* Right: Display / Preferences / Support */}
        <aside className="flex flex-col gap-4 lg:col-span-4">
          {/* Display */}
          <DisplaySection dark={dark} setDark={setDark} applyTheme={applyTheme} />

          {/* Preferences */}
          <PreferencesSection
            notifications={notifications}
            setNotifications={setNotifications}
          />

          {/* Support & Info */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-on-surface-variant/10 p-2 text-on-surface-variant">
                <span className="material-symbols-outlined">info</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Support &amp; Info</h4>
            </div>
            <SupportInfoList router={router} />
          </div>
        </aside>
      </div>

      <SettingsFooter />

      {/* ── Modals ─────────────────────────── */}
      <PasswordModal
        open={account.showPw}
        onClose={() => {
          account.setShowPw(false);
          account.setPwError(null);
          account.setPwSuccess(false);
        }}
        pw={account.pw}
        setPw={account.setPw}
        onSubmit={account.handleChangePassword}
        saving={account.pwSaving}
        error={account.pwError}
        success={account.pwSuccess}
      />

      <DeleteModal
        open={account.showDeleteConfirm}
        onConfirm={account.handleDeleteConfirm}
        onCancel={() => {
          account.setShowDeleteConfirm(false);
          account.setDeleteError(null);
        }}
        deleting={account.isDeleting}
        error={account.deleteError}
      />
    </div>
  );
}
