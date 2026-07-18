"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store";
import { workerApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
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

export default function SpecialistSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, specialistProfile } = useAppSelector((s) => s.auth);

  const account = useAccountActions();

  const [notifications, setNotifications] = useState(true);
  const [twoFA, setTwoFA] = useState(true);
  const [dark, setDark] = useState(false);
  const [available, setAvailable] = useState(false);
  const [availSaving, setAvailSaving] = useState(false);

  const displayName = user?.name || "Specialist";
  const displayEmail = user?.email || "";
  const initials = displayName[0]?.toUpperCase() || "S";

  const specialistStatus = specialistProfile?.verificationStatus || "pending";

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (specialistProfile) setAvailable(specialistProfile.isAvailable);
  }, [specialistProfile]);

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

  async function handleAvailabilityToggle(next: boolean) {
    if (!specialistProfile?.id) return;
    setAvailSaving(true);
    setAvailable(next);
    try {
      await workerApi.updateAvailability(specialistProfile.id, next);
    } catch {
      setAvailable(!next);
    } finally {
      setAvailSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 font-sans md:px-8">
      {/* ── Header ─────────────────────────── */}
      <header className="mb-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-on-surface">
              Specialist Settings
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Manage your specialist account, availability, and payouts.
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
                  Specialist
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
        {/* ── Left column ── */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          {/* Specialist Status */}
          <section className="rounded-xl border border-primary/20 bg-primary-container/10 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <span className="material-symbols-outlined">badge</span>
                </div>
                <div>
                  <h4 className="font-headline-md text-headline-md text-on-surface">Specialist Account</h4>
                  <p className="text-xs text-on-surface-variant">
                    Profile status:{" "}
                    <span className="font-semibold capitalize text-on-surface">{specialistStatus}</span>
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize border ${
                  specialistStatus === "approved"
                    ? "border-green-700/40 bg-green-500/10 text-green-600"
                    : specialistStatus === "rejected"
                    ? "border-red-700/40 bg-red-500/10 text-red-600"
                    : "border-amber-700/40 bg-amber-500/10 text-amber-600"
                }`}
              >
                {specialistStatus}
              </span>
            </div>

            {specialistStatus === "pending" && (
              <div className="mt-4">
                <VerificationPendingCard centered />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/dashboard/specialist")}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-soft hover:opacity-90"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => router.push("/dashboard/specialist/bookings")}
                className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface transition-soft hover:bg-surface-container-low"
              >
                Bookings
              </button>
              <button
                onClick={() => router.push("/dashboard/specialist/earnings")}
                className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface transition-soft hover:bg-surface-container-low"
              >
                Earnings
              </button>
            </div>
          </section>

          {/* Specialist Profile & Skills */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
                <span className="material-symbols-outlined">construction</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Specialist Profile</h4>
            </div>
            <div className="space-y-4">
              <SettingsRow
                icon="construction"
                label="My Services"
                sub="Manage the services you offer"
                onClick={() => router.push("/dashboard/specialist/bookings")}
              />
              <SettingsRow
                icon="verified_user"
                label="Verification"
                sub={
                  specialistStatus === "approved"
                    ? "Verified specialist"
                    : specialistStatus === "pending"
                    ? "Under review by admin"
                    : "Rejected"
                }
                onClick={() => router.push("/dashboard/specialist")}
              />
            </div>
          </section>

          {/* Account & Security */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-soft hover:shadow-md">
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
                trailing={<Toggle checked={twoFA} onChange={setTwoFA} />}
              />
              <SettingsRow
                icon="devices"
                label="Authorized Devices"
                sub="3 devices currently active"
                onClick={() => router.push("/dashboard/settings/privacy")}
              />
            </div>
          </section>

          {/* Danger zone — tucked below Account & Security, kept compact */}
          <DangerZone
            compact
            onLogout={account.handleLogout}
            onRequestDelete={() => account.setShowDeleteConfirm(true)}
          />
        </div>

        {/* ── Right column ── */}
        <aside className="flex flex-col gap-4 lg:col-span-4">
          {/* Availability */}
          {specialistStatus === "approved" && (
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-tertiary-container/10 p-2 text-tertiary">
                  <span className="material-symbols-outlined">bolt</span>
                </div>
                <h4 className="font-headline-md text-headline-md">Availability</h4>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-label-md text-label-md">Available for jobs</p>
                  <p className="text-xs text-on-surface-variant">
                    {available ? "You are visible to clients" : "You are offline"}
                  </p>
                </div>
                <Toggle checked={available} disabled={availSaving} onChange={handleAvailabilityToggle} />
              </div>
            </section>
          )}

          {/* Payout & Earnings */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Payout &amp; Earnings</h4>
            </div>
            <div className="space-y-4">
              <SettingsRow
                icon="account_balance_wallet"
                label="Earnings Overview"
                sub="Track your income & performance"
                onClick={() => router.push("/dashboard/specialist/earnings")}
              />
              <SettingsRow
                icon="payments"
                label="Payout Method"
                sub="Add UPI / Bank account"
                onClick={() => showToast("Payout setup coming soon.", "info")}
              />
            </div>
          </section>

          {/* Display */}
          <DisplaySection dark={dark} setDark={setDark} applyTheme={applyTheme} />

          {/* Preferences */}
          <PreferencesSection
            notifications={notifications}
            setNotifications={setNotifications}
          />

          {/* Support & Info */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-on-surface-variant/10 p-2 text-on-surface-variant">
                <span className="material-symbols-outlined">info</span>
              </div>
              <h4 className="font-headline-md text-headline-md">Support &amp; Info</h4>
            </div>
            <SupportInfoList router={router} />
          </section>
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
