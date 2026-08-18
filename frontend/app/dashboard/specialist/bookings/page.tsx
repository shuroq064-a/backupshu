"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import { servicesApi, workerApi, bookingApi, workerExtApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL as WS_BASE } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
import { BookingProgressCard } from "@/components/ui/BookingProgressCard";
import { useGpsTracking } from "@/components/tracking/GpsTrackingContext";
import dynamic from "next/dynamic";
import type { BookingDetail, BookingStatus, ServiceOption } from "@/types";
import { STATUS_META as SM } from "@/types";
import { AnimatedCheckmark } from "@/components/ui/AnimatedCheckmark";
import { OtpInput } from "@/components/interior/otp-input";
import { SpecialistBookingChatPopup } from "@/components/dashboard/specialist/SpecialistBookingChatPopup";
import { useConversationUnread } from "@/hooks/useConversationUnread";
import BackButton from "@/components/ui/BackButton";
import PaginationBar from "@/components/ui/PaginationBar";

const LiveTrackingMap = dynamic(() => import("@/components/tracking/LiveTrackingMap"), { ssr: false });

const SPECIALIST_ACTIONS: Record<string, { label: string; icon: string; next: string; color: string }> = {
   accepted: { label: "Start Journey",       icon: "directions_car", next: "started",   color: "bg-primary hover:bg-primary-container text-white" },
   started:  { label: "Arrived at Location", icon: "location_on",    next: "reached",   color: "bg-primary hover:bg-primary-container text-white" },
   reached:  { label: "Start Work",          icon: "build",          next: "ongoing",   color: "bg-primary hover:bg-primary-container text-white" },
   ongoing:  { label: "Mark Complete",       icon: "check_circle",   next: "completed", color: "bg-primary hover:bg-primary-container text-white" },
};

// Mirrors backend TRANSITIONS; used to silence already-terminal bookings so we
// never fire an unsupported status update that 422s.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
   upcoming:  ["accepted", "rejected", "cancelled"],
   accepted:  ["started", "cancelled"],
   started:   ["reached", "cancelled"],
   reached:   ["ongoing", "cancelled"],
   ongoing:   ["completed", "cancelled"],
};

const REQUESTS_PER_PAGE = 5;
const APPOINTMENTS_PER_PAGE = 6;
const HISTORY_PER_PAGE = 5;

export default function BookingsManagerPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, specialistProfile } = useAppSelector((s) => s.auth);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<BookingDetail[]>([]);
  const [activeJobs, setActiveJobs] = useState<BookingDetail[]>([]);
  const [appointments, setAppointments] = useState<BookingDetail[]>([]);
  const [completedJobs, setCompletedJobs] = useState<BookingDetail[]>([]);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  // ── OTP Modal State ──
  const [otpModalBooking, setOtpModalBooking] = useState<BookingDetail | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpStatus, setOtpStatus] = useState<"idle" | "checking" | "error" | "success">("idle");

  // ── Chat Popup State ──
  const [chatJob, setChatJob] = useState<BookingDetail | null>(null);
  const { unreadByBooking, clearBooking } = useConversationUnread("worker");

  // Keep the popup in sync with live booking updates: refresh the booking
  // snapshot while it stays active, and auto-close once it is no longer
  // active — either the status left the active set or the job disappeared
  // from `activeJobs` (completed jobs move to the history list).
  useEffect(() => {
    if (!chatJob) return;
    const fresh = activeJobs.find((b) => b.id === chatJob.id);
    if (!fresh) {
      setChatJob(null);
      return;
    }
    if (["accepted", "started", "reached", "ongoing"].includes(fresh.status)) {
      if (fresh !== chatJob) setChatJob(fresh);
    } else {
      setChatJob(null);
    }
  }, [activeJobs, chatJob]);

  // Auto-send GPS for the first active job in started/reached/ongoing status
  const activeTrackingJob = activeJobs.find(
    (j) => ["started", "reached", "ongoing"].includes(j.status)
  );
  const { startTracking, stopTracking } = useGpsTracking();

  useEffect(() => {
    if (activeTrackingJob) {
      startTracking(activeTrackingJob.id);
    }
    return () => stopTracking();
  }, [activeTrackingJob?.id]);

  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);

  const [requestPage, setRequestPage] = useState(1);
  const [apptPage, setApptPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [activePage, setActivePage] = useState(1);

  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const workerId = currentProfile?.id;

  // ── Pagination slices ──
  const requestPageCount = Math.max(1, Math.ceil(requests.length / REQUESTS_PER_PAGE));
  const pagedRequests = requests.slice(
    (Math.min(requestPage, requestPageCount) - 1) * REQUESTS_PER_PAGE,
    Math.min(requestPage, requestPageCount) * REQUESTS_PER_PAGE
  );

  const apptPageCount = Math.max(1, Math.ceil(appointments.length / APPOINTMENTS_PER_PAGE));
  const pagedAppointments = appointments.slice(
    (Math.min(apptPage, apptPageCount) - 1) * APPOINTMENTS_PER_PAGE,
    Math.min(apptPage, apptPageCount) * APPOINTMENTS_PER_PAGE
  );

  const historyPageCount = Math.max(1, Math.ceil(completedJobs.length / HISTORY_PER_PAGE));
  const pagedHistory = completedJobs.slice(
    (Math.min(historyPage, historyPageCount) - 1) * HISTORY_PER_PAGE,
    Math.min(historyPage, historyPageCount) * HISTORY_PER_PAGE
  );

  const activePageCount = Math.max(1, Math.ceil(activeJobs.length / 4));
  const pagedActiveJobs = activeJobs.slice(
    (Math.min(activePage, activePageCount) - 1) * 4,
    Math.min(activePage, activePageCount) * 4
  );

  // ── Load Profile ──
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchSpecialistProfile(user.id));
    }
  }, [user?.id, dispatch]);

  // Keep the latest workerId in a ref so the polling loop never depends on the
  // (frequently changing) `currentProfile` object reference. Re-dispatching
  // fetchSpecialistProfile inside loadData would otherwise update the store,
  // yield a new `currentProfile`, change loadData's identity, and restart the
  // interval on every tick — which looked like a "constantly refreshing" tab.
  const workerIdRef = useRef<string | null>(workerId);
  workerIdRef.current = workerId;

  // Track in-flight optimistic status updates so WebSocket refreshes never
  // revert a status the user already advanced.  Map<bookingId, nextStatus>.
  const pendingUpdatesRef = useRef<Map<string, string>>(new Map());

  // ── Fetch Bookings Data ──
  // `showLoading` is false for background/WebSocket refreshes so the UI
  // (incl. optimistic status updates) never flickers a full reload.
  const loadData = useCallback(async (showLoading = true) => {
    const liveWorkerId = workerIdRef.current;
    if (!liveWorkerId) return;
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      // Load independently: a failure in one call must not blank the others.
      const [allBookings, incoming] = await Promise.allSettled([
        // Fetch ALL of this specialist's bookings (no status filter) and categorize
        // client-side. Filtering by ?status=accepted alone dropped jobs that had
        // progressed to started/reached/ongoing, so they vanished after a refresh.
        workerExtApi.getBookings(liveWorkerId),
        workerExtApi.getRequests(liveWorkerId), // unassigned incoming requests
      ]);

      const bookings = allBookings.status === "fulfilled" ? allBookings.value : [];
      const reqs = incoming.status === "fulfilled" ? incoming.value : [];

      if (allBookings.status === "rejected") {
        console.error("Failed to load specialist bookings:", allBookings.reason);
      }
      if (incoming.status === "rejected") {
        console.error("Failed to load incoming requests:", incoming.reason);
        setLoadError("Could not load incoming requests. Tap refresh to retry.");
      }

      // Merge in any pending optimistic updates: if a booking has an in-flight
      // status update that the server hasn't committed yet, override the server
      // value with the optimistic one so the UI never reverts.
      const pending = pendingUpdatesRef.current;
      const merged = bookings.map((b) => {
        const optimistic = pending.get(b.id);
        return optimistic ? { ...b, status: optimistic as BookingStatus } : b;
      });

      // Categorize active, completed, upcoming appointments
      const active = merged.filter(
        (b) => b.status === "accepted" || b.status === "started" || b.status === "reached" || b.status === "ongoing"
      );
      const completed = merged.filter((b) => b.status === "completed" || b.status === "cancelled");
      const upcoming = reqs.filter((b) => b.status === "accepted" || b.status === "upcoming");
      const incomingRequests = reqs.filter((b) => b.status === "upcoming");

      // Clear any pending update whose server data now matches (i.e. the
      // backend has committed the change).
      pending.forEach((optimistic, id) => {
        const server = bookings.find((b) => b.id === id);
        if (!server || server.status === optimistic) pending.delete(id);
      });

      setActiveJobs(active);
      setCompletedJobs(completed);
      setAppointments(upcoming);
      setRequests(incomingRequests);
    } catch (err) {
      console.error("Failed to load specialist bookings:", err);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    if (workerId) {
      void loadData();
    }
  }, [workerId, loadData]);

  // ── Live updates via a single WebSocket per specialist (no polling).
  // The backend pushes NEW_REQUEST / BOOKING_UPDATED events to /ws/specialist/{id}
  // when a customer books a matching service or one of the specialist's bookings
  // changes status. We re-fetch only when a real event arrives, so the page never
  // flickers from a timer. Initial data load happens on connect + on worker change.
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let opened = false;

    const loadOnce = () => {
      if (!cancelled) void loadData(false);
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
        // Reconnect once if the tab is still alive and visible.
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
        // If the socket is still connecting (e.g. React StrictMode's dev
        // double-invoke), closing it now triggers a browser warning. Defer the
        // close until it actually opens so we never close a not-yet-open socket.
        if (opened) {
          ws.close();
        } else {
          ws.onopen = () => ws?.close();
        }
      }
    };
  }, [workerId, loadData]);

  // ── Status Updates ──
  async function handleStatusUpdate(bookingId: string, nextStatus: string) {
    // Guard: never fire an unsupported transition (e.g. on an already-completed
    // or cancelled booking). This prevents spurious 422s from the backend.
    const current = activeJobs.find((b) => b.id === bookingId)?.status
      ?? appointments.find((b) => b.id === bookingId)?.status;
    if (current && !ALLOWED_TRANSITIONS[current]?.includes(nextStatus)) {
      return;
    }

    // OTP gate: reached → ongoing requires OTP input
    if (current === "reached" && nextStatus === "ongoing") {
      const job = activeJobs.find((b) => b.id === bookingId)
        ?? appointments.find((b) => b.id === bookingId);
      if (job) {
        setOtpModalBooking(job);
        setOtpValue("");
        setOtpStatus("idle");
      }
      return;
    }

    setStatusUpdating(bookingId);
    // Register the optimistic status so WebSocket-triggered loadData merges it
    // back instead of reverting to the old server value.
    pendingUpdatesRef.current.set(bookingId, nextStatus);
    try {
      await bookingApi.updateStatus(bookingId, nextStatus);
      showToast(
        nextStatus === "completed" ? "Job completed successfully!" : `Job status progressed to: ${SM[nextStatus]?.label || nextStatus}`,
        nextStatus === "completed" ? "success" : "info"
      );
      // Optimistically update the local job so the stepper/UI reflects the new
      // status instantly — no full data re-fetch (which caused a visible refresh).
      setActiveJobs((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: nextStatus as BookingStatus } : b))
      );
    } catch (err) {
      // On failure, remove the optimistic entry so loadData can restore the
      // real server status on the next refresh.
      pendingUpdatesRef.current.delete(bookingId);
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setStatusUpdating(null);
    }
  }

  // ── OTP Submit ──
  async function handleOtpSubmit() {
    if (!otpModalBooking || otpValue.length !== 4) return;
    setOtpStatus("checking");
    setStatusUpdating(otpModalBooking.id);
    try {
      await bookingApi.updateStatus(otpModalBooking.id, "ongoing", undefined, otpValue);
      setOtpStatus("success");
      showToast("Work started! OTP verified.", "success");
      setActiveJobs((prev) =>
        prev.map((b) => (b.id === otpModalBooking.id ? { ...b, status: "ongoing" as BookingStatus } : b))
      );
      setTimeout(() => {
        setOtpModalBooking(null);
        setOtpValue("");
        setOtpStatus("idle");
      }, 1500);
    } catch (err) {
      setOtpStatus("error");
      showToast(err instanceof Error ? err.message : "Invalid OTP. Ask client for the new code.", "error");
    } finally {
      setStatusUpdating(null);
    }
  }

  // ── Incoming Request Actions ──
  async function handleAccept(bookingId: string) {
    setStatusUpdating(bookingId);
    try {
      await bookingApi.updateStatus(bookingId, "accepted");
      showToast("Booking accepted! Client has been notified.", "success");
      setRequests((prev) => prev.filter((b) => b.id !== bookingId));
      await loadData(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to accept booking", "error");
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleDecline(bookingId: string) {
    setStatusUpdating(bookingId);
    try {
      await bookingApi.updateStatus(bookingId, "rejected", "Specialist declined request");
      showToast("Booking request declined.", "info");
      setRequests((prev) => prev.filter((b) => b.id !== bookingId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to decline booking", "error");
    } finally {
      setStatusUpdating(null);
    }
  }

  const profileServices = currentProfile?.services ?? [];
  const hasPendingSkill = currentProfile?.hasPendingSkill ?? false;
  const canAddSkill = profileServices.length < 5 && !hasPendingSkill;

  if (!currentProfile) {
    return (
      <div className="flex h-screen items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-fixed text-xl font-bold text-on-primary-fixed-variant">
            <span className="material-symbols-outlined">build</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Become a Specialist</h1>
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

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 font-sans text-on-surface">

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-outline-variant/60 pb-5">
        <div className="flex items-center gap-2">
          <BackButton label="" fallback="/dashboard/specialist" className="px-1.5 py-1.5 shrink-0" />
          <div>
            <h2 className="text-2xl font-bold text-on-surface">Bookings Manager</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Manage your professional schedule, update active bookings, and track earnings history.
            </p>
          </div>
        </div>
        <button
          onClick={() => showToast("Manual booking insertion is restricted to client dispatcher mode.", "info")}
          className="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Manual Entry
        </button>
      </div>

      {/* Pending — hide bookings until admin approves */}
      {currentProfile.verificationStatus === "pending" && (
        <VerificationPendingCard centered />
      )}

      {currentProfile.verificationStatus === "approved" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Active Jobs & History */}
        <div className="lg:col-span-2 space-y-8">

          {/* Active Jobs — single unified box at the top (only when there is an active job) */}
          {loading ? (
            <div className="bg-surface-container-lowest h-44 rounded-2xl animate-pulse" />
          ) : activeJobs.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-on-surface">Active Jobs</h3>
                <span className="px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold">
                  {activeJobs.length} Ongoing
                </span>
              </div>
              <div className="rounded-2xl bg-surface-container px-4 py-5 border border-outline-variant/60">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Booking Progress
                  </p>
                  <span className="text-xs font-semibold text-primary">
                    {SM[activeJobs[0].status]?.label || activeJobs[0].status}
                  </span>
                </div>
                <BookingProgressCard booking={activeJobs[0]} />
              </div>

              <div className="space-y-4 pt-1">
                {pagedActiveJobs.map((job) => {
                  const action = SPECIALIST_ACTIONS[job.status];
                  return (
                    <div
                      key={job.id}
                      className="border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col gap-5 bg-surface-container-lowest"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-primary uppercase tracking-wider">
                              {SM[job.status]?.label || job.status}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">
                              ID: {job.id.slice(0, 8)}
                            </span>
                          </div>
                          <h4 className="font-bold text-gray-900 text-lg leading-tight">
                            {job.serviceType}
                          </h4>
                          <div className="space-y-1.5 text-xs text-on-surface-variant">
                            <p className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm text-outline">person</span>
                              Client: {job.clientName}
                            </p>
                            <p className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm text-outline">location_on</span>
                              Address: {job.address || job.clientAddress || "Hyderabad, India"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2.5 shrink-0 items-center w-full sm:w-auto md:ml-auto">
                          <button
                             onClick={() => { setChatJob(job); clearBooking(job.id); }}
                             className="relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant text-primary hover:bg-primary-container/30 rounded-xl transition-all cursor-pointer"
                             aria-label="Chat"
                           >
                             <span className="material-symbols-outlined text-[18px]">chat</span>
                             <span className="text-xs font-bold">Chat</span>
                             {chatJob?.id !== job.id && (unreadByBooking[job.id] || 0) > 0 && (
                               <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                                 {unreadByBooking[job.id] > 9 ? "9+" : unreadByBooking[job.id]}
                               </span>
                             )}
                           </button>
                          {["accepted", "started", "reached", "ongoing"].includes(job.status) && (
                            <LiveTrackingMap
                              booking={job}
                              role="specialist"
                              onClose={() => {}}
                            />
                          )}
                          {action && (
                            <button
                              onClick={() => handleStatusUpdate(job.id, action.next)}
                              disabled={!!statusUpdating}
                              className={`flex-1 sm:flex-none px-6 py-3 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${
                                statusUpdating
                                  ? "opacity-50 cursor-not-allowed"
                                  : "active:scale-95 cursor-pointer"
                              } ${action.color}`}
                            >
                              <span className={`material-symbols-outlined text-[16px] ${statusUpdating ? "animate-spin" : ""}`}>
                                {statusUpdating ? "progress_activity" : action.icon}
                              </span>
                              {statusUpdating ? "Updating..." : action.label}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <PaginationBar
                  page={Math.min(activePage, activePageCount)}
                  pageCount={activePageCount}
                  perPage={4}
                  total={activeJobs.length}
                  onPage={setActivePage}
                />
              </div>
            </div>
          )}

          {/* Incoming Requests — Service Request Cards (after Active Jobs) */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-on-surface">Incoming Requests</h3>
              {requests.length > 0 && (
                <span className="px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold">
                  {requests.length} New
                </span>
              )}
              <button
                onClick={() => void loadData()}
                className="ml-auto flex items-center gap-1 rounded-lg border border-outline-variant px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors"
                aria-label="Refresh requests"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="bg-surface-container-lowest h-36 rounded-2xl animate-pulse" />
            ) : requests.length === 0 ? (
              <div className="text-center py-10 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl text-outline mb-2">notifications_off</span>
                <p className="font-semibold text-sm">No new requests right now.</p>
                <p className="text-xs text-gray-400 mt-1">Make sure your availability is switched ON to receive jobs.</p>
                {loadError && (
                  <button
                    onClick={() => void loadData()}
                    className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90"
                  >
                    {loadError} Retry
                  </button>
                )}
              </div>
            ) : (
               <div className="mt-4 space-y-4">
                {pagedRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-lg shrink-0">
                        {(req.clientName || "C")[0]}
                      </div>
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 text-lg leading-tight truncate">{req.clientName || "Client"}</p>
                          <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30 font-semibold uppercase">
                            {req.serviceType}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container text-[10px] font-extrabold uppercase tracking-wide">
                            New
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-outline">location_on</span>
                          {req.address || req.clientAddress || "Hyderabad, India"}
                        </p>
                        <p className="text-xs text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-outline">schedule</span>
                          {req.scheduledDate} · {req.scheduledTime}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2.5 shrink-0 w-full sm:w-auto md:ml-auto">
                      <button
                        onClick={() => handleDecline(req.id)}
                        disabled={!!statusUpdating}
                        className={`flex-1 sm:flex-none justify-center px-6 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl text-xs font-bold transition-colors ${
                          statusUpdating ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-container-low cursor-pointer"
                        }`}
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAccept(req.id)}
                        disabled={!!statusUpdating}
                        className={`flex-1 sm:flex-none justify-center px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold transition-all shadow-md ${
                          statusUpdating ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/90 cursor-pointer"
                        }`}
                      >
                        {statusUpdating ? "Working..." : "Accept"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <PaginationBar
              page={Math.min(requestPage, requestPageCount)}
              pageCount={requestPageCount}
              perPage={REQUESTS_PER_PAGE}
              total={requests.length}
              onPage={setRequestPage}
            />

          </div>

          {/* Job History Table */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Job History</h3>
            
            {loading ? (
              <div className="bg-surface-container-lowest h-64 rounded-2xl animate-pulse" />
            ) : completedJobs.length === 0 ? (
              <div className="text-center py-10 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
                <p className="font-semibold text-sm">No transaction history found.</p>
              </div>
            ) : (
              <>
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
                {/* Mobile: card layout */}
                <div className="sm:hidden divide-y divide-outline-variant/40">
                  {pagedHistory.map((job) => (
                    <div key={job.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-on-surface text-sm">{job.clientName}</span>
                        <span className="px-2.5 py-1 bg-green-600/15 text-green-600 text-[10px] font-extrabold rounded-full uppercase">
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-on-surface-variant">
                        <span>{job.serviceType}</span>
                        <span className="text-gray-500">{job.scheduledDate}</span>
                      </div>
                      <p className="text-sm font-bold text-primary">₹{job.costBreakdown?.total || job.amount || 100}</p>
                    </div>
                  ))}
                </div>
                {/* Desktop: table layout */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-container/50 border-b border-outline-variant text-on-surface-variant font-bold uppercase tracking-wider">
                        <th className="p-4">Date</th>
                        <th className="p-4">Client</th>
                        <th className="p-4">Service</th>
                        <th className="p-4">Payout</th>
                        <th className="p-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/40">
                       {pagedHistory.map((job) => (
                        <tr key={job.id} className="hover:bg-surface-container-lowest/50 transition-colors">
                          <td className="p-4 font-semibold text-gray-500">{job.scheduledDate}</td>
                          <td className="p-4 font-bold text-on-surface">{job.clientName}</td>
                          <td className="p-4">{job.serviceType}</td>
                          <td className="p-4 font-bold text-primary">₹{job.costBreakdown?.total || job.amount || 100}</td>
                           <td className="p-4">
                             <span className="px-2.5 py-1 bg-green-600/15 text-green-600 text-[10px] font-extrabold rounded-full uppercase">
                               {job.status}
                             </span>
                           </td>
                        </tr>
                      ))}
                    </tbody>
                   </table>
                 </div>
               </div>
               <PaginationBar
                 page={Math.min(historyPage, historyPageCount)}
                 pageCount={historyPageCount}
                 perPage={HISTORY_PER_PAGE}
                 total={completedJobs.length}
                 onPage={setHistoryPage}
               />
               </>
             )}
          </div>

        </div>

        {/* Right Column: Appointments & Manage Services */}
        <div className="space-y-8">
          
          {/* Appointments list */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Appointments</h3>
            
            {loading ? (
              <div className="h-48 animate-pulse bg-surface-container rounded-2xl" />
            ) : appointments.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No appointments scheduled.</p>
            ) : (
               <div className="space-y-4 relative pl-3 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant/60">
                {pagedAppointments.map((app) => (
                  <div
                    key={app.id}
                    className="flex gap-4 group cursor-pointer hover:bg-primary/5 p-2 rounded-xl transition-all"
                  >
                    <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 bg-surface-container rounded-xl border border-outline-variant/40">
                      <span className="text-xs font-bold text-on-surface">{app.scheduledTime.split(" ")[0]}</span>
                      <span className="text-[9px] text-on-surface-variant font-bold uppercase">{app.scheduledTime.split(" ")[1] || "PM"}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">
                        {app.clientName}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">{app.serviceType} Diagnostic</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <PaginationBar
              page={Math.min(apptPage, apptPageCount)}
              pageCount={apptPageCount}
              perPage={APPOINTMENTS_PER_PAGE}
              total={appointments.length}
              onPage={setApptPage}
            />
           </div>

           {/* Manage Services (Skills) */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">Manage Services</h3>
              {canAddSkill && (
                <button
                  onClick={() => setIsSkillModalOpen(true)}
                  className="text-primary text-xs font-bold hover:underline"
                >
                  + Add
                </button>
              )}
            </div>

            {profileServices.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No verified services added.</p>
            ) : (
              <div className="divide-y divide-outline-variant/40">
                {profileServices.map((srv) => (
                  <div key={srv.service_id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">construction</span>
                      </div>
                      <div>
                        <p className="font-bold text-sm text-on-surface">{srv.service_name}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{srv.status || "verified"}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-green-600/15 text-green-600 text-[10px] font-bold rounded-full uppercase">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
      )}

      {/* Add Skill Modal Component */}
      {isSkillModalOpen && (
        <AddSkillModal
          currentServices={profileServices}
          workerId={workerId || ""}
          onClose={() => setIsSkillModalOpen(false)}
          onSuccess={async () => {
            setIsSkillModalOpen(false);
            if (user?.id) {
              await dispatch(fetchSpecialistProfile(user.id));
            }
            await loadData();
          }}
        />
      )}

      {/* Chat popup */}
      {chatJob && (
        <SpecialistBookingChatPopup
          booking={chatJob}
          currentUser={user}
          onClose={() => setChatJob(null)}
        />
      )}

      {/* OTP Verification Modal — reached → ongoing */}
      {otpModalBooking && (        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[6px] p-4 animate-fade-in"
          onClick={() => { setOtpModalBooking(null); setOtpValue(""); setOtpStatus("idle"); }}
        >
          <div
            className="bg-surface-container-lowest rounded-[28px] w-full max-w-[440px] overflow-hidden shadow-[0_24px_80px_-12px_rgba(0,0,0,0.4),0_8px_24px_-8px_rgba(0,0,0,0.25)] animate-pop-in relative"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="otp-title"
          >
            {otpStatus === "success" ? (
              /* ── Success State ── */
              <div className="flex flex-col items-center gap-5 px-10 py-14">
                <div className="relative">
                  <div className="absolute -inset-3 rounded-full bg-primary/10 blur-xl" />
                  <AnimatedCheckmark size={80} />
                </div>
                <div className="space-y-1 text-center">
                  <h3 className="text-xl font-bold text-on-surface">OTP Verified!</h3>
                  <p className="text-sm text-on-surface-variant">Starting work now…</p>
                </div>
              </div>
            ) : (
              <>
                {/* ── Gradient Header ── */}
                <div
                  className="relative px-7 pt-8 pb-10 text-center overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 100%, #000 0%), color-mix(in srgb, var(--color-primary-container) 100%, #000 0%))",
                  }}
                >
                  {/* Decorative circles */}
                  <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/[0.07]" />
                  <div className="absolute -bottom-14 -left-14 h-40 w-40 rounded-full bg-white/[0.05]" />
                  <div className="absolute top-6 right-8 h-5 w-5 rounded-full bg-white/[0.1]" />

                  <div className="relative">
                    <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-white/[0.18] backdrop-blur-sm shadow-lg shadow-black/10">
                      <span
                        className="text-3xl text-white material-symbols-outlined"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        lock_open
                      </span>
                    </div>
                    <h2 id="otp-title" className="text-white font-bold text-[22px] tracking-tight">Enter OTP</h2>
                    <p className="text-white/70 text-sm mt-1.5">Ask the client for the code</p>
                  </div>
                </div>

                {/* ── Body ── */}
                <div className="px-7 pt-7 pb-7">
                  {/* OTP Input */}
                  <div className="flex justify-center">
                    <OtpInput
                      length={4}
                      mode="numeric"
                      autoFocus
                      disabled={otpStatus === "checking"}
                      status={otpStatus === "error" ? "error" : "idle"}
                      errorMessage={otpStatus === "error" ? "Invalid or expired code." : ""}
                      hint=""
                      groupEvery={4}
                      onChange={(v) => { setOtpValue(v); if (otpStatus === "error") setOtpStatus("idle"); }}
                      onComplete={(v) => { setOtpValue(v); }}
                    />
                  </div>

                  {/* Hint text */}
                  <p className="mt-4 text-center text-xs text-on-surface-variant/70 leading-relaxed">
                    Ask the client to share the OTP shown in their booking details section
                  </p>

                  {/* Buttons */}
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => { setOtpModalBooking(null); setOtpValue(""); setOtpStatus("idle"); }}
                      className="flex-1 py-3.5 border border-outline-variant text-on-surface-variant rounded-2xl text-sm font-semibold hover:bg-surface-container-low hover:border-outline transition-all active:scale-[0.97] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleOtpSubmit}
                      disabled={otpValue.length !== 4 || otpStatus === "checking"}
                      className={`flex-1 py-3.5 rounded-2xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        otpValue.length !== 4 || otpStatus === "checking"
                          ? "bg-surface-container-highest text-on-surface-variant/50 cursor-not-allowed"
                          : "bg-primary text-on-primary hover:bg-primary-container hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
                      }`}
                    >
                      {otpStatus === "checking" ? (
                        <>
                          <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                          Verifying…
                        </>
                      ) : (
                        "Start Work"
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Supporting Skill Modal ──
function AddSkillModal({
  currentServices,
  workerId,
  onClose,
  onSuccess,
}: {
  currentServices: { service_id: string }[];
  workerId: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [allServices, setAllServices] = useState<ServiceOption[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ICONS: Record<string, string> = {
    Electrical: "bolt",
    Plumbing: "plumbing",
    Carpentry: "handyman",
    Painting: "format_paint",
    "AC Repair": "ac_unit",
    Massage: "spa",
    Cleaning: "cleaning_services",
    Gardening: "yard",
  };

  useEffect(() => {
    servicesApi
      .getServices()
      .then(setAllServices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load services"));
  }, []);

  const available = allServices.filter((s) => !currentServices.some((cs) => cs.service_id === s.id));

  async function handleSubmit() {
    if (!selected) return;
    setIsSubmitting(true);
    setError("");
    try {
      await workerApi.addService(workerId, selected);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add skill");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-6 shadow-2xl border border-outline-variant/60 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Another Skill</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Pick a service to offer. It goes to admin for approval.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 max-h-60 overflow-y-auto p-1">
          {available.map((s) => {
            const selectedNow = selected === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`relative flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  selectedNow
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-outline-variant hover:border-primary-fixed-dim text-on-surface"
                }`}
              >
                {selectedNow && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined text-[12px] leading-none">check</span>
                  </span>
                )}
                <span className="material-symbols-outlined text-2xl">{ICONS[s.name] || "work"}</span>
                <span className="text-[11px] font-bold text-center truncate w-full">{s.name}</span>
              </button>
            );
          })}
        </div>

        {!available.length && (
          <p className="text-sm text-on-surface-variant mb-5 text-center">No additional services available at this time.</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-outline text-on-surface-variant font-bold text-xs rounded-xl hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selected || isSubmitting}
            className="flex-1 py-3 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 disabled:opacity-50 cursor-pointer shadow-md transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
