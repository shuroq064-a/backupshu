"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workerApi, workerExtApi } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import type { BookingDetail, EarningsData, SpecialistProfile } from "@/types";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
import BackButton from "@/components/ui/BackButton";
import {
  LineChart,
  Grid,
  Line,
  XAxis,
  ChartTooltip,
  ProfitLossLine,
  ProfitLossLegendHoverProvider,
  resolveProfitLossTooltipLabel,
} from "@bklitui/ui/charts";

const EMPTY_EARNINGS: EarningsData = {
  today: 0,
  week: 0,
  total: 0,
  todayCount: 0,
  weekCount: 0,
  totalCount: 0,
};

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
  const [online, setOnline] = useState(true);
  const [legendHoveredIndex] = useState<number | null>(null);

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
  const monthStart = useMemo(() => startOfMonth(now), [now]);

  const sortedBookings = useMemo(
    () => [...completedBookings].sort((a, b) => getBookingDate(b).getTime() - getBookingDate(a).getTime()),
    [completedBookings]
  );

  const monthTotal = useMemo(
    () => sortedBookings.filter(b => isOnOrAfter(getBookingDate(b), monthStart)).reduce((s, b) => s + getBookingAmount(b), 0),
    [sortedBookings, monthStart]
  );

  // 14-day daily series for the trend chart + period comparisons.
  const { daily, todaySum, yesterdaySum, weekSum, lastWeekSum } = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = startOfDay(now);
      d.setDate(d.getDate() - (13 - i));
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
    const wSum = series.slice(7).reduce((s, x) => s + x.amount, 0);
    const lwSum = series.slice(0, 7).reduce((s, x) => s + x.amount, 0);
    return { daily: series, todaySum: tSum, yesterdaySum: ySum, weekSum: wSum, lastWeekSum: lwSum };
  }, [sortedBookings, now]);

  const pct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;

  const todayTrend = pct(todaySum, yesterdaySum);
  const weekTrend = pct(weekSum, lastWeekSum);

  const trendBadge = (value: number, flatLabel: string) => {
    if (value > 1) return { icon: "trending_up", text: `${value}% vs yesterday`, cls: "text-green-600" };
    if (value < -1) return { icon: "trending_down", text: `${Math.abs(value)}% vs yesterday`, cls: "text-red-600" };
    return { icon: "trending_flat", text: flatLabel, cls: "text-on-surface-variant" };
  };

  const stats = [
    {
      label: "Today",
      value: earnings.today,
      trend: trendBadge(todayTrend, "Stable"),
      highlight: false,
    },
    {
      label: "This Week",
      value: earnings.week,
      trend: trendBadge(weekTrend, "Stable"),
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

  // Chart data for the Bklit Profit/Loss line (14-day series).
  const chartData = useMemo(
    () => daily.map(d => ({ date: d.date, pnl: d.amount })),
    [daily]
  );

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
              <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-green-50 rounded-full border border-green-100">
                <div className={`w-2 h-2 rounded-full ${online ? "bg-green-500 animate-pulse" : "bg-outline-variant"}`} />
                <span className={`text-sm font-semibold ${online ? "text-green-700" : "text-on-surface-variant"}`}>
                  {online ? "Available / Online" : "Offline / Paused"}
                </span>
                <label className="relative inline-flex items-center cursor-pointer ml-2">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={online}
                    onChange={e => setOnline(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
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
                <div
                  key={stat.label}
                  className={`bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-soft flex flex-col gap-2 ${
                    stat.highlight ? "border-primary/20 bg-primary/5" : ""
                  }`}
                >
                  <span className={`font-label-md text-label-md ${stat.highlight ? "text-primary" : "text-on-surface-variant"}`}>
                    {stat.label}
                  </span>
                  <h3 className="font-headline-lg text-headline-lg text-primary">
                    {loading ? "..." : formatCurrency(stat.value)}
                  </h3>
                  <div className={`flex items-center text-xs font-medium ${stat.trend.cls}`}>
                    {stat.trend.icon && <span className="material-symbols-outlined text-sm">{stat.trend.icon}</span>}
                    {stat.trend.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Main Column: Chart and Transactions */}
              <div className="flex-[2] flex flex-col gap-6">
                {/* Earnings Chart Card */}
                <div className="bg-surface-container-lowest border border-outline-variant p-6 sm:p-8 rounded-xl shadow-soft min-h-[400px] flex flex-col">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h4 className="font-label-md text-label-md text-on-surface">Earnings Trend</h4>
                      <p className="text-sm text-on-surface-variant">Last 14 days performance</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 text-xs font-bold bg-primary-container text-on-primary-container rounded-lg">14D</button>
                      <button className="px-3 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">30D</button>
                      <button className="px-3 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">90D</button>
                    </div>
                  </div>
                  <div className="flex-1 relative flex items-end w-full">
                    <LineChart data={chartData} className="w-full" aspectRatio="2 / 1">
                      <Grid highlightRowValues={[0]} horizontal />
                      <Line dataKey="pnl" stroke="transparent" strokeWidth={0} showHighlight={false} />
                      <ProfitLossLegendHoverProvider hoveredIndex={legendHoveredIndex}>
                        <ProfitLossLine
                          dataKey="pnl"
                          positiveColor="#10b981"
                          negativeColor="#ef4444"
                        />
                      </ProfitLossLegendHoverProvider>
                      <XAxis />
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

                {/* Recent Transactions */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-soft overflow-hidden">
                  <div className="p-6 border-b border-outline-variant flex justify-between items-center">
                    <h4 className="font-label-md text-label-md text-on-surface">Recent Transactions</h4>
                    <button className="text-sm font-semibold text-primary hover:underline">View All</button>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : sortedBookings.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      No completed bookings yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-container-low text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4">Client / Service</th>
                            <th className="px-6 py-4">Date &amp; ID</th>
                            <th className="px-6 py-4">Amount</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant">
                          {sortedBookings.slice(0, 8).map(booking => {
                            const date = getBookingDate(booking);
                            const isPending = booking.status !== "completed";
                            return (
                              <tr key={booking.id} className="hover:bg-surface-container transition-colors group">
                                <td className="px-6 py-4">
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
                                <td className="px-6 py-4">
                                  <p className="text-sm text-on-surface font-medium">{formatDate(date)}</p>
                                  <p className="text-[10px] text-on-surface-variant font-mono">
                                    #{booking.bookingNumber}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="font-bold text-primary">+{formatCurrency(getBookingAmount(booking))}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                      isPending ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                                    }`}
                                  >
                                    {isPending ? "Pending" : "Completed"}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
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
                  )}
                </div>
              </div>

              {/* Sidebar / Right Column */}
              <aside className="flex-1 flex flex-col gap-6">
                {/* Payout Method Card */}
                <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-soft flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-label-md text-label-md text-on-surface">Payout Method</h4>
                    <button className="text-xs font-bold text-primary px-3 py-1 rounded-md hover:bg-primary/10 transition-colors uppercase">
                      Edit
                    </button>
                  </div>
                  <div className="bg-surface-container p-4 rounded-lg flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-surface-container-lowest flex items-center justify-center border border-outline-variant">
                      <span className="material-symbols-outlined text-primary">account_balance</span>
                    </div>
                    <div>
                      <p className="font-label-md text-label-md text-on-surface">HDFC Bank</p>
                      <p className="text-xs text-on-surface-variant font-mono">**** 5678</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-on-surface-variant">Available for payout</span>
                      <span className="font-headline-md text-headline-md text-on-surface">₹12,450</span>
                    </div>
                    <button className="w-full py-4 bg-primary text-white rounded-xl font-bold text-base hover:shadow-lg hover:translate-y-[-2px] active:translate-y-0 transition-all shadow-md flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">payments</span>
                      Withdraw Funds
                    </button>
                  </div>
                </div>

                {/* Earnings Breakdown */}
                <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-soft flex flex-col gap-4">
                  <h4 className="font-label-md text-label-md text-on-surface">Earnings Breakdown</h4>
                  <div className="space-y-4">
                    {[
                      { label: "Service Fees", pct: 70, bar: "bg-primary" },
                      { label: "Tips & Bonuses", pct: 20, bar: "bg-secondary" },
                      { label: "Reimbursements", pct: 10, bar: "bg-tertiary-container" },
                    ].map(item => (
                      <div key={item.label} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-medium text-on-surface-variant">
                          <span>{item.label}</span>
                          <span>{item.pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className={`h-full ${item.bar}`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
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
