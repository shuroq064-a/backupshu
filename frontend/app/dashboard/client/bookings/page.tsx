"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/store";
import { bookingApi } from "@/lib/api";
import { WS_BASE_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import type { BookingDetail } from "@/types";
import { STATUS_META } from "@/types";
import { BookingDetailModal } from "@/components/dashboard/client/BookingDetailModal";
import { BookingChatPopup } from "@/components/dashboard/client/BookingChatPopup";
import { useConversationUnread } from "@/hooks/useConversationUnread";
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
import BackButton from "@/components/ui/BackButton";

const LiveTrackingMap = dynamic(() =>
  import("@/components/tracking/LiveTrackingMap"), { ssr: false });

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
  const { showToast } = useToast();

  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("all");
  const [page, setPage] = useState(1);
  function handleTabChange(tab: "all" | "active" | "completed") {
    setActiveTab(tab);
    setPage(1);
  }
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [chatBooking, setChatBooking] = useState<BookingDetail | null>(null);
  const { unreadByBooking, clearBooking } = useConversationUnread("client");

  const PAGE_SIZE = 5;

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
      // Fetch OTP for any reached bookings that don't have it yet
      data.filter(b => b.status === "reached" && !b.otp).forEach(b => {
        bookingApi.getBookingOtp(b.id).then(res => {
          setBookings(prev => prev.map(p => p.id === b.id ? { ...p, otp: res.otp, otpExpiresAt: res.expiresAt } : p));
        }).catch(() => {});
      });
    } catch (err) {
      console.error(err);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadBookings(); }, [user?.id]);

  // Keep the popup in sync with live booking updates: refresh the booking
  // snapshot while it stays active, and auto-close once it is no longer
  // active (completed / cancelled / rejected).
  useEffect(() => {
    if (!chatBooking) return;
    const fresh = bookings.find(b => b.id === chatBooking.id);
    if (!fresh) return;
    if (["upcoming", "accepted", "started", "reached", "ongoing"].includes(fresh.status)) {
      if (fresh !== chatBooking) setChatBooking(fresh);
    } else {
      setChatBooking(null);
    }
  }, [bookings, chatBooking]);

  // Refetch bookings after a successful payment
  useEffect(() => {
    function onPaymentSuccess() { loadBookings(); }
    window.addEventListener("shuroqx-payment-success", onPaymentSuccess);
    return () => window.removeEventListener("shuroqx-payment-success", onPaymentSuccess);
  }, [user?.id]);

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
    const wsUrl = token
      ? `${WS_BASE}/ws/bookings/${encodeURIComponent(bookingId)}?token=${encodeURIComponent(token)}`
      : `${WS_BASE}/ws/bookings/${encodeURIComponent(bookingId)}`;
    const ws = new WebSocket(wsUrl);
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

        // Handle OTP refresh events
        if (data.type === "OTP_GENERATED") {
          setBookings(prev => prev.map(b =>
            b.id === data.bookingId
              ? { ...b, otp: data.otp, otpExpiresAt: data.expiresAt }
              : b
          ));
          setSelectedBooking(prev =>
            prev && prev.id === data.bookingId
              ? { ...prev, otp: data.otp, otpExpiresAt: data.expiresAt }
              : prev
          );
          showToast("New OTP generated! Share it with your specialist.", "info");
          return;
        }

        if (data.type !== "STATUS_UPDATE") return;

        // Update booking status in state (also pick up OTP if included)
        setBookings(prev => prev.map(b =>
          b.id === data.bookingId
            ? {
                ...b,
                status: data.status,
                ...(data.otp ? { otp: data.otp, otpExpiresAt: data.otpExpiresAt } : {}),
              }
            : b
        ));
        // Also update selectedBooking if the modal is open for this booking
        setSelectedBooking(prev =>
          prev && prev.id === data.bookingId
            ? { ...prev, status: data.status, ...(data.otp ? { otp: data.otp, otpExpiresAt: data.otpExpiresAt } : {}) }
            : prev
        );

        const msg =
          data.status === "accepted"  ? `${data.specialistName || "Specialist"} accepted your request!` :
          data.status === "started"   ? `${data.specialistName || "Specialist"} is on the way!` :
          data.status === "reached"   ? `Specialist has arrived! Share the OTP with them.` :
          data.status === "ongoing"   ? `Work has started!` :
          data.status === "completed" ? `Job complete! Please rate your experience.` :
          null;

        if (msg) showToast(msg, data.status === "completed" ? "success" : "info");

        // On reached — also fetch fresh detail to guarantee OTP is present
        if (data.status === "reached") {
          bookingApi.getById(data.bookingId).then((detail) => {
            setBookings(prev => prev.map(b =>
              b.id === data.bookingId ? { ...b, otp: detail.otp, otpExpiresAt: detail.otpExpiresAt } : b
            ));
            setSelectedBooking(prev =>
              prev && prev.id === data.bookingId
                ? { ...prev, otp: detail.otp, otpExpiresAt: detail.otpExpiresAt }
                : prev
            );
          }).catch(() => {});
        }

        // On complete — close WS and auto-open the locked rating → payment modal
        if (data.status === "completed") {
          safeClose();
          wsRefs.current.delete(bookingId);
          // Fetch fresh booking detail (with isPaid, costBreakdown etc.) and
          // open the modal so the client immediately sees the rating flow.
          bookingApi.getById(data.bookingId).then((detail) => {
            setSelectedBooking(detail);
          }).catch(() => {
            // Fallback: update the in-state booking and open with stale data
            setBookings(prev => {
              const found = prev.find(b => b.id === data.bookingId);
              if (found) setSelectedBooking({ ...found, status: data.status });
              return prev;
            });
          });
        }
        if (data.status === "cancelled") {
          safeClose();
          wsRefs.current.delete(bookingId);
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
  const activeBookings = bookings.filter(b => ["upcoming", "accepted", "started", "reached", "ongoing"].includes(b.status));
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
  const completedPages = paginate(completedBookings);

  async function handleOpenBooking(booking: BookingDetail) {
    try {
      const detail = await bookingApi.getById(booking.id);
      setSelectedBooking(detail);
    } catch {
      setSelectedBooking(booking);
    }
  }

  function handleRebook(booking: BookingDetail) {
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(`I need a ${booking.serviceType} at ${booking.address}`)}`);
  }

  return (
      <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto space-y-6 sm:space-y-8 animate-fade-in-up">

      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-outline-variant/60">
        <div className="flex items-center gap-2">
          <BackButton label="" fallback="/dashboard/client" className="px-1.5 py-1.5" />
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">My Bookings</h1>
            <p className="text-sm text-on-surface-variant mt-1.5">Manage your active progress, upcoming tasks, and transaction history.</p>
          </div>
        </div>
        {/* Quick Filter Buttons */}
        <div className="flex bg-surface-container-low p-1 rounded-xl shadow-inner border border-outline-variant/30 shrink-0 overflow-x-auto max-md:w-full">
          {(["all", "active", "completed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
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
                        onChat={() => {
                          setChatBooking(b);
                          clearBooking(b.id);
                        }}
                        unread={chatBooking?.id !== b.id ? unreadByBooking[b.id] || 0 : 0}
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

      {chatBooking && (
        <BookingChatPopup
          booking={chatBooking}
          currentUser={user}
          onClose={() => setChatBooking(null)}
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
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      <button
        onClick={() => onPage(Math.max(1, current - 1))}
        disabled={current === 1}
        className="flex items-center justify-center w-10 h-10 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        aria-label="Previous page"
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`w-10 h-10 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
        className="flex items-center justify-center w-10 h-10 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        aria-label="Next page"
      >
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </div>
  );
}

// ── Sub-components for Bookings Page ──────────────────────────────────────────

function ActiveBookingCard({ booking, onViewDetails, onChat, unread = 0 }: {
  booking: BookingDetail;
  onViewDetails: () => void;
  onChat: () => void;
  unread?: number;
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

      {/* OTP Display — only when reached and OTP exists */}
      {booking.status === "reached" && booking.otp && (
        <div className="mb-4 rounded-2xl p-4 bg-gradient-to-br from-emerald-50 via-primary/5 to-emerald-50 border border-emerald-200/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 animate-pulse rounded-2xl" />
          <div className="relative flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-emerald-600 text-lg">shield</span>
            <p className="text-xs font-bold text-gray-900">Tell this code to your specialist</p>
          </div>
          <div className="relative flex flex-wrap justify-center gap-2 sm:gap-2.5">
            {booking.otp.split("").map((digit, i) => (
              <div key={i} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white border-2 border-emerald-300 flex items-center justify-center shadow-sm">
                <span className="text-lg sm:text-xl font-mono font-bold text-emerald-600 tabular-nums">{digit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-outline-variant/60">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Time: {booking.scheduledTime} · Date: {booking.scheduledDate}
        </span>
        <div className="flex flex-wrap gap-2.5 shrink-0 items-center">
          {["started", "reached", "ongoing"].includes(booking.status) && (
            <LiveTrackingMap
              booking={booking}
              role="client"
              onClose={() => {}}
            />
          )}
          {["accepted", "started", "reached", "ongoing"].includes(booking.status) && (
            <button onClick={onChat} className="relative flex items-center gap-2 px-4 py-3 min-h-11 border border-outline-variant text-primary hover:bg-primary-container/30 rounded-xl transition-all cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">chat</span>
              <span className="text-xs font-bold">Chat</span>
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          )}
          <button onClick={onViewDetails} className="px-4 py-3 min-h-11 bg-primary text-white hover:bg-primary-container rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryBookingItem({ booking, onRebook, onClick }: {
  booking: BookingDetail;
  onRebook: () => void;
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
        <div className="flex items-center gap-3.5 min-w-0">
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
        <div className="mt-3 flex items-center gap-2 py-1.5 px-3 bg-amber-50/50 border border-amber-100 rounded-xl max-w-max">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} className={`text-xs ${s <= (booking.customerRating || 5) ? "text-amber-400" : "text-gray-200"}`}>★</span>
            ))}
          </div>
          {booking.customerFeedback && (
            <span className="text-[11px] text-amber-800/80 font-medium ml-1 truncate max-w-[160px]" title={booking.customerFeedback}>
              {booking.customerFeedback}
            </span>
          )}
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex flex-wrap gap-2.5 mt-4 pt-4 border-t border-outline-variant/60">
        <button
          onClick={onRebook}
          className="px-4 py-2 min-h-11 bg-primary text-white hover:bg-primary-container text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          Rebook
        </button>
        {booking.status === "completed" && !booking.customerRating && (
          <button
            onClick={onClick}
            className="px-4 py-2 min-h-11 bg-amber-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
          >
            ⭐ Rate & Pay
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryRowItem({ booking, onRebook }: {
  booking: BookingDetail;
  onRebook: () => void;
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
          <button onClick={onRebook} className="px-3 py-2 min-h-11 bg-primary text-white text-[9px] font-bold rounded-lg uppercase tracking-wider cursor-pointer">Rebook</button>
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
