"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { workerApi, workerExtApi } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import type { BookingDetail, EarningsData, SpecialistProfile } from "@/types";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
import BackButton from "@/components/ui/BackButton";
import PaginationBar from "@/components/ui/PaginationBar";
import BasicDropdown from "@/components/smoothui/components/basic-dropdown";
import {
  LineChart,
  Grid,
  Line,
  XAxis,
  ChartTooltip,
  ProfitLossLine,
  resolveProfitLossTooltipLabel,
  SeriesMarkers,
  PieChart,
  PieSlice,
  PieCenter,
  Legend,
  LegendItem,
  LegendLabel,
  LegendMarker,
  LegendValue,
} from "@bklitui/ui/charts";

const EMPTY_EARNINGS: EarningsData = {
  today: 0,
  week: 0,
  total: 0,
  todayCount: 0,
  weekCount: 0,
  totalCount: 0,
};

const PIE_PALETTE = [
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
  "#f43f5e",
];

const CHART_MARGIN = { top: 12, right: 12, bottom: 28, left: 28 };

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

type RangeDays = 14 | 30 | 90;
type ChartMode = "line" | "pie";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
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

function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{formatCurrency(animated)}</span>;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function isOnOrAfter(date: Date, start: Date) {
  return date.getTime() >= start.getTime();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  gpay: "GPay",
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  wallet: "Wallet",
};

function paymentMethodLabel(method?: string) {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] ?? method;
}

function paymentStatusDot(status?: string) {
  switch (status) {
    case "captured":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "attempted":
      return "bg-amber-500";
    default:
      return "bg-outline-variant";
  }
}

/** True when the viewport is at or below `breakpoint` px (mobile-first). */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

export default function SpecialistEarningsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, activeMode, specialistProfile } = useAppSelector((s) => s.auth);
  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const [profileChecked, setProfileChecked] = useState(false);
  const [profile, setProfile] = useState<SpecialistProfile | null>(null);
  const [earnings, setEarnings] = useState<EarningsData>(EMPTY_EARNINGS);
  const [completedBookings, setCompletedBookings] = useState<BookingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [range, setRange] = useState<RangeDays>(14);
  const [chartMode, setChartMode] = useState<ChartMode>("pie");
  const [withdrawHint, setWithdrawHint] = useState(false);
  const [txPage, setTxPage] = useState(1);

  const TX_PER_PAGE = 5;
  const isMobile = useIsMobile();
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);

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
      setOnline(specialist.isAvailable);

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

  const toggleOnline = useCallback(async () => {
    if (!workerId || onlineBusy) return;
    const next = !online;
    setOnlineBusy(true);
    setOnline(next);
    try {
      await workerApi.updateAvailability(workerId, next);
    } catch (err) {
      setOnline(!next);
      setError(err instanceof Error ? err.message : "Failed to update availability.");
    } finally {
      setOnlineBusy(false);
    }
  }, [workerId, online, onlineBusy]);

  // Current time — refreshed every minute so the page never goes stale
  // (e.g. staying open past midnight would otherwise freeze "Today"/"This Month").
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const monthStart = useMemo(() => startOfMonth(now), [now]);

  const sortedBookings = useMemo(
    () => [...completedBookings].sort((a, b) => getBookingDate(b).getTime() - getBookingDate(a).getTime()),
    [completedBookings]
  );

  const txPageCount = Math.max(1, Math.ceil(sortedBookings.length / TX_PER_PAGE));
  const pagedBookings = sortedBookings.slice(
    (Math.min(txPage, txPageCount) - 1) * TX_PER_PAGE,
    Math.min(txPage, txPageCount) * TX_PER_PAGE
  );

  const monthTotal = useMemo(
    () => sortedBookings.filter(b => isOnOrAfter(getBookingDate(b), monthStart)).reduce((s, b) => s + getBookingAmount(b), 0),
    [sortedBookings, monthStart]
  );

  // Total earnings across all completed bookings — used for per-job contribution %.
  const periodTotal = useMemo(
    () => sortedBookings.reduce((s, b) => s + getBookingAmount(b), 0),
    [sortedBookings]
  );

  // Daily series for the trend chart — length depends on the selected range.
  const { daily, todaySum, yesterdaySum, weekSum, lastWeekSum } = useMemo(() => {
    const days = Array.from({ length: range }, (_, i) => {
      const d = startOfDay(now);
      d.setDate(d.getDate() - (range - 1 - i));
      return d;
    });
    const series = days.map(d => ({
      date: d,
      amount: sortedBookings
        .filter(b => isSameDay(getBookingDate(b), d))
        .reduce((s, b) => s + getBookingAmount(b), 0),
    }));
    const tSum = series[series.length - 1].amount;
    const ySum = series[series.length - 2].amount;
    const wSum = series.slice(-7).reduce((s, x) => s + x.amount, 0);
    const lwSum = series.slice(-14, -7).reduce((s, x) => s + x.amount, 0);
    return { daily: series, todaySum: tSum, yesterdaySum: ySum, weekSum: wSum, lastWeekSum: lwSum };
  }, [sortedBookings, now, range]);

  const pct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;

  const todayTrend = pct(todaySum, yesterdaySum);
  const weekTrend = pct(weekSum, lastWeekSum);

  const trendBadge = (value: number, flatLabel: string, compareLabel: string) => {
    if (value > 1) return { icon: "trending_up", text: `${value}% ${compareLabel}`, cls: "text-green-600" };
    if (value < -1) return { icon: "trending_down", text: `${Math.abs(value)}% ${compareLabel}`, cls: "text-red-600" };
    return { icon: "trending_flat", text: flatLabel, cls: "text-on-surface-variant" };
  };

  const stats = [
    {
      label: "Today",
      value: earnings.today,
      trend: trendBadge(todayTrend, "Stable", "vs yesterday"),
      highlight: false,
    },
    {
      label: "This Week",
      value: earnings.week,
      trend: trendBadge(weekTrend, "Stable", "vs last week"),
      highlight: false,
    },
    {
      label: "This Month",
      value: monthTotal,
      trend: { icon: "trending_flat", text: "Stable", cls: "text-on-surface-variant" },
      highlight: false,
    },
    {
      label: "Total Earned",
      value: earnings.total,
      trend: { icon: "", text: "Lifetime Performance", cls: "text-primary" },
      highlight: true,
    },
  ];

  // Chart data for the Bklit Profit/Loss line (N-day series).
  const chartData = useMemo(
    () => daily.map(d => ({ date: d.date, pnl: d.amount })),
    [daily]
  );

  // Per-service earnings for the selected range (pie chart).
  const pieData = useMemo(() => {
    const rangeStart = startOfDay(now);
    rangeStart.setDate(rangeStart.getDate() - (range - 1));
    const totals = new Map<string, number>();
    for (const booking of sortedBookings) {
      if (!isOnOrAfter(getBookingDate(booking), rangeStart)) continue;
      const key = booking.serviceType?.trim() || "Other";
      totals.set(key, (totals.get(key) ?? 0) + getBookingAmount(booking));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, value]) => value > 0)
      .map(([label, value], index) => ({
        label,
        value,
        color: PIE_PALETTE[index % PIE_PALETTE.length],
      }));
  }, [sortedBookings, range, now]);

  // Period totals + trend for the donut caption (vs the previous period).
  const { pieTotal, prevPeriodTotal } = useMemo(() => {
    const rangeStart = startOfDay(now);
    rangeStart.setDate(rangeStart.getDate() - (range - 1));
    const prevStart = new Date(rangeStart);
    prevStart.setDate(prevStart.getDate() - range);
    const prevEnd = new Date(rangeStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    let current = 0;
    let previous = 0;
    for (const booking of sortedBookings) {
      const date = getBookingDate(booking);
      const amount = getBookingAmount(booking);
      if (isOnOrAfter(date, rangeStart)) current += amount;
      else if (isOnOrAfter(date, prevStart) && date.getTime() <= prevEnd.getTime()) previous += amount;
    }
    return { pieTotal: current, prevPeriodTotal: previous };
  }, [sortedBookings, range, now]);

  const pieTrend = pct(pieTotal, prevPeriodTotal);

  // Real Service Fees vs Tips breakdown from completed bookings.
  const breakdown = useMemo(() => {
    let fees = 0;
    let tips = 0;
    for (const booking of sortedBookings) {
      const cb = booking.costBreakdown;
      if (cb && cb.total != null) {
        fees += Math.max(0, cb.total - (cb.tip ?? 0) - (cb.repairWork ?? 0));
        tips += cb.tip ?? 0;
      } else {
        fees += getBookingAmount(booking);
      }
    }
    const total = fees + tips;
    return {
      fees,
      tips,
      total,
      feesPct: total > 0 ? Math.round((fees / total) * 100) : 0,
      tipsPct: total > 0 ? Math.round((tips / total) * 100) : 0,
    };
  }, [sortedBookings]);

  const noEarningsInRange = pieData.length === 0;

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
        <main className="bg-background min-h-screen flex flex-col">
          {/* TopAppBar */}
          <header className="h-16 px-4 sm:px-6 flex justify-between items-center bg-surface sticky top-0 z-40 border-b border-outline-variant">
            <div className="flex items-center gap-4">
              <BackButton label="" fallback="/dashboard/specialist" className="px-1.5 py-1.5 shrink-0 hidden sm:flex" />
              <h2 className="font-headline-md text-headline-md text-on-surface">My Earnings</h2>
              <div className="hidden sm:block h-6 w-[1px] bg-outline-variant" />
              <p className="hidden sm:block font-label-md text-label-md text-on-surface-variant">
                Jobs Completed: {loading ? "..." : earnings.totalCount}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="hidden sm:flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/60 px-4 py-2.5 rounded-2xl shadow-sm">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  {online ? "Listed Available" : "Unlisted Offline"}
                </span>
                <button
                  onClick={toggleOnline}
                  disabled={onlineBusy || !workerId}
                  className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${
                    online ? "bg-primary" : "bg-outline-variant"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                      online ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>
              <button
                onClick={loadEarnings}
                disabled={loading || !workerId}
                className="text-on-surface-variant hover:text-primary disabled:opacity-50"
                title="Refresh"
              >
                <span className="material-symbols-outlined">sync</span>
              </button>
              <div className="flex items-center gap-4 text-on-surface-variant">
                <span className="material-symbols-outlined cursor-pointer hover:text-primary">notifications</span>
                <span className="material-symbols-outlined cursor-pointer hover:text-primary">search</span>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <div className="p-4 sm:p-6 flex flex-col gap-6 custom-scrollbar max-w-[1440px] w-full mx-auto">
            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(stat => (
                <motion.div
                  key={stat.label}
                  whileHover={{ y: -4, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className={`bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm flex flex-col gap-2 transition-colors duration-300 ${
                    stat.highlight
                      ? "hover:border-green-500 hover:ring-2 hover:ring-green-500/40"
                      : "hover:border-primary hover:ring-2 hover:ring-primary/30"
                  }`}
                >
                  <span className="font-label-md text-label-md text-on-surface-variant">
                    {stat.label}
                  </span>
                  <h3 className="font-headline-lg text-headline-lg">
                    {loading ? (
                      "..."
                    ) : (
                      <AnimatedAmount
                        value={stat.value}
                        className={stat.highlight ? "text-green-600" : "text-on-surface"}
                      />
                    )}
                  </h3>
                  <div className={`flex items-center text-xs font-medium ${stat.trend.cls}`}>
                    {stat.trend.icon && <span className="material-symbols-outlined text-sm">{stat.trend.icon}</span>}
                    {stat.trend.text}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Main Column: Chart and Transactions */}
              <div className="flex-[2] flex flex-col gap-6">
                {/* Earnings Chart Card */}
                  <div className="bg-surface-container-lowest border border-outline-variant p-6 sm:p-8 rounded-xl shadow-soft h-[520px] sm:h-[560px] flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center mb-8 flex-wrap gap-3">
                    <div>
                      <h4 className="font-label-md text-label-md text-on-surface">Earnings Trend</h4>
                      <p className="text-sm text-on-surface-variant">
                        {chartMode === "pie"
                          ? `Per-service earnings · Last ${range} days`
                          : `Last ${range} days performance`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <BasicDropdown
                        label="Range"
                        items={[
                          { id: 14, label: "Last 14 days" },
                          { id: 30, label: "Last 30 days" },
                          { id: 90, label: "Last 90 days" },
                        ]}
                        value={{ id: range, label: range === 14 ? "Last 14 days" : range === 30 ? "Last 30 days" : "Last 90 days" }}
                        onChange={(item) => setRange(item.id as RangeDays)}
                      />
                      <BasicDropdown
                        label="Chart"
                        items={[
                          { id: "line", label: "Line chart" },
                          { id: "pie", label: "Pie chart" },
                        ]}
                        value={{ id: chartMode, label: chartMode === "line" ? "Line chart" : "Pie chart" }}
                        onChange={(item) => setChartMode(item.id as ChartMode)}
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : noEarningsInRange ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16">
                      <span className="material-symbols-outlined text-4xl text-outline-variant">monitoring</span>
                      <p className="text-sm text-on-surface-variant">
                        No completed jobs in the last {range} days yet.
                      </p>
                    </div>
                  ) : chartMode === "line" ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-full max-w-[720px] h-full">
                      <LineChart data={chartData} className="w-full h-full" margin={CHART_MARGIN}>
                        <Grid highlightRowValues={[0]} horizontal />
                        <Line dataKey="pnl" stroke="transparent" strokeWidth={0} showHighlight={false} />
                        <ProfitLossLine
                          dataKey="pnl"
                          positiveColor="#10b981"
                          negativeColor="#ef4444"
                        />
                        {!isMobile && (
                          <SeriesMarkers dataKey="pnl" fill="#10b981" radius={2} strokeWidth={2} skipZero />
                        )}
                        <XAxis numTicks={isMobile ? 3 : 5} />
                        <ChartTooltip
                          indicatorColor={(point) =>
                            Number(point.pnl ?? 0) >= 0 ? "#10b981" : "#ef4444"
                          }
                          rows={(point) => {
                            const pnl = Number(point.pnl ?? 0);
                            return [
                              {
                                label: resolveProfitLossTooltipLabel("Earnings"),
                                value: formatCurrency(pnl),
                                color: pnl >= 0 ? "#10b981" : "#ef4444",
                              },
                            ];
                          }}
                        />
                      </LineChart>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <div className="w-full flex items-center justify-center h-[240px] sm:h-[280px]">
                      <PieChart
                        data={pieData}
                        innerRadius={isMobile ? 56 : 70}
                        size={isMobile ? 200 : 240}
                        hoveredIndex={hoveredSlice}
                        onHoverChange={setHoveredSlice}
                      >
                        {pieData.map((item, index) => (
                          <PieSlice key={item.label} index={index} showGlow={false} />
                        ))}
                        <PieCenter defaultLabel="Total" prefix="₹" />
                      </PieChart>
                      </div>
                      <p className="mt-3 text-sm text-on-surface-variant flex items-center gap-1.5">
                        {pieTotal > 0 && pieTrend !== 0 ? (
                          <>
                            <span className={`material-symbols-outlined text-base ${pieTrend > 0 ? "text-green-600" : "text-red-600"}`}>
                              {pieTrend > 0 ? "trending_up" : "trending_down"}
                            </span>
                            <span className={`font-semibold ${pieTrend > 0 ? "text-green-600" : "text-red-600"}`}>
                              {Math.abs(pieTrend)}%
                            </span>
                            <span>vs previous {range} days</span>
                          </>
                        ) : (
                          <span>No previous period data to compare</span>
                        )}
                      </p>
                      <Legend
                        layout="row"
                        hoveredIndex={hoveredSlice}
                        onHoverChange={setHoveredSlice}
                        items={pieData.map(d => ({ label: d.label, value: d.value, color: d.color ?? "var(--chart-1)" }))}
                        className="mt-4 w-full gap-x-3 gap-y-2 max-h-[120px] overflow-y-auto"
                      >
                        <LegendItem className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-container">
                          <LegendMarker />
                          <LegendLabel className="truncate" />
                          <LegendValue
                            formatValue={(value) => formatCurrency(value)}
                            className="text-xs tabular-nums font-semibold"
                          />
                        </LegendItem>
                      </Legend>
                    </div>
                  )}
                </div>

                {/* Recent Transactions */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-on-surface">Recent Transactions</h3>
                    <button
                      onClick={() => router.push("/dashboard/specialist/bookings")}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : sortedBookings.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      No completed bookings yet.
                    </div>
                  ) : (
                    <>
                      {/* Mobile: card layout (bookings design) */}
                      <div className="sm:hidden divide-y divide-outline-variant/40">
                        {pagedBookings.map(booking => {
                          const date = getBookingDate(booking);
                          const isPending = booking.status !== "completed";
                          const tip = booking.costBreakdown?.tip ?? 0;
                          const rating = booking.customerRating ?? 0;
                          const amount = getBookingAmount(booking);
                          const contribution = periodTotal > 0 ? Math.round((amount / periodTotal) * 100) : 0;
                          return (
                            <div key={booking.id} className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-on-surface text-sm">{booking.clientName}</span>
                                <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full uppercase ${isPending ? "bg-amber-100 text-amber-700" : "bg-green-600/15 text-green-600"}`}>
                                  {isPending ? "Pending" : "Completed"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                                <span>{booking.serviceType}</span>
                                <span className="text-gray-500">
                                  {formatDate(date)} · <span className="font-mono">#{booking.bookingNumber}</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-xs">
                                  {tip > 0 && (
                                    <span className="font-semibold text-green-600">+{formatCurrency(tip)} tip</span>
                                  )}
                                  {rating > 0 && (
                                    <span className="flex items-center gap-0.5 text-amber-500">
                                      <span className="material-symbols-outlined font-fill text-sm leading-none">star</span>
                                      <span className="font-semibold">{rating.toFixed(1)}</span>
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 text-on-surface-variant">
                                    <span className={`w-2 h-2 rounded-full ${paymentStatusDot(booking.paymentStatus)}`} />
                                    {paymentMethodLabel(booking.costBreakdown?.paymentMethod)}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-primary">+{formatCurrency(amount)}</p>
                                  <p className="text-[10px] text-on-surface-variant">{contribution}% of total</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Desktop: table layout (bookings design, original labels) */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-surface-container/50 border-b border-outline-variant text-on-surface-variant font-bold uppercase tracking-wider">
                              <th className="p-4">Client / Service</th>
                              <th className="p-4">Date &amp; ID</th>
                              <th className="p-4">Amount</th>
                              <th className="p-4">Tip</th>
                              <th className="p-4">Rating</th>
                              <th className="p-4">Paid via</th>
                              <th className="p-4">Status</th>
                              <th className="p-4" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/40">
                            {pagedBookings.map(booking => {
                              const date = getBookingDate(booking);
                              const isPending = booking.status !== "completed";
                              const tip = booking.costBreakdown?.tip ?? 0;
                              const rating = booking.customerRating ?? 0;
                              const amount = getBookingAmount(booking);
                              const contribution = periodTotal > 0 ? Math.round((amount / periodTotal) * 100) : 0;
                              return (
                                <tr key={booking.id} className="hover:bg-surface-container-lowest/50 transition-colors group">
                                  <td className="p-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-variant flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">person</span>
                                      </div>
                                      <div>
                                        <p className="font-label-md text-label-md text-on-surface">{booking.clientName}</p>
                                        <p className="text-xs text-on-surface-variant">{booking.serviceType}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <p className="text-sm text-on-surface font-medium">{formatDate(date)}</p>
                                    <p className="text-[10px] text-on-surface-variant font-mono">
                                      #{booking.bookingNumber}
                                    </p>
                                  </td>
                                  <td className="p-4">
                                    <span className="font-bold text-primary">+{formatCurrency(amount)}</span>
                                    <p className="text-[10px] text-on-surface-variant mt-0.5">{contribution}% of total</p>
                                  </td>
                                  <td className="p-4">
                                    {tip > 0 ? (
                                      <span className="font-semibold text-green-600">+{formatCurrency(tip)}</span>
                                    ) : (
                                      <span className="text-on-surface-variant/60">—</span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    {rating > 0 ? (
                                      <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined font-fill text-amber-500 text-sm">star</span>
                                        <span className="text-xs font-semibold text-on-surface">{rating.toFixed(1)}</span>
                                      </div>
                                    ) : (
                                      <span className="text-on-surface-variant/60">—</span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${paymentStatusDot(booking.paymentStatus)}`} />
                                      <span className="text-xs font-medium text-on-surface">{paymentMethodLabel(booking.costBreakdown?.paymentMethod)}</span>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full uppercase ${isPending ? "bg-amber-100 text-amber-700" : "bg-green-600/15 text-green-600"}`}>
                                      {isPending ? "Pending" : "Completed"}
                                    </span>
                                  </td>
                                  <td className="p-4 text-right">
                                    <span className="material-symbols-outlined text-on-surface-variant cursor-pointer group-hover:text-primary transition-colors">
                                      chevron_right
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  </div>
                  {!loading && sortedBookings.length > 0 && (
                    <PaginationBar
                      page={Math.min(txPage, txPageCount)}
                      pageCount={txPageCount}
                      perPage={TX_PER_PAGE}
                      total={sortedBookings.length}
                      onPage={setTxPage}
                    />
                  )}
                </div>
              </div>

              {/* Sidebar / Right Column */}
              <aside className="flex-1 flex flex-col gap-6">
                {/* Payout Method Card */}
                <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-soft flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-label-md text-label-md text-on-surface">Payout</h4>
                    <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                      Coming soon
                    </span>
                  </div>
                  <div className="bg-surface-container-high p-4 rounded-lg">
                    <p className="text-xs text-on-surface-variant">Available for payout</p>
                    <p className="font-headline-md text-headline-md mt-1 text-green-600">
                      {loading ? "..." : <AnimatedAmount value={earnings.total} />}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      From {earnings.totalCount} completed job{earnings.totalCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => setWithdrawHint(v => !v)}
                      className="w-full py-4 bg-primary text-white rounded-xl font-bold text-base hover:shadow-lg hover:translate-y-[-2px] active:translate-y-0 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined">payments</span>
                      Withdraw Funds
                    </button>
                    {withdrawHint && (
                      <p className="text-xs text-on-surface-variant bg-surface-container-high rounded-lg px-3 py-2">
                        Withdrawals are not available yet — you can start withdrawing as soon as the payout system goes live.
                      </p>
                    )}
                  </div>
                </div>

                {/* Earnings Breakdown */}
                <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-soft flex flex-col gap-4">
                  <h4 className="font-label-md text-label-md text-on-surface">Earnings Breakdown</h4>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : breakdown.total <= 0 ? (
                    <p className="text-sm text-on-surface-variant py-6 text-center">
                      No completed jobs yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-medium text-on-surface-variant">
                          <span>Service Fees</span>
                          <span>{formatCurrency(breakdown.fees)} · {breakdown.feesPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${breakdown.feesPct}%` }} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-medium text-on-surface-variant">
                          <span>Tips</span>
                          <span>{formatCurrency(breakdown.tips)} · {breakdown.tipsPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className="h-full bg-secondary" style={{ width: `${Math.max(breakdown.tipsPct, breakdown.tips > 0 ? 2 : 0)}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Visual Accent Card */}
                <div className="relative rounded-xl overflow-hidden aspect-video shadow-soft">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary mix-blend-multiply z-10" />
                  <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary-container to-primary" />
                  <div className="absolute inset-0 z-20 flex flex-col justify-end p-6">
                    <h5 className="text-white font-bold text-lg mb-1">New Incentive Program</h5>
                    <p className="text-on-primary-container text-xs opacity-90 mb-4">
                      Complete 10 more jobs this month to earn a 5% bonus on all commissions.
                    </p>
                    <a className="inline-flex items-center text-xs font-bold text-white group" href="#">
                      Learn More
                      <span className="material-symbols-outlined ml-1 group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </a>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </main>
      )}
    </>
  );
}