"use client";

import { useState, useEffect, useRef } from "react";
import { useAppSelector } from "@/store";
import { bookingApi } from "@/lib/api";
import { WS_BASE_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import type { BookingDetail } from "@/types";
import { STATUS_META } from "@/types";
import { BookingDetailModal } from "@/components/dashboard/client/BookingDetailModal";
import { ReviewForm } from "@/components/dashboard/client/ReviewForm";
import { BookingProgressCard } from "@/components/ui/BookingProgressCard";
import { useToast } from "@/components/ui/Toast";
import {
  Calendar,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarTable,
  CalendarTableDays,
  CalendarViewControl,
  CalendarViewDate,
  CalendarWeekDays,
} from "@/components/ui/calendar";
import { useRouter } from "next/navigation";
import { parseDate } from "@internationalized/date";

const WS_BASE = WS_BASE_URL;

const SERVICE_ICONS: Record<string, string> = {
  Plumbing: "🔧", Electrical: "⚡", "AC Repair": "❄️",
  Carpenter: "🪚", Massage: "🪷", Cleaning: "🧹", plumbing: "🔧",
  electrical: "⚡", General: "🔨", painting: "🖌️", Design: "🖌️"
};

const SERVICE_ICONS_OUTLINED: Record<string, string> = {
  Plumbing: "plumbing", Electrical: "bolt", "AC Repair": "ac_unit",
  Carpenter: "construction", Massage: "spa", Cleaning: "clean_hands",
  plumbing: "plumbing", electrical: "bolt", General: "build",
  painting: "brush", Design: "brush"
};

const STATUS_PROGRESS: Record<string, number> = {
  upcoming: 15,
  accepted: 35,
  started: 55,
  reached: 75,
  ongoing: 90,
  completed: 100,
  rejected: 0,
  cancelled: 0
};

export default function ClientBookingsPage() {
  const router = useRouter();
  const { user } = useAppSelector(s => s.auth);
  const { toast, showToast, dismiss } = useToast();

  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "upcoming" | "completed">("all");
  const [page, setPage] = useState(1);
  function handleTabChange(tab: "all" | "active" | "upcoming" | "completed") {
    setActiveTab(tab);
    setPage(1);
  }
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);

  const PAGE_SIZE = 5;

  // Review modal
  const [reviewBooking, setReviewBooking] = useState<BookingDetail | null>(null);

  // WebSocket refs for live status per booking
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());

  // ── Fetch real bookings ───────────────────────────────────────────────────
  async function loadBookings() {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const data = await bookingApi.getMyBookings(user.id);
      setBookings(data);
      setPage(1);
    } catch (err) {
      console.error(err);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadBookings(); }, [user?.id]);

  // Open/close WebSockets based on the current bookings list. Sockets are only
  // opened for active bookings and only closed when the booking is no longer
  // active or the component truly unmounts — this avoids the dev StrictMode /
  // Fast-Refresh cycle from closing live sockets the moment they connect.
  useEffect(() => {
    const ACTIVE = ["upcoming", "accepted", "started", "reached", "ongoing"];
    bookings.forEach(b => {
      if (ACTIVE.includes(b.status)) openWs(b.id);
    });
    // Close sockets for bookings that are no longer active.
    wsRefs.current.forEach((ws, id) => {
      if (!bookings.some(b => b.id === id && ACTIVE.includes(b.status))) {
        (ws as unknown as { _safeClose?: () => void })._safeClose?.();
        wsRefs.current.delete(id);
      }
    });
  }, [bookings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRefs.current.forEach(ws =>
        (ws as unknown as { _safeClose?: () => void })._safeClose?.()
      );
    };
  }, []);

  function openWs(bookingId: string) {
    if (wsRefs.current.has(bookingId)) return;
    const token = getToken();
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    const query = params.toString();
    const ws = new WebSocket(
      `${WS_BASE}/ws/bookings/${encodeURIComponent(bookingId)}${query ? `?${query}` : ""}`
    );
    // Track whether the socket has finished connecting. Closing a socket that is
    // still in CONNECTING throws a browser warning ("closed before the connection
    // is established"), which happens under React StrictMode's dev double-invoke.
    // Defer the close until it opens to avoid that noisy error.
    let opened = false;
    ws.onopen = () => { opened = true; };
    const safeClose = () => {
      if (opened) ws.close();
      else ws.onopen = () => ws.close();
    };
    (ws as unknown as { _safeClose?: () => void })._safeClose = safeClose;
    wsRefs.current.set(bookingId, ws);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type !== "STATUS_UPDATE") return;

        // Update booking status in state
        setBookings(prev => prev.map(b =>
          b.id === data.bookingId ? { ...b, status: data.status } : b
        ));

        const msg =
          data.status === "accepted"  ? `${data.specialistName || "Specialist"} accepted your request!` :
          data.status === "started"   ? `${data.specialistName || "Specialist"} is on the way!` :
          data.status === "reached"   ? `Specialist has arrived!` :
          data.status === "ongoing"   ? `Work has started!` :
          data.status === "completed" ? `Job complete! Please rate your experience.` :
          null;

        if (msg) showToast(msg, data.status === "completed" ? "success" : "info");

        // On complete/cancel — close WS and prompt review
        if (data.status === "completed" || data.status === "cancelled") {
          safeClose();
          wsRefs.current.delete(bookingId);
          if (data.status === "completed") {
            setBookings(prev => {
              const b = prev.find(x => x.id === bookingId);
              if (b && !b.customerRating) setReviewBooking({ ...b, status: "completed" });
              return prev;
            });
          }
        }
      } catch {}
    };

    // If the socket fails (e.g. transient network blip), drop it so a later
    // render can reopen it instead of being stuck in a dead state.
    ws.onerror = () => {
      wsRefs.current.delete(bookingId);
    };

    ws.onclose = () => wsRefs.current.delete(bookingId);
  }

  // Filter lists based on tab choice
  const activeBookings = bookings.filter(b => ["accepted", "started", "reached", "ongoing"].includes(b.status));
  const upcomingBookings = bookings.filter(b => b.status === "upcoming");
  const completedBookings = bookings.filter(b => ["completed", "cancelled", "rejected"].includes(b.status));

  // Spend metrics summary (sum of all completed bookings)
  const totalSpend = completedBookings
    .filter(b => b.status === "completed")
    .reduce((sum, b) => sum + (b.amount || 0), 0);

  // ── Pagination (per visible list, shared page state) ──
  function paginate<T>(items: T[]) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const current = Math.min(page, totalPages);
    const slice = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    return { slice, totalPages, current };
  }
  const activePages = paginate(activeBookings);
  const upcomingPages = paginate(upcomingBookings);
  const completedPages = paginate(completedBookings);

  async function handleOpenBooking(booking: BookingDetail) {
    try {
      const detail = await bookingApi.getById(booking.id);
      setSelectedBooking(detail);
    } catch {
      setSelectedBooking(booking);
    }
  }

  function handleReviewSuccess(bookingId: string) {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, customerRating: reviewBooking?.customerRating || 5 } : b
    ));
    setReviewBooking(null);
    showToast("Thank you for your review! 🌟", "success");
    loadBookings();
  }

  function handleRebook(booking: BookingDetail) {
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(`I need a ${booking.serviceType} at ${booking.address}`)}`);
  }

  return (
      <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto space-y-6 sm:space-y-8 animate-fade-in-up">

      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-outline-variant/60">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">My Bookings</h1>
          <p className="text-sm text-on-surface-variant mt-1.5">Manage your active progress, upcoming tasks, and transaction history.</p>
        </div>
        {/* Quick Filter Buttons */}
        <div className="flex bg-surface-container-low p-1 rounded-xl shadow-inner border border-outline-variant/30 shrink-0 overflow-x-auto max-md:w-full">
          {(["all", "active", "upcoming", "completed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-5 py-2 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab
                  ? "bg-surface-container-lowest text-primary shadow-sm border border-black/5"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Services list (col-span-8) */}
          <div className="lg:col-span-8 space-y-8">
            {/* Active Bookings (Only show when active tab is all or active) */}
            {(activeTab === "all" || activeTab === "active") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
                    <h2 className="text-lg font-bold text-gray-900 tracking-tight">Active Services</h2>
                  </div>
                  {activeBookings.length > 0 && (
                    <span className="text-xs font-medium text-on-surface-variant">
                      {activeBookings.length} total · Page {activePages.current} of {activePages.totalPages}
                    </span>
                  )}
                </div>

                {activeBookings.length === 0 ? (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 text-center text-on-surface-variant text-sm">
                    No active services currently in progress.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activePages.slice.map(b => (
                      <ActiveBookingCard
                        key={b.id}
                        booking={b}
                        onViewDetails={() => handleOpenBooking(b)}
                        onChat={() => router.push(`/dashboard/client/chat`)}
                      />
                    ))}
                  </div>
                )}

                {activePages.totalPages > 1 && (
                  <Pager
                    current={activePages.current}
                    totalPages={activePages.totalPages}
                    onPage={(p) => setPage(p)}
                  />
                )}
              </div>
            )}

            {/* Upcoming Appointments (Only show when tab is all or upcoming) */}
            {(activeTab === "all" || activeTab === "upcoming") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary-container"></span>
                    <h2 className="text-lg font-bold text-gray-900 tracking-tight">Upcoming Appointments</h2>
                  </div>
                  {upcomingBookings.length > 0 && (
                    <span className="text-xs font-medium text-on-surface-variant">
                      {upcomingBookings.length} total · Page {upcomingPages.current} of {upcomingPages.totalPages}
                    </span>
                  )}
                </div>

                {upcomingBookings.length === 0 ? (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 text-center text-on-surface-variant text-sm">
                    No upcoming scheduled bookings.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingPages.slice.map(b => (
                      <UpcomingBookingRow
                        key={b.id}
                        booking={b}
                        onClick={() => handleOpenBooking(b)}
                      />
                    ))}
                  </div>
                )}

                {upcomingPages.totalPages > 1 && (
                  <Pager
                    current={upcomingPages.current}
                    totalPages={upcomingPages.totalPages}
                    onPage={(p) => setPage(p)}
                  />
                )}
              </div>
            )}

            {/* If tab is Completed, list them in main pane (paginated) */}
            {activeTab === "completed" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900 tracking-tight">Booking History</h2>
                  {completedBookings.length > 0 && (
                    <span className="text-xs font-medium text-on-surface-variant">
                      {completedBookings.length} total · Page {completedPages.current} of {completedPages.totalPages}
                    </span>
                  )}
                </div>
                {completedBookings.length === 0 ? (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 text-center text-on-surface-variant text-sm">
                    No past bookings.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedPages.slice.map(b => (
                      <HistoryBookingItem
                        key={b.id}
                        booking={b}
                        onRebook={() => handleRebook(b)}
                        onReview={() => setReviewBooking(b)}
                        onClick={() => handleOpenBooking(b)}
                      />
                    ))}
                  </div>
                )}

                {/* Pagination controls */}
                {completedPages.totalPages > 1 && (
                  <Pager
                    current={completedPages.current}
                    totalPages={completedPages.totalPages}
                    onPage={(p) => setPage(p)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Right Column: Sidebar metrics, history & mini calendar (col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Total Spend Summary Card */}
            <div className="bg-primary text-white rounded-3xl p-6 shadow-lg shadow-primary/10 relative overflow-hidden group">
              <div className="relative z-10 space-y-1">
                <h3 className="text-xs uppercase tracking-widest font-bold text-teal-100/70">Total Value</h3>
                <p className="text-3xl font-extrabold">₹{totalSpend.toLocaleString()}</p>
                <div className="pt-3 text-[10px] text-teal-100/90 font-medium">
                  <span className="bg-white/10 px-2 py-1 rounded-md">
                    📈 {completedBookings.filter(b => b.status === "completed").length} jobs completed
                  </span>
                </div>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10 text-[120px] font-fill select-none material-symbols-outlined transition-transform duration-700 group-hover:scale-110" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_balance_wallet
              </div>
            </div>

            {/* Booking History (Only in right sidebar if not showing Completed Tab) */}
            {activeTab !== "completed" && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent History</h3>
                  <button onClick={() => setActiveTab("completed")} className="text-xs font-bold text-primary hover:underline">See All</button>
                </div>
                <div className="space-y-4.5">
                  {completedBookings.slice(0, 3).map(b => (
                    <HistoryRowItem
                      key={b.id}
                      booking={b}
                      onRebook={() => handleRebook(b)}
                      onReview={() => setReviewBooking(b)}
                    />
                  ))}
                  {completedBookings.length === 0 && (
                    <p className="text-xs text-on-surface-variant text-center py-2">No past history found.</p>
                  )}
                </div>
              </div>
            )}

            {/* Mini Calendar Card */}
            <MiniCalendar bookings={bookings} />
          </div>
        </div>
      )}

      {selectedBooking && (
        <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
      )}

      {reviewBooking && !reviewBooking.customerRating && (
        <ReviewForm
          bookingId={reviewBooking.id}
          bookingNumber={reviewBooking.bookingNumber}
          serviceType={reviewBooking.serviceType}
          specialistName={reviewBooking.specialist?.name || "Specialist"}
          onSuccess={() => handleReviewSuccess(reviewBooking.id)}
          onSkip={() => setReviewBooking(null)}
        />
      )}
    </div>
  );
}

// ── Reusable Pagination Controls ──────────────────────────────────────────────

function Pager({ current, totalPages, onPage }: {
  current: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        onClick={() => onPage(Math.max(1, current - 1))}
        disabled={current === 1}
        className="flex items-center justify-center w-9 h-9 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        aria-label="Previous page"
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`w-9 h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            p === current
              ? "bg-primary text-white shadow-sm"
              : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => onPage(Math.min(totalPages, current + 1))}
        disabled={current === totalPages}
        className="flex items-center justify-center w-9 h-9 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        aria-label="Next page"
      >
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </div>
  );
}

// ── Sub-components for Bookings Page ──────────────────────────────────────────

function ActiveBookingCard({ booking, onViewDetails, onChat }: {
  booking: BookingDetail;
  onViewDetails: () => void;
  onChat: () => void;
}) {
  const icon = SERVICE_ICONS_OUTLINED[booking.serviceType] || "build";
  const progressPercent = STATUS_PROGRESS[booking.status] || 0;
  const statusMeta = STATUS_META[booking.status] || { label: booking.status, color: "#475569", bg: "#f1f5f9", className: "bg-slate-600/15 text-slate-600" };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm border-l-4 border-primary transition-all hover:shadow-md">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-primary/5 text-primary rounded-xl border border-primary/5">
            <span className="material-symbols-outlined text-2xl">{icon}</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-snug">{booking.serviceType}</h3>
            <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-xs">location_on</span> {booking.address}
            </p>
          </div>
        </div>

        {booking.specialist?.name && (
          <div className="flex items-center gap-2.5 bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/40">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-secondary-container to-secondary flex items-center justify-center text-white text-xs font-bold">
              {booking.specialist.name[0].toUpperCase()}
            </div>
            <span className="text-xs font-semibold text-gray-800">{booking.specialist.name}</span>
          </div>
        )}
      </div>

      {/* Progress display — status label + horizontal stepper */}
      <div className="space-y-3 mb-5">
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
          <span className="text-primary">{statusMeta.label}</span>
          <span className="text-on-surface-variant">{progressPercent}%</span>
        </div>
        <BookingProgressCard booking={booking} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-outline-variant/60">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Time: {booking.scheduledTime} · Date: {booking.scheduledDate}
        </span>
        <div className="flex gap-2">
          <button onClick={onChat} className="flex items-center gap-1.5 px-3 py-2 border border-outline-variant text-on-surface-variant hover:bg-surface-container-low rounded-xl text-xs font-bold transition-all cursor-pointer">
            <span className="material-symbols-outlined text-xs">chat</span> Chat
          </button>
          <button onClick={onViewDetails} className="px-4 py-2 bg-primary text-white hover:bg-primary-container rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

function UpcomingBookingRow({ booking, onClick }: { booking: BookingDetail; onClick: () => void }) {
  // Extract day and month from date
  const dateObj = new Date(booking.scheduledDate || Date.now());
  const month = dateObj.toLocaleDateString("en-IN", { month: "short" });
  const day = dateObj.getDate();

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between gap-4 p-4 bg-surface-container-lowest border border-outline-variant rounded-2xl hover:border-primary transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-14 h-14 bg-surface-container text-on-surface rounded-xl border border-outline-variant/40 group-hover:bg-primary/5 group-hover:border-primary/20 transition-all shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{month}</span>
          <span className="text-lg font-extrabold text-primary -mt-0.5 leading-none">{day}</span>
        </div>
        <div>
          <h4 className="font-semibold text-gray-800 leading-snug">{booking.serviceType}</h4>
          <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
            <span className="material-symbols-outlined text-xs">schedule</span> {booking.scheduledTime}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {booking.specialist?.name && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
              {booking.specialist.name[0].toUpperCase()}
            </div>
            <span>{booking.specialist.name}</span>
          </div>
        )}
        <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
      </div>
    </div>
  );
}

function HistoryBookingItem({ booking, onRebook, onReview, onClick }: {
  booking: BookingDetail;
  onRebook: () => void;
  onReview: () => void;
  onClick: () => void;
}) {
  const icon = SERVICE_ICONS_OUTLINED[booking.serviceType] || "build";
  const dateStr = booking.scheduledDate
    ? new Date(booking.scheduledDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const statusMeta = STATUS_META[booking.status] || { label: booking.status, color: "#64748B", bg: "#F1F5F9", className: "bg-slate-600/15 text-slate-600" };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary/10 transition-all">
      <div onClick={onClick} className="flex justify-between items-start gap-4 cursor-pointer">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-surface-container-low text-on-surface-variant rounded-xl border border-outline-variant/40 shrink-0">
            <span className="material-symbols-outlined text-2xl">{icon}</span>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 leading-snug">{booking.serviceType}</h4>
            <p className="text-xs text-on-surface-variant mt-0.5">{booking.address}</p>
            <p className="text-[10px] text-gray-400 mt-1">{dateStr} · Time: {booking.scheduledTime}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="font-extrabold text-gray-900">₹{booking.amount}</span>
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {booking.customerRating && (
        <div className="mt-3 flex items-center gap-1 py-1.5 px-3 bg-amber-50/50 border border-amber-100 rounded-xl max-w-max">
          <div className="flex">
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} className={`text-xs ${s <= (booking.customerRating || 5) ? "text-amber-400 font-fill" : "text-gray-200"} material-symbols-outlined`} style={{ fontVariationSettings: s <= (booking.customerRating || 5) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
            ))}
          </div>
          {booking.customerFeedback && (
            <span className="text-xs text-amber-900 italic font-medium ml-1.5">{`"${booking.customerFeedback}"`}</span>
          )}
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex gap-2.5 mt-4 pt-4 border-t border-outline-variant/60">
        <button
          onClick={onRebook}
          className="px-4 py-2 bg-primary text-white hover:bg-primary-container text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          Rebook
        </button>
        {booking.status === "completed" && !booking.customerRating && (
          <button
            onClick={onReview}
            className="px-4 py-2 bg-secondary text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
          >
            ⭐ Rate Job
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryRowItem({ booking, onRebook, onReview }: {
  booking: BookingDetail;
  onRebook: () => void;
  onReview: () => void;
}) {
  const icon = SERVICE_ICONS_OUTLINED[booking.serviceType] || "build";
  const dateStr = booking.scheduledDate
    ? new Date(booking.scheduledDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "";

  return (
    <div className="flex gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/30 text-on-surface-variant">
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <div className="flex-1 border-b border-outline-variant/50 pb-3">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h4 className="font-semibold text-xs text-gray-800 leading-tight truncate max-w-40">{booking.serviceType}</h4>
            <p className="text-[10px] text-gray-400 mt-1">{dateStr}</p>
          </div>
          <span className="text-xs font-bold text-primary shrink-0">₹{booking.amount}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={onRebook} className="px-2.5 py-1 bg-primary text-white text-[9px] font-bold rounded-lg uppercase tracking-wider cursor-pointer">Rebook</button>
          {booking.status === "completed" && !booking.customerRating && (
            <button onClick={onReview} className="px-2.5 py-1 border border-outline-variant text-on-surface-variant text-[9px] font-bold rounded-lg uppercase tracking-wider cursor-pointer">Review</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mini Calendar Component (Ark UI, teal-themed to match project) ──────────

function MiniCalendar({ bookings }: { bookings: BookingDetail[] }) {
  const today = typeof window !== "undefined" ? new Date() : new Date(2026, 6, 12);
  const [selectedDate, setSelectedDate] = useState<Date[]>([today]);

  // Days that have bookings scheduled this month
  const scheduledDays = new Set(
    bookings
      .filter(b => b.scheduledDate)
      .map(b => new Date(b.scheduledDate).toDateString())
  );

  const selectedDateStr = selectedDate[0]?.toDateString() ?? "";
  const dayBookings = bookings.filter(
    b => b.scheduledDate && new Date(b.scheduledDate).toDateString() === selectedDateStr
  );

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-sm shadow-black/5 ring-1 ring-inset ring-black/[0.02]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-sm text-on-surface">Calendar</h3>
        <span className="text-[10px] text-primary font-bold bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">Calendar View</span>
      </div>

      <Calendar
        selectionMode="single"
        value={selectedDate.map(d => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return parseDate(`${yyyy}-${mm}-${dd}`);
        })}
        onValueChange={(e) => {
          if (e.value && e.value.length > 0) {
            const val = e.value[0];
            setSelectedDate([new Date(val.year, val.month - 1, val.day)]);
          }
        }}
        className="w-full"
      >
        <CalendarViewControl className="mb-3">
          <CalendarPrevTrigger />
          <CalendarViewDate className="font-bold text-sm text-on-surface" />
          <CalendarNextTrigger />
        </CalendarViewControl>

        <CalendarTable className="w-full">
          <CalendarWeekDays />
          <CalendarTableDays />
        </CalendarTable>
      </Calendar>

      {dayBookings.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-primary uppercase tracking-wider bg-primary/5 py-1.5 px-3 rounded-xl border border-primary/10">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse"></span>
            <span>{dayBookings.length} task{dayBookings.length > 1 ? "s" : ""} on {selectedDate[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </div>
          {dayBookings.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
              <span>{SERVICE_ICONS[b.serviceType] ?? "🔨"}</span>
              <span className="font-medium truncate">{b.serviceType}</span>
              <span className="ml-auto text-[10px] text-on-surface-variant/60">{b.scheduledTime}</span>
            </div>
          ))}
        </div>
      ) : scheduledDays.size > 0 ? (
        <div className="flex items-center gap-1.5 mt-4 text-[9px] font-bold text-primary uppercase tracking-wider bg-primary/5 py-1.5 px-3 rounded-xl border border-primary/10">
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse"></span>
          <span>You have tasks scheduled this month</span>
        </div>
      ) : null}
    </div>
  );
}
