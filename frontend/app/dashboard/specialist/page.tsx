"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile, setSpecialistAvailability } from "@/store/slices/authSlice";
import { workerApi, bookingApi, workerExtApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL as WS_BASE } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
import { CountUp } from "@/components/ui/CountUp";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { XAxis } from "@/components/charts/x-axis";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import BasicDropdown from "@/components/smoothui/components/basic-dropdown";
import type { BookingDetail, EarningsData, BookingReview } from "@/types";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SpecialistDashboard() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, specialistProfile } = useAppSelector((s) => s.auth);
  const { showToast } = useToast();

  const [profileChecked, setProfileChecked] = useState(false);
  const [isAvailabilitySaving, setIsAvailabilitySaving] = useState(false);
  const [requests, setRequests] = useState<BookingDetail[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [completedBookings, setCompletedBookings] = useState<BookingDetail[]>([]);
  const [earnings, setEarnings] = useState<EarningsData>({
    today: 0,
    week: 0,
    total: 0,
    todayCount: 0,
    weekCount: 0,
    totalCount: 0,
  });
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [countUpReady, setCountUpReady] = useState(false);
  const [allBookings, setAllBookings] = useState<BookingDetail[]>([]);

  // Pagination for the Active Requests list
  const REQUESTS_PER_PAGE = 5;
  const [requestPage, setRequestPage] = useState(1);
  const totalRequestPages = Math.max(1, Math.ceil(requests.length / REQUESTS_PER_PAGE));
  const paginatedRequests = requests.slice(
    (requestPage - 1) * REQUESTS_PER_PAGE,
    requestPage * REQUESTS_PER_PAGE
  );

  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const workerId = currentProfile?.id;

  // ── Load Profile ──
  useEffect(() => {
    let alive = true;
    if (!user?.id) return;

    setProfileChecked(false);
    dispatch(fetchSpecialistProfile(user.id)).finally(() => {
      if (alive) setProfileChecked(true);
    });

    return () => {
      alive = false;
    };
  }, [user?.id, dispatch]);

  // ── Fetch Operations ──
  const fetchRequests = useCallback(async () => {
    if (!workerId) return;
    setRequestsLoading(true);
    try {
      const data = await workerExtApi.getRequests(workerId);
      setRequests(data.filter((b) => b.status === "upcoming"));
    } catch (err) {
      console.error("Failed to load requests:", err);
    } finally {
      setRequestsLoading(false);
    }
  }, [workerId]);

  const fetchEarningsAndCompleted = useCallback(async () => {
    if (!workerId) return;
    try {
      const [summary, history, all] = await Promise.all([
        workerExtApi.getEarnings(workerId),
        workerExtApi.getBookings(workerId, "completed"),
        workerExtApi.getBookings(workerId),
      ]);
      setEarnings(summary);
      setCompletedBookings(history);
      setAllBookings(all);
    } catch {}
  }, [workerId]);

  const fetchReviews = useCallback(async () => {
    if (!workerId) return;
    try {
      const data = await workerExtApi.getReviews(workerId);
      setReviews(data);
    } catch {}
  }, [workerId]);

  useEffect(() => {
    if (!workerId) return;
    fetchRequests();
    fetchEarningsAndCompleted();
    fetchReviews();
  }, [workerId, fetchRequests, fetchEarningsAndCompleted, fetchReviews]);

  useEffect(() => {
    if (!workerId) return;
    const t = setTimeout(() => setCountUpReady(true), 350);
    return () => clearTimeout(t);
  }, [workerId]);

  // ── Live updates via a single WebSocket (no polling).
  // The backend pushes NEW_REQUEST / BOOKING_UPDATED events to /ws/specialist/{id}
  // when a client books a matching service or a request changes status. We re-fetch
  // only when a real event arrives, so the Active Requests list never flickers from
  // a timer. Initial data load happens above; the socket also triggers a load on open.
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let opened = false;

    const loadOnce = () => {
      if (!cancelled) {
        void fetchRequests();
      }
    };

    const connect = () => {
      if (cancelled) return;
      const token = getToken();
      if (!token) return;
      const socket = new WebSocket(
        `${WS_BASE}/ws/specialist/${encodeURIComponent(workerId)}?token=${encodeURIComponent(token)}`
      );
      ws = socket;
      socket.onopen = () => {
        opened = true;
        loadOnce();
      };
      socket.onmessage = () => loadOnce();
      socket.onclose = () => {
        if (!cancelled && !document.hidden && opened) {
          setTimeout(connect, 2000);
        }
      };
      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (ws) {
        if (opened) {
          ws.close();
        } else {
          ws.onopen = () => ws?.close();
        }
      }
    };
  }, [workerId, fetchRequests]);

  // ── Handlers ──
  async function handleAvailabilityToggle(val: boolean) {
    if (!workerId || isAvailabilitySaving) return;
    setIsAvailabilitySaving(true);
    try {
      const res = await workerApi.updateAvailability(workerId, val);
      dispatch(setSpecialistAvailability(res.is_available));
      showToast(val ? "Availability turned ON! You are listed for client bookings." : "Availability turned OFF.", "success");
    } catch {
      showToast("Failed to update availability.", "error");
    } finally {
      setIsAvailabilitySaving(false);
    }
  }

  async function handleAccept(bookingId: string) {
    setActionLoading(bookingId);
    try {
      await bookingApi.updateStatus(bookingId, "accepted");
      showToast("Booking accepted! Client has been notified.", "success");
      setRequests((prev) => prev.filter((b) => b.id !== bookingId));
      if (requestPage > 1 && (requestPage - 1) * REQUESTS_PER_PAGE >= requests.length - 1) {
        setRequestPage((p) => Math.max(1, p - 1));
      }
      fetchEarningsAndCompleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept booking";
      showToast(msg, "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecline(bookingId: string) {
    setActionLoading(bookingId);
    try {
      await bookingApi.updateStatus(bookingId, "rejected", "Specialist declined request");
      showToast("Booking request declined.", "info");
      setRequests((prev) => prev.filter((b) => b.id !== bookingId));
      if (requestPage > 1 && (requestPage - 1) * REQUESTS_PER_PAGE >= requests.length - 1) {
        setRequestPage((p) => Math.max(1, p - 1));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to decline booking", "error");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Calculations ──
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return "0";
    return (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2);
  }, [reviews]);

  const completionRate = useMemo(() => {
    if (allBookings.length === 0) return 0;
    const finished = allBookings.filter(
      (b) => b.status === "completed" || b.status === "cancelled"
    ).length;
    return Math.round((finished / allBookings.length) * 100);
  }, [allBookings]);

  const activeNowCount = useMemo(() => {
    return allBookings.filter(
      (b) => b.status === "accepted" || b.status === "started" || b.status === "reached" || b.status === "ongoing"
    ).length;
  }, [allBookings]);

  // Monthly profit from completed bookings (last 6 months) — uses real
  // Daily profit from completed bookings (last 7 LOCAL days → today).
  // Key every bucket AND every booking on its LOCAL YYYY-MM-DD so the
  // +05:30 timezone shift can't push a booking into the wrong day
  // (which is why the bars read 0 while the history table showed payouts).
  // Use scheduledDate — the same field the history table is keyed on.
  const localDayKey = (d: Date) => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const profitData = useMemo(() => {
    const today = new Date();
    const buckets: { date: Date; day: string; key: string; profit: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      buckets.push({
        date: d,
        day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        key: localDayKey(d),
        profit: 0,
      });
    }
    completedBookings.forEach((b) => {
      const raw = b.scheduledDate || b.updatedAt || b.createdAt;
      if (!raw) return;
      const key = localDayKey(new Date(raw));
      const bkt = buckets.find((x) => x.key === key);
      if (bkt) bkt.profit += b.costBreakdown?.total || b.amount || 0;
    });
    return buckets.map((x) => ({ date: x.date, day: x.day, profit: Math.round(x.profit) }));
  }, [completedBookings]);

  // Daily completed-job count (last 7 LOCAL days → today)
  const jobsData = useMemo(() => {
    const today = new Date();
    const buckets: { date: Date; day: string; key: string; jobs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      buckets.push({
        date: d,
        day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        key: localDayKey(d),
        jobs: 0,
      });
    }
    completedBookings.forEach((b) => {
      const raw = b.scheduledDate || b.updatedAt || b.createdAt;
      if (!raw) return;
      const key = localDayKey(new Date(raw));
      const bkt = buckets.find((x) => x.key === key);
      if (bkt) bkt.jobs += 1;
    });
    return buckets;
  }, [completedBookings]);

  // Dropdown lets the user switch the chart between the two series
  const CHART_OPTIONS = [
    { id: "profit", label: "Profit" },
    { id: "jobs", label: "Completed Jobs" },
  ];
  const [chartType, setChartType] = useState<"profit" | "jobs">("profit");
  const chartData = chartType === "profit" ? profitData : jobsData;

  // Dropdown also lets the user switch chart style (area / bar — the
  // previous chart is reachable again here)
  const CHART_STYLE_OPTIONS = [
    { id: "area", label: "Area" },
    { id: "bar", label: "Bar" },
  ];
  const [chartStyle, setChartStyle] = useState<"area" | "bar">("area");
  const chartKey = chartType === "profit" ? "profit" : "jobs";
  if (!profileChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-container border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="flex h-screen items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-fixed text-xl font-bold text-on-primary-fixed-variant">
            <span className="material-symbols-outlined">build</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Become a Specialist</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Complete verification onboarding and add your professional skill tags before accepting bookings.
          </p>
          <button
            onClick={() => router.replace("/dashboard/specialist/onboarding")}
            className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/95 transition-all shadow-md cursor-pointer"
          >
            Start Verification
          </button>
        </div>
      </div>
    );
  }

  const isApproved = currentProfile.verificationStatus === "approved";
  const isPending = currentProfile.verificationStatus === "pending";

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 font-sans text-on-surface">

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Welcome back, {user?.name || "Specialist"}</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {isApproved ? "Your account is verified and active." : "Your profile is undergoing review."}
          </p>
        </div>

        {/* Availability Toggle Box */}
        {isApproved && (
          <div className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/60 px-4 py-2.5 rounded-2xl shadow-sm">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              {currentProfile.isAvailable ? "Listed Available" : "Unlisted Offline"}
            </span>
            <button
              onClick={() => handleAvailabilityToggle(!currentProfile.isAvailable)}
              disabled={isAvailabilitySaving}
              className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${
                currentProfile.isAvailable ? "bg-primary" : "bg-outline-variant"
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                  currentProfile.isAvailable ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Pending / rejected — dashboard hidden until approved */}
      {isPending && <VerificationPendingCard centered />}

      {currentProfile.verificationStatus === "rejected" && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex gap-3 text-sm items-start shadow-sm">
          <span className="material-symbols-outlined text-red-600">error</span>
          <div>
            <p className="font-bold">Verification Rejected</p>
            <p className="text-xs mt-0.5">Reason: {currentProfile.rejectionReason || "Please verify credentials"}.</p>
            <button
              onClick={() => router.push("/dashboard/specialist/onboarding")}
              className="text-xs font-bold text-primary underline mt-2"
            >
              Update Documents
            </button>
          </div>
        </div>
      )}

      {isApproved && (
      <div className="space-y-8">

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Earnings Card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm relative overflow-hidden group">
          <h3 className="text-on-surface-variant font-bold text-xs uppercase tracking-wider mb-2">Total Earnings</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-green-600">
              <CountUp to={Math.round(earnings.total)} prefix="₹" ready={countUpReady} />
            </span>
          </div>
          <div className="absolute right-4 bottom-4 opacity-5 text-primary">
            <span className="material-symbols-outlined text-5xl">payments</span>
          </div>
        </div>

        {/* Rating Card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm relative overflow-hidden">
          <h3 className="text-on-surface-variant font-bold text-xs uppercase tracking-wider mb-2">Rating</h3>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-on-surface">
              {reviews.length > 0 ? (
                <CountUp to={parseFloat(avgRating)} decimals={1} ready={countUpReady} />
              ) : (
                "—"
              )}
            </span>
            <span className="text-xs text-on-surface-variant font-semibold">/ 5.0</span>
            <div className="flex items-center text-primary ml-2">
              <span className="material-symbols-outlined text-lg font-fill" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">
            {reviews.length > 0 ? "Based on active feedback" : "No ratings yet"}
          </p>
        </div>

        {/* Completion Rate Card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm relative overflow-hidden">
          <h3 className="text-on-surface-variant font-bold text-xs uppercase tracking-wider mb-2">Completion Rate</h3>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-on-surface">
              <CountUp to={completionRate} decimals={0} suffix="%" ready={countUpReady} />
            </span>
            <span className="material-symbols-outlined text-tertiary ml-2 font-fill">check_circle</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">
            {allBookings.length > 0
              ? `${allBookings.filter((b) => b.status === "completed" || b.status === "cancelled").length} of ${allBookings.length} jobs`
              : "No bookings yet"}
          </p>
        </div>

        {/* Active Jobs Card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm relative overflow-hidden">
          <h3 className="text-on-surface-variant font-bold text-xs uppercase tracking-wider mb-2">Active Now</h3>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-on-surface">
              <CountUp to={activeNowCount} ready={countUpReady} />
            </span>
            <span className="text-xs text-on-surface-variant font-semibold">in progress</span>
            <span className="material-symbols-outlined text-primary ml-2 font-fill">bolt</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">
            {activeNowCount > 0 ? "Currently on the job" : "All clear"}
          </p>
        </div>
      </div>

      {/* Main Bento Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Active Requests list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              Active Requests
              {requests.length > 0 && (
                <span className="bg-primary-container text-on-primary-container text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {requests.length} New
                </span>
              )}
            </h3>
            <button
              onClick={() => router.push("/dashboard/specialist/bookings")}
              className="text-primary text-xs font-bold hover:underline flex items-center gap-1"
            >
              Bookings Manager
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>

          {requestsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div key={n} className="bg-surface-container-lowest h-36 rounded-2xl border border-outline-variant animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-outline mb-2">notifications_off</span>
              <p className="font-semibold text-sm">No new requests in your area right now.</p>
              <p className="text-xs text-gray-400 mt-1">Make sure availability toggle is switched ON to receive jobs.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-lg leading-tight">{req.clientName || "Client"}</p>
                      <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30 font-semibold uppercase">
                        {req.serviceType}
                      </span>
                    </div>
                    
                    <p className="text-xs text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-outline">location_on</span>
                      {req.address || req.clientAddress || "Hyderabad, India"}
                    </p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-outline">schedule</span>
                      Scheduled: {req.scheduledDate} ({req.scheduledTime})
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleDecline(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-6 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-low transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAccept(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === req.id ? "Accepting..." : "Accept"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalRequestPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-on-surface-variant">
                Showing {paginatedRequests.length} of {requests.length} requests
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                  disabled={requestPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                {Array.from({ length: totalRequestPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setRequestPage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      p === requestPage
                        ? "bg-primary text-white"
                        : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setRequestPage((p) => Math.min(totalRequestPages, p + 1))}
                  disabled={requestPage === totalRequestPages}
                  className="w-8 h-8 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer disabled:opacity-40"
                  aria-label="Next page"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Profit & Actions */}
        <div className="space-y-10">
          {/* Earnings chart (switchable via dropdown) */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2 sm:gap-3">
              <h3 className="text-on-surface font-bold text-base">
                {chartType === "profit" ? "Profit" : "Completed Jobs"}
              </h3>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className="hidden sm:inline text-xs text-on-surface-variant font-semibold">
                  Last 7 days
                </span>
                <BasicDropdown
                  label="Chart"
                  items={CHART_OPTIONS}
                  onChange={(item) => setChartType(item.id as "profit" | "jobs")}
                />
                <BasicDropdown
                  label="Style"
                  items={CHART_STYLE_OPTIONS}
                  onChange={(item) => setChartStyle(item.id as "area" | "bar")}
                />
              </div>
            </div>
            {chartStyle === "area" ? (
              <AreaChart data={chartData} xDataKey="date" aspectRatio="2 / 1" margin={{ top: 10, right: 14, bottom: 24, left: 14 }}>
                <Grid horizontal />
                <Area
                  dataKey={chartKey}
                  fill="#16a34a"
                  fillOpacity={0.35}
                  showMarkers
                  markers={{ radius: 5, ringGap: 2, strokeWidth: 2 }}
                />
                <XAxis tickMode="data" numTicks={4} />
                <ChartTooltip />
              </AreaChart>
            ) : (
              <BarChart data={chartData} xDataKey="day" aspectRatio="2 / 1" margin={{ top: 10, right: 14, bottom: 24, left: 14 }}>
                <Grid horizontal />
                <Bar dataKey={chartKey} fill="#16a34a" lineCap="round" />
                <BarXAxis />
                <ChartTooltip />
              </BarChart>
            )}
          </div>

          {/* Quick Actions buttons */}
          <div className="relative z-10 space-y-4">
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => router.push("/dashboard/specialist/bookings")}
                className="bg-primary-container text-on-primary-container p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 sm:gap-2.5 hover:opacity-95 transition-all shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-3xl font-fill">add_task</span>
                <span className="text-xs font-bold">New Task</span>
              </button>

              <button
                onClick={() => router.push("/dashboard/specialist/bookings")}
                className="bg-surface-container-low border border-outline-variant text-on-surface-variant p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 sm:gap-2.5 hover:bg-surface-container-high transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-3xl font-fill">calendar_month</span>
                <span className="text-xs font-bold">Schedule</span>
              </button>
            </div>
          </div>
        </div>

      </div>
      </div>
      )}
    </div>
  );
}
