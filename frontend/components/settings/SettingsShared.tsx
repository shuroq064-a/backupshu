"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store";
import { logout } from "@/store/slices/authSlice";
import { userApi } from "@/lib/api";
import { OtpInput, type OtpInputHandle } from "@/components/interior/otp-input";

export const LANGUAGE_ITEMS = [
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "ar", label: "Arabic" },
];

// ── Row (Account & Security / list item) ──
export function SettingsRow({
  icon,
  label,
  sub,
  subClass = "",
  onClick,
  trailing,
}: {
  icon: string;
  label: string;
  sub?: string;
  subClass?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center justify-between gap-4 rounded-lg border border-outline-variant/50 bg-surface p-4 transition-soft hover:border-primary ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="material-symbols-outlined shrink-0 text-on-surface-variant group-hover:text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-label-md text-label-md">{label}</p>
          {sub && (
            <p className={`text-xs text-on-surface-variant ${subClass}`}>{sub}</p>
          )}
        </div>
      </div>
      {trailing ? (
        <span className="shrink-0">{trailing}</span>
      ) : (
        <span className="material-symbols-outlined shrink-0 text-outline">
          chevron_right
        </span>
      )}
    </div>
  );
}

// ── Toggle switch ──
export function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
      className={`relative h-6 w-12 rounded-full transition-colors duration-300 ${
        checked ? "bg-primary" : "bg-surface-container-highest"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      aria-pressed={checked}
    >
      <div
        className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm border border-outline-variant transition-transform duration-300 ${
          checked ? "translate-x-6" : ""
        }`}
      />
    </button>
  );
}

// ── Shared account actions (password change, logout, delete) ──
export function useAccountActions() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<"ask" | "otp">("ask");
  const [deleteContact, setDeleteContact] = useState<string>("");
  const [deleteVia, setDeleteVia] = useState<"email" | "sms">("email");
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [isSendingDeleteOtp, setIsSendingDeleteOtp] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  function handleLogout() {
    dispatch(logout());
    document.cookie = "shuroqx_session=; path=/; max-age=0";
    router.replace("/auth");
  }

  async function handleSendDeleteOtp() {
    setIsSendingDeleteOtp(true);
    setDeleteError(null);
    try {
      const res = await userApi.requestDeleteVerification();
      setDeleteContact(res.contact);
      setDeleteVia(res.via === "sms" ? "sms" : "email");
      setDeleteOtpSent(true);
      if (res.dev_otp) {
        setDeleteOtp(res.dev_otp);
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to send verification code"
      );
    } finally {
      setIsSendingDeleteOtp(false);
    }
  }

  function handleOpenDelete() {
    setDeleteStep("ask");
    setDeleteOtp("");
    setDeleteOtpSent(false);
    setDeleteContact("");
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }

  function handleProceedToOtp() {
    setDeleteStep("otp");
    setDeleteError(null);
    void handleSendDeleteOtp();
  }

  async function handleDeleteConfirm(otp?: string) {
    const code = otp ?? deleteOtp;
    if (!code || code.length === 0) {
      setDeleteError("Please enter the verification code");
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await userApi.deleteAccount(code);
      dispatch(logout());
      document.cookie = "shuroqx_session=; path=/; max-age=0";
      setTimeout(() => {
        router.replace("/auth");
      }, 500);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete account"
      );
      setIsDeleting(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwError(null);
    setPwSuccess(false);
    try {
      await userApi.changePassword({
        current_password: pw.current,
        new_password: pw.next,
      });
      setPwSuccess(true);
      setPw({ current: "", next: "" });
      setTimeout(() => setShowPw(false), 1200);
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Failed to change password"
      );
    } finally {
      setPwSaving(false);
    }
  }

  return {
    showDeleteConfirm,
    setShowDeleteConfirm,
    isDeleting,
    deleteError,
    setDeleteError,
    deleteStep,
    deleteContact,
    deleteVia,
    deleteOtpSent,
    isSendingDeleteOtp,
    deleteOtp,
    setDeleteOtp,
    handleOpenDelete,
    handleProceedToOtp,
    handleSendDeleteOtp,
    showPw,
    setShowPw,
    pw,
    setPw,
    pwError,
    setPwError,
    pwSuccess,
    setPwSuccess,
    pwSaving,
    handleLogout,
    handleDeleteConfirm,
    handleChangePassword,
  };
}

// ── Change Password Modal ──
export function PasswordModal({
  open,
  onClose,
  pw,
  setPw,
  onSubmit,
  saving,
  error,
  success,
}: {
  open: boolean;
  onClose: () => void;
  pw: { current: string; next: string };
  setPw: (v: { current: string; next: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  success: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={onSubmit}
        className="max-h-[90dvh] w-full max-w-sm animate-pop-in overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_24px_rgba(0,0,0,0.1)]"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-container/10 text-2xl text-primary">
          <span className="material-symbols-outlined">lock_reset</span>
        </div>
        <p className="mb-2 text-center text-lg font-bold text-on-surface">
          Change Password
        </p>
        <p className="mb-6 text-center text-sm text-on-surface-variant">
          Enter your current password and choose a new one.
        </p>

        <div className="space-y-3">
          <input
            type="password"
            required
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
            placeholder="Current password"
            className="w-full rounded-lg border border-outline-variant bg-surface p-2.5 font-body-md text-on-surface transition-soft focus:border-primary focus:ring-primary"
          />
          <input
            type="password"
            required
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            placeholder="New password"
            className="w-full rounded-lg border border-outline-variant bg-surface p-2.5 font-body-md text-on-surface transition-soft focus:border-primary focus:ring-primary"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary-container/10 p-3">
            <p className="text-sm font-medium text-primary">Password changed successfully</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Delete Account Modal (OTP-verified) ──
export function DeleteModal({
  open,
  onCancel,
  onConfirm,
  deleting,
  error,
  step,
  contact,
  via,
  otpSent,
  sendingOtp,
  otp,
  setOtp,
  onSendOtp,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (otp: string) => void;
  deleting: boolean;
  error: string | null;
  step: "ask" | "otp";
  contact: string;
  via: "email" | "sms";
  otpSent: boolean;
  sendingOtp: boolean;
  otp: string;
  setOtp: (v: string) => void;
  onSendOtp: () => void;
}) {
  const otpRef = useRef<OtpInputHandle>(null);
  const [otpError, setOtpError] = useState(false);
  const [otpExpiry, setOtpExpiry] = useState<string | null>(null);

  useEffect(() => {
    if (open && step === "otp" && !otpSent && !sendingOtp) onSendOtp();
  }, [open, step, otpSent, sendingOtp, onSendOtp]);

  useEffect(() => {
    if (open) {
      setOtpError(false);
    }
  }, [open, step]);

  useEffect(() => {
    if (error && step === "otp") {
      setOtpError(true);
      otpRef.current?.clear();
    }
  }, [error, step]);

  const handleComplete = (value: string) => {
    setOtpError(false);
    onConfirm(value);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in">
      <div className="max-h-[90dvh] w-full max-w-sm animate-pop-in overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_24px_rgba(0,0,0,0.1)]">
        {step === "ask" ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-red-50 text-2xl text-red-500">
              <span className="material-symbols-outlined">delete_forever</span>
            </div>
            <p className="mb-2 text-center text-lg font-bold text-on-surface">
              Delete Account?
            </p>
            <p className="mb-6 text-center text-sm text-on-surface-variant">
              This action is permanent and cannot be undone. To confirm, we'll
              send a one-time verification code to your registered email.
            </p>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSendOtp}
                disabled={sendingOtp}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingOtp ? "Sending code..." : "Send code"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-red-50 text-2xl text-red-500">
              <span className="material-symbols-outlined">verified_user</span>
            </div>
            <p className="mb-2 text-center text-lg font-bold text-on-surface">
              Verify to delete
            </p>
            <p className="mb-1 text-center text-sm text-on-surface-variant">
              Enter the {via === "sms" ? "SMS" : "email"} code sent to
            </p>
            <p className="mb-4 text-center text-sm font-semibold text-on-surface">
              {contact || "your registered email"}
            </p>

            <div className="mb-4 flex justify-center">
              <OtpInput
                ref={otpRef}
                length={6}
                mode="numeric"
                status={otpError ? "error" : "idle"}
                errorMessage={error ?? ""}
                hint={otpSent ? "Code sent — check your inbox" : ""}
                autoFocus
                onComplete={handleComplete}
                className="[&>div>div]:w-9 [&_input]:h-11 [&_input]:w-9 sm:[&>div>div]:w-10 sm:[&_input]:w-10"
              />
            </div>

            <p className="mb-2 text-center text-[11px] text-on-surface-variant">
              Code expires in 5 minutes. Didn't receive it?{" "}
              <button
                type="button"
                onClick={() => {
                  setOtpError(false);
                  onSendOtp();
                }}
                disabled={sendingOtp}
                className="font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {sendingOtp ? "Sending..." : "Resend code"}
              </button>
            </p>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(otp)}
                disabled={deleting || !otp}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Danger zone (logout / delete) ──
export function DangerZone({
  onLogout,
  onRequestDelete,
  compact = false,
}: {
  onLogout: () => void;
  onRequestDelete: () => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "mt-4" : "mt-4"}>
      <div
        className={`flex flex-col gap-4 rounded-xl border border-error/20 bg-error-container/20 ${
          compact ? "p-5" : "p-5"
        } sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="min-w-0">
          <h4
            className={`mb-1 ${
              compact
                ? "font-title-md text-title-md"
                : "font-headline-md text-headline-md"
            } text-error`}
          >
            Session Management
          </h4>
          <p
            className={`${
              compact ? "text-sm" : "font-body-md text-body-md"
            } text-on-surface-variant`}
          >
            Manage your login session or delete your account.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onLogout}
            className={`rounded-xl bg-surface-container-highest ${
              compact ? "px-5 py-2.5 text-sm" : "px-5 py-2.5 text-sm"
            } font-bold text-on-surface transition-soft hover:bg-surface-dim active:scale-95`}
          >
            Log out
          </button>
          <button
            onClick={onRequestDelete}
            className={`rounded-xl border border-error bg-transparent ${
              compact ? "px-4 py-2 text-sm" : "px-4 py-2 text-sm"
            } font-semibold text-error transition-soft hover:bg-error/10 active:scale-95`}
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Shared footer ──
export function SettingsFooter() {
  return (
    <footer className="mt-12 opacity-50">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-outline">
        <span className="font-label-sm text-label-sm">Version 4.2.0-stable</span>
        <span className="hidden h-1 w-1 rounded-full bg-outline sm:block" />
        <span className="font-label-sm text-label-sm">© 2024 ShuroqX Platform</span>
      </div>
    </footer>
  );
}

// ── Support & Info list (shared between both pages) ──
export function SupportInfoList({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <ul className="space-y-4 font-label-md text-label-md">
      <li
        onClick={() => router.push("/dashboard/settings/help")}
        className="flex cursor-pointer items-center justify-between text-on-surface-variant transition-soft hover:text-primary"
      >
        <span>Help &amp; Support</span>
        <span className="material-symbols-outlined text-sm">arrow_forward</span>
      </li>
      <li
        onClick={() => router.push("/dashboard/settings/terms")}
        className="flex cursor-pointer items-center justify-between text-on-surface-variant transition-soft hover:text-primary"
      >
        <span>Terms of Service</span>
        <span className="material-symbols-outlined text-sm">arrow_forward</span>
      </li>
      <li
        onClick={() => router.push("/dashboard/settings/about")}
        className="flex cursor-pointer items-center justify-between text-on-surface-variant transition-soft hover:text-primary"
      >
        <span>About ShuroqX</span>
        <span className="material-symbols-outlined text-sm">arrow_forward</span>
      </li>
    </ul>
  );
}

// ── Display section (shared between both pages) ──
export function DisplaySection({
  dark,
  setDark,
  applyTheme,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  applyTheme: (v: boolean) => void;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-tertiary-container/10 p-2 text-tertiary">
          <span className="material-symbols-outlined">palette</span>
        </div>
        <h4 className="font-headline-md text-headline-md">Display</h4>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label-md text-label-md">Dark Mode</p>
          <p className="text-xs text-on-surface-variant">
            {dark ? "Currently on" : "Currently off"}
          </p>
        </div>
        <Toggle
          checked={dark}
          onChange={(v) => {
            setDark(v);
            applyTheme(v);
          }}
        />
      </div>
    </section>
  );
}

// ── Preferences section (shared between both pages) ──
export function PreferencesSection({
  notifications,
  setNotifications,
  languageLabel = "English (US)",
}: {
  notifications: boolean;
  setNotifications: (v: boolean) => void;
  languageLabel?: string;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
          <span className="material-symbols-outlined">tune</span>
        </div>
        <h4 className="font-headline-md text-headline-md">Preferences</h4>
      </div>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-label-md text-label-md">Notifications</p>
            <p className="text-xs text-on-surface-variant">Push, Email &amp; SMS</p>
          </div>
          <Toggle checked={notifications} onChange={setNotifications} />
        </div>
        <div>
          <label className="mb-2 block font-label-md text-label-md">Language</label>
          <div className="font-body-md text-body-md text-on-surface-variant">
            {languageLabel}
          </div>
        </div>
      </div>
    </section>
  );
}
