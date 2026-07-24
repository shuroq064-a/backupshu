"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workerApi, workerExtApi } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import type { BookingDetail, EarningsData, SpecialistProfile } from "@/types";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";

type Period = "week" | "month" | "total";

const EMPTY_EARNINGS: EarningsData = {
  today: 0,
  week: 0,
  total: 0,
  todayCount: 0,
  weekCount: 0,
  totalCount: 0,
};

const PERIOD_LABEL: Record<Period, string> = {
  week: "This Week",
  month: "This Month",
  total: "All Time",
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SERVICE_ICONS: Record<string, string> = {
  plumbing: "plumbing",
  plumber: "plumbing",
  "ac repair": "ac_unit",
  carpenter: "construction",
  carpentry: "construction",
  electrical: "bolt",
  electrician: "bolt",
  cleaning: "clean_hands",
  painting: "brush",
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getBookingDate(booking: BookingDetail) {
  const raw = booking.updatedAt || booking.scheduledDate;
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getBookingAmount(booking: BookingDetail) {
  return booking.costBreakdown?.total || booking.amount || booking.visitCharge || 0;
}

function formatCurrency(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function isOnOrAfter(date: Date, start: Date) {
  return date.getTime() >= start.getTime();
}

export default function SpecialistEarningsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, activeMode, specialistProfile } = useAppSelector((s) => s.auth);
  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const [profileChecked, setProfileChecked] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [profile, setProfile] = useState<SpecialistProfile | null>(null);
  const [earnings, setEarnings] = useState<EarningsData>(EMPTY_EARNINGS);
  const [completedBookings, setCompletedBookings] = useState<BookingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const workerId = profile?.id;

  // A specialist must finish onboarding before accessing earnings.
  useEffect(() => {
    if (!user?.id) return;
    dispatch(fetchSpecialistProfile(user.id)).finally(() => setProfileChecked(true));
  }, [user?.id, dispatch]);

  useEffect(() => {
    if (profileChecked && activeMode === "specialist" && !currentProfile) {
      router.replace("/dashboard/specialist/onboarding");
    }
  }, [profileChecked, currentProfile, activeMode, router]);

  const loadEarnings = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    setError("");
    try {
      const specialist = await workerApi.getProfileByUserId(user.id);
      setProfile(specialist);

      const [summary, transactions] = await Promise.all([
        workerExtApi.getEarnings(specialist.id),
        workerExtApi.getBookings(specialist.id, "completed"),
      ]);

      setEarnings(summary);
      setCompletedBookings(transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load earnings.");
      setEarnings(EMPTY_EARNINGS);
      setCompletedBookings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadEarnings();
  }, [loadEarnings]);

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);

  const sortedBookings = useMemo(
    () => [...completedBookings].sort((a, b) => getBookingDate(b).getTime() - getBookingDate(a).getTime()),
    [completedBookings]
  );

  const monthBookings = useMemo(
    () => sortedBookings.filter(booking => isOnOrAfter(getBookingDate(booking), monthStart)),
    [sortedBookings, monthStart]
  );

  const periodBookings = useMemo(() => {
    if (period === "week") {
      return sortedBookings.filter(booking => isOnOrAfter(getBookingDate(booking), weekStart));
    }
    if (period === "month") {
      return monthBookings;
    }
    return sortedBookings;
  }, [monthBookings, period, sortedBookings, weekStart]);

  const monthTotal = useMemo(
    () => monthBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    [monthBookings]
  );

  const summary = {
    week: {
      label: "This Week",
      value: earnings.week,
      count: earnings.weekCount,
    },
    month: {
      label: "This Month",
      value: monthTotal,
      count: monthBookings.length,
    },
    total: {
      label: "All Time",
      value: earnings.total,
      count: earnings.totalCount,
    },
  } satisfies Record<Period, { label: string; value: number; count: number }>;

  const current = summary[period];

  const weeklyData = useMemo(() => {
    const buckets = WEEK_DAYS.map(day => ({ day, amount: 0 }));
    sortedBookings.forEach(booking => {
      const date = getBookingDate(booking);
      if (!isOnOrAfter(date, weekStart)) return;
      const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
      buckets[dayIndex].amount += getBookingAmount(booking);
    });
    return buckets;
  }, [sortedBookings, weekStart]);

  const maxAmount = Math.max(1, ...weeklyData.map(d => d.amount));
  const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;

  if (profileChecked && activeMode === "specialist" && !currentProfile) {
    return null;
  }

  return (
    <>
    {currentProfile?.verificationStatus === "pending" ? (
      <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto">
        <VerificationPendingCard centered />
      </div>
    ) : (
    <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Earnings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your income and performance</p>
        </div>
        <button
          onClick={loadEarnings}
          disabled={loading || !workerId}
          className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-primary-container shadow-sm hover:bg-primary-container/40 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
        {(["week", "month", "total"] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all whitespace-nowrap flex-1 sm:flex-none ${
              period === p ? "bg-surface-container-lowest text-primary-container shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-gradient-to-br from-primary to-primary-container rounded-3xl p-6 text-white shadow-xl shadow-primary/20">
        <p className="text-sm text-primary-fixed-dim mb-1">{current.label}</p>
        <p className="text-3xl sm:text-5xl font-bold mb-1">{loading ? "..." : formatCurrency(current.value)}</p>
        <p className="text-primary-fixed-dim text-sm">
          {loading ? "Loading earnings" : `${current.count} job${current.count === 1 ? "" : "s"} completed`}
        </p>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-6 pt-5 border-t border-white/20">
          {[
            { label: "Today", value: earnings.today, count: earnings.todayCount },
            { label: "This Week", value: earnings.week, count: earnings.weekCount },
            { label: "All Time", value: earnings.total, count: earnings.totalCount },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] sm:text-xs text-primary-fixed-dim">{item.label}</p>
              <p className="text-sm sm:text-lg font-bold">{loading ? "..." : formatCurrency(item.value)}</p>
              <p className="text-[10px] sm:text-[11px] text-primary-fixed-dim">{item.count} job{item.count === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-4">Daily Breakdown (This Week)</h2>
        <div className="flex items-end gap-2 sm:gap-3 h-40">
          {weeklyData.map((day, index) => {
            const heightPct = Math.max(4, Math.round((day.amount / maxAmount) * 100));
            const isToday = index === todayIndex;
            const hasEarnings = day.amount > 0;
            return (
              <div key={day.day} className="flex-1 flex flex-col items-center gap-1.5">
                <p className={`text-[11px] font-semibold ${hasEarnings ? "text-gray-700" : "text-gray-400"}`}>{formatCurrency(day.amount)}</p>
                <div className="w-full flex items-end" style={{ height: "96px" }}>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      isToday
                        ? "bg-gradient-to-t from-primary to-primary-container"
                        : hasEarnings
                        ? "bg-primary-container hover:bg-primary-fixed-dim"
                        : "bg-surface-container-high"
                    }`}
                    style={{ height: `${heightPct}%` }}
                    title={`${day.day}: ${formatCurrency(day.amount)}`}
                  />
                </div>
                <p className={`text-xs font-medium ${isToday ? "text-primary" : "text-gray-500"}`}>{day.day}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Transaction History</h2>
          <span className="text-xs text-gray-400">
            {loading ? "Loading" : `${periodBookings.length} transaction${periodBookings.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : periodBookings.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No completed bookings for {PERIOD_LABEL[period].toLowerCase()}.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {periodBookings.map(booking => {
              const date = getBookingDate(booking);
              const icon = SERVICE_ICONS[booking.serviceType.toLowerCase()] || "handyman";
              return (
                <div key={booking.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                   <div className="w-10 h-10 rounded-xl bg-primary-container/40 flex items-center justify-center text-primary flex-shrink-0">
                     <span className="material-symbols-outlined text-[20px]">{icon}</span>
                   </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{booking.serviceType}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {booking.clientName} · {formatDate(date)} · {booking.scheduledTime}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">+{formatCurrency(getBookingAmount(booking))}</p>
                    <p className="text-xs text-green-600 font-medium">Paid</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    )}
    </>
  );
}
