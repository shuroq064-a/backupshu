"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store";
import { logout } from "@/store/slices/authSlice";
import { userApi } from "@/lib/api";

export default function PrivacyPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [twoFA, setTwoFA] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(false);

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleChangePassword() {
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    try {
      await userApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setPwSuccess(false);
        setShowChangePassword(false);
      }, 2000);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await userApi.deleteAccount();

      dispatch(logout());
      document.cookie = "shuroqx_session=; path=/; max-age=0";

      setTimeout(() => {
        router.push("/auth");
      }, 500);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete account"
      );
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 font-sans md:px-8">
      <header className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">Privacy &amp; Security</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Control your account security and data</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/settings")}
          className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span> Settings
        </button>
      </header>

      {/* ── Security settings ────────────────── */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-soft hover:shadow-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
            <span className="material-symbols-outlined">shield</span>
          </div>
          <h4 className="font-headline-md text-headline-md">Security</h4>
        </div>
        <div className="space-y-4">
          <Row
            icon="vibration"
            label="Two-Factor Authentication"
            sub="Add an extra layer of security to your account."
            onClick={() => setTwoFA((v) => !v)}
            trailing={<Toggle checked={twoFA} onChange={setTwoFA} />}
          />
          <Row
            icon="policy"
            label="Manage Permissions"
            sub="Control what data we can access."
            onClick={() => router.push("/dashboard/settings/privacy/permissions")}
          />
          <Row
            icon="lock_reset"
            label="Change Password"
            sub="Update your account password."
            onClick={() => setShowChangePassword((v) => !v)}
          />
          <Row
            icon="notifications_active"
            label="Login Alerts"
            sub="Receive alerts about unauthorized logins."
            onClick={() => setLoginAlerts((v) => !v)}
            trailing={<Toggle checked={loginAlerts} onChange={setLoginAlerts} />}
          />
        </div>
      </div>

      {/* ── Change Password Form (inline) ──────── */}
      {showChangePassword && (
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-headline-md text-headline-md">Change Password</h4>
            <button
              onClick={() => {
                setShowChangePassword(false);
                setPwError(null);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="rounded-full p-2 text-on-surface-variant transition-soft hover:bg-primary-container/10"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {pwSuccess && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary-container/10 px-4 py-2.5 text-sm font-medium text-primary">
              ✓ Password changed successfully!
            </div>
          )}
          {pwError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
              {pwError}
            </div>
          )}

          <div className="space-y-3">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter current password"
            />
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 8 characters"
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat new password"
            />
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setShowChangePassword(false);
                setPwError(null);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="flex-1 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              onClick={handleChangePassword}
              disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {pwLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Saving…
                </span>
              ) : (
                "Change Password"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Deactivate ────────────────────────── */}
      <div className="mt-4 rounded-xl border border-error/20 bg-error-container/20 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-headline-md text-headline-md text-error">Delete Account</p>
            <p className="font-body-md text-body-md text-on-surface-variant">Permanently delete your account</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="shrink-0 rounded-xl bg-error px-5 py-2 text-sm font-semibold text-on-error transition-soft hover:shadow-lg active:scale-95"
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── Delete Account Confirmation Modal ──── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in">
          <div className="max-h-[90dvh] w-full max-w-sm animate-pop-in overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_24px_rgba(0,0,0,0.1)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-red-50 text-2xl text-red-500">
              <span className="material-symbols-outlined">delete_forever</span>
            </div>
            <p className="mb-2 text-center text-lg font-bold text-on-surface">Delete Account?</p>
            <p className="mb-6 text-center text-sm text-on-surface-variant">
              This action is permanent and cannot be undone. All your data will be deleted.
            </p>
            {deleteError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-600">{deleteError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row ──
function Row({
  icon,
  label,
  sub,
  onClick,
  trailing,
}: {
  icon: string;
  label: string;
  sub: string;
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
          <p className="text-xs text-on-surface-variant">{sub}</p>
        </div>
      </div>
      {trailing ? (
        <span className="shrink-0">{trailing}</span>
      ) : (
        <span className="material-symbols-outlined shrink-0 text-outline">chevron_right</span>
      )}
    </div>
  );
}

// ── Toggle switch ──
function Toggle({
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

// ── Reusable password input ─────────────────
function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-xs text-on-surface-variant">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-outline-variant bg-surface p-2.5 pr-12 text-sm text-on-surface outline-none transition-soft focus:border-primary focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant transition-colors hover:text-primary"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
