"use client";

/**
 * Cute, friendly "Verification Pending" card shown to specialists whose
 * profile is still under review. Used in the sidebar (persistent across all
 * specialist menus) and on the specialist dashboard.
 *
 * `simple`  → minimal clean card (used on content-heavy pages like Bookings).
 * `compact` → short copy, for the sidebar.
 */
export function VerificationPendingCard({
  compact = false,
  simple = false,
  centered = false,
}: {
  compact?: boolean;
  simple?: boolean;
  centered?: boolean;
}) {
  if (centered) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-10 py-9 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-amber-500 font-fill">verified_user</span>
          <p className="text-lg font-extrabold text-amber-900">Verification Pending</p>
          <p className="text-xs leading-relaxed text-amber-800/90">
            Your profile is being reviewed by our team. You&apos;ll get full access to bookings, earnings &amp; more once approved.
          </p>
        </div>
      </div>
    );
  }

  if (simple) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="material-symbols-outlined text-amber-500 font-fill">verified_user</span>
        <p className="text-sm font-semibold text-amber-900">
          Verification Pending — your profile is under review. You&apos;ll get full access once approved.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-primary-container/30 p-4 shadow-sm">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-200/40 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <span className="material-symbols-outlined text-2xl font-fill">verified_user</span>
          <span className="absolute -right-1 -top-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-amber-400 ring-2 ring-amber-50" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-amber-900">Verification Pending</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90">
            {compact
              ? "Your profile is under review. You'll get full access once approved."
              : "Your profile is being reviewed by our team. Once approved, you'll unlock bookings, earnings & more. Hang tight! ✨"}
          </p>
        </div>
      </div>
    </div>
  );
}
