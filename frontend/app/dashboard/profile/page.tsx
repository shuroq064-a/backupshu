"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { logout } from "@/store/slices/authSlice";
import { userApi, workerApi, type UserProfile, type UpdateProfilePayload } from "@/lib/api";
import { AddressBookSection } from "@/components/profile/AddressBookSection";

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi",   label: "Hindi"   },
  { value: "telugu",  label: "Telugu"  },
];

export default function ProfilePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, specialistProfile, activeMode } = useAppSelector((s) => s.auth);
  const isSpecialistMode = activeMode === "specialist";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit form state
  const [form, setForm] = useState<UpdateProfilePayload>({
    name: "", phone: "", address: "", language: "english",
  });

  // ── Load profile on mount ──────────────────
  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await userApi.getProfile();
        setProfile(data);
        setForm({
          name:     data.name     || "",
          phone:    data.phone    || "",
          address:  data.address  || "",
          language: data.language || "english",
        });
      } catch (e: any) {
        setError("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  // ── Save profile ───────────────────────────
  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await userApi.updateProfile(form);
      setProfile(updated);
      setIsEditing(false);
      setSuccessMsg("Profile updated successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Logout ─────────────────────────────────
  async function handleLogout() {
    if (specialistProfile?.id && specialistProfile.isAvailable) {
      try {
        await workerApi.updateAvailability(specialistProfile.id, false);
      } catch {
        // Continue with logout even if availability update fails
      }
    }
    dispatch(logout());
    document.cookie = "shuroqx_session=; path=/; max-age=0";
    router.replace("/auth");
  }

  // ── Delete Account ─────────────────────────
  async function handleDeleteConfirm() {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await userApi.deleteAccount();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  const displayName  = profile?.name  || user?.name  || "User";
  const displayEmail = profile?.email || user?.email || "";
  const initials     = displayName[0]?.toUpperCase() || "U";
  const langLabel    = LANGUAGE_OPTIONS.find((l) => l.value === (profile?.language || "english"))?.label || "English";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 font-sans md:px-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">My Profile</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Manage your personal information</p>
        </div>
          <button
            onClick={() => router.push(isSpecialistMode ? "/dashboard/specialist/settings" : "/dashboard/settings")}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span> Settings
          </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ── Main column ─────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          {/* Success / Error */}
          {successMsg && (
            <div className="rounded-xl border border-primary/20 bg-primary-container/10 px-4 py-2.5 text-sm font-medium text-primary">
              ✓ {successMsg}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ── Profile header card ──────────────── */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-container to-primary text-3xl font-extrabold text-white">
                  {initials}
                </div>
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full border-b-2 border-primary bg-transparent text-xl font-bold text-on-surface focus:outline-none"
                      placeholder="Your name"
                    />
                  ) : (
                    <h3 className="text-xl font-bold text-on-surface">{displayName}</h3>
                  )}
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-0.5 text-xs font-semibold text-on-primary-container">
                    <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    {isSpecialistMode ? "Specialist" : "Customer"}
                  </span>
                </div>
              </div>
              <button
                onClick={isEditing ? handleSave : () => setIsEditing(true)}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10 disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                ) : (
                  <span className="material-symbols-outlined text-sm">{isEditing ? "save" : "edit"}</span>
                )}
                {isEditing ? "Save" : "Edit"}
              </button>
            </div>
          </div>

          {/* ── Personal Info ────────────────────── */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">Personal Info</h3>
            <div className="divide-y divide-outline-variant/60">
              <InfoRow
                icon="call"
                label="Phone Number"
                value={isEditing ? undefined : (profile?.phone || "Add phone number")}
                empty={!profile?.phone}
                editContent={
                  isEditing ? (
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      className="w-full border-b border-primary bg-transparent text-sm text-on-surface focus:outline-none"
                    />
                  ) : undefined
                }
              />
              <InfoRow icon="mail" label="Email" value={displayEmail} readOnly />
              <InfoRow
                icon="location_on"
                label="Address"
                value={isEditing ? undefined : (profile?.address || "Add address")}
                empty={!profile?.address}
                editContent={
                  isEditing ? (
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="City, Area"
                      className="w-full border-b border-primary bg-transparent text-sm text-on-surface focus:outline-none"
                    />
                  ) : undefined
                }
              />
              <div className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                  <span className="material-symbols-outlined">language</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-on-surface-variant">Language</p>
                  {isEditing ? (
                    <div className="relative">
                      <button
                        onClick={() => setShowLangPicker(!showLangPicker)}
                        className="mt-0.5 flex items-center gap-1 text-sm text-on-surface"
                      >
                        {LANGUAGE_OPTIONS.find((l) => l.value === form.language)?.label}
                        <span className="text-on-surface-variant">▾</span>
                      </button>
                      {showLangPicker && (
                        <div className="absolute top-7 left-0 z-10 w-40 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
                          {LANGUAGE_OPTIONS.map((lang) => (
                            <button
                              key={lang.value}
                              onClick={() => {
                                setForm({ ...form, language: lang.value });
                                setShowLangPicker(false);
                              }}
                              className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary-container/10 ${
                                form.language === lang.value ? "font-semibold text-primary" : "text-on-surface"
                              }`}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-on-surface">{langLabel}</p>
                  )}
                </div>
                <span className="text-on-surface-variant">›</span>
              </div>
            </div>
          </div>

          <AddressBookSection />

          {isEditing && (
            <button
              onClick={() => {
                setIsEditing(false);
                setForm({
                  name:     profile?.name     || "",
                  phone:    profile?.phone    || "",
                  address:  profile?.address  || "",
                  language: profile?.language || "english",
                });
              }}
              className="w-full rounded-xl border border-outline-variant py-2.5 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
          )}
        </div>

        {/* ── Side column ─────────────────── */}
        <aside className="flex flex-col gap-4 lg:col-span-4">
          {/* Overview / Stats */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">Overview</h3>
            <div className="grid grid-cols-3 gap-3">
              {isSpecialistMode ? (
                <>
                  <StatTile icon="event_note" label="Jobs" value="0" />
                  <StatTile icon="payments" label="Earned" value="₹0" />
                  <StatTile icon="star" label="Rating" value="0" />
                </>
              ) : (
                <>
                  <StatTile icon="event_note" label="Bookings" value="0" />
                  <StatTile icon="payments" label="Spent" value="₹0" />
                  <StatTile icon="favorite" label="Favorites" value="0" />
                </>
              )}
            </div>
          </div>

          {/* ── Wallet & Earnings / Payouts ───────── */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            {isSpecialistMode ? (
              <>
                <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">Earnings &amp; Payouts</h3>
                <div className="divide-y divide-outline-variant/60">
                  <InfoRow
                    icon="account_balance_wallet"
                    label="Earnings Overview"
                    value=""
                    empty
                    onClick={() => router.push("/dashboard/specialist/earnings")}
                  />
                  <InfoRow
                    icon="payments"
                    label="Payout Method"
                    value=""
                    empty
                    onClick={() => router.push("/dashboard/specialist/earnings")}
                  />
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-4 font-headline-md text-headline-md text-on-surface">Wallet &amp; Earnings</h3>
                <div className="divide-y divide-outline-variant/60">
                  <InfoRow icon="credit_card" label="Saved Cards / UPI" value="" empty />
                  <InfoRow icon="account_balance_wallet" label="Wallet Balance" value="" empty />
                </div>
              </>
            )}
          </div>

          {/* ── Actions ─────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                  <span className="material-symbols-outlined">logout</span>
                </span>
                <span className="text-sm font-medium text-on-surface">Logout</span>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white transition-soft hover:opacity-90"
              >
                Logout
              </button>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex w-full items-center gap-3 text-red-500 transition-colors hover:text-red-600"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <span className="material-symbols-outlined">delete_forever</span>
              </span>
              <span className="text-sm font-medium">Delete Account</span>
            </button>
          </div>
        </aside>
      </div>

      {/* ── Delete Account Confirmation Modal ──── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm animate-pop-in rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_24px_rgba(0,0,0,0.1)]">
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

// ── Stat tile ──
function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-center">
      <span className="material-symbols-outlined text-primary">{icon}</span>
      <p className="mt-1 text-lg font-bold text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}

// ── Info Row ──
function InfoRow({
  icon,
  label,
  value,
  empty = false,
  readOnly = false,
  editContent,
  onClick,
}: {
  icon: string;
  label: string;
  value?: string;
  empty?: boolean;
  readOnly?: boolean;
  editContent?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 py-4 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-on-surface-variant">{label}</p>
        {editContent ? (
          <div className="mt-0.5">{editContent}</div>
        ) : (
          <p className={`mt-0.5 truncate text-sm ${empty ? "italic text-on-surface-variant/60" : readOnly ? "text-on-surface-variant" : "text-on-surface"}`}>
            {value}
          </p>
        )}
      </div>
      {!editContent && <span className="flex-shrink-0 text-on-surface-variant">›</span>}
    </div>
  );
}
