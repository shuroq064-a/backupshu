"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { BookingDetail } from "@/types";
import { SkillBadges } from "@/components/ui/SkillBadges";
import { STATUS_META } from "@/types";

interface BookingDetailModalProps {
  booking: BookingDetail;
  onClose: () => void;
}

const SERVICE_ICONS: Record<string, string> = {
  Plumbing: "plumbing", Electrical: "bolt", "AC Repair": "ac_unit",
  Carpenter: "construction", Massage: "spa", Cleaning: "clean_hands",
  plumbing: "plumbing", electrical: "bolt", General: "build",
  painting: "brush", Design: "brush",
};

// ─────────────────────────────────────────────
//  Booking Detail Modal
// ─────────────────────────────────────────────

export function BookingDetailModal({ booking, onClose }: BookingDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"details" | "updates">("details");
  const [isMouseDownOnOverlay, setIsMouseDownOnOverlay] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Mount portal on client only ─────────
  useEffect(() => setMounted(true), []);

  // ── Close on Escape key ──────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ── Kill ALL background scroll while modal is open ──
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector<HTMLElement>("main");

    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevMain = main?.style.overflow ?? "";

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (main) main.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      if (main) main.style.overflow = prevMain;
    };
  }, []);

  // ── Click outside to close (with drag-select prevention & scrollbar check) ──
  function handleMouseDown(e: React.MouseEvent) {
    if (e.target === overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      const isScrollbar = e.clientX > rect.left + overlayRef.current.clientWidth;
      if (!isScrollbar) {
        setIsMouseDownOnOverlay(true);
        return;
      }
    }
    setIsMouseDownOnOverlay(false);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (isMouseDownOnOverlay && e.target === overlayRef.current) {
      onClose();
    }
    setIsMouseDownOnOverlay(false);
  }

  const date = new Date(booking.scheduledDate).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  const tmpSpec = booking.specialist ?? {
    name: "Specialist",
    avatar: undefined,
    services: [],
    rating: 0,
    reviewCount: 0,
    phone: undefined,
  };

  const serviceIcon = SERVICE_ICONS[booking.serviceType] || "build";

  if (!mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={(e) => e.stopPropagation()}
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ overflow: "hidden", overscrollBehavior: "none" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 36 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.8 }}
        className="bg-surface-container-lowest rounded-3xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden shadow-[0_20px_60px_-10px_rgba(0,0,0,0.35),0_8px_20px_-6px_rgba(0,0,0,0.2)] ring-1 ring-inset ring-black/[0.05]"
        onClick={(e) => e.stopPropagation()}
      >

          {/* ── Header band ────────────────────── */}
          <div
            className="relative px-5 pt-4 pb-4 rounded-t-3xl flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #00535b) 92%, #000 8%), color-mix(in srgb, var(--color-primary-container, #006d77) 100%, #000 0%))",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white border border-white/20 shrink-0">
                  <span className="material-symbols-outlined text-xl">{serviceIcon}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white leading-tight truncate capitalize">
                    {booking.serviceType} Booking
                  </h2>
                  <p className="text-[10px] text-teal-50/80 font-mono mt-0.5 uppercase">
                    #{booking.bookingNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors shrink-0"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-3">
              <button 
                onClick={() => setActiveTab("details")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === "details" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-teal-50/80 hover:bg-white/10"}`}>
                Details
              </button>
              <button 
                onClick={() => setActiveTab("updates")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === "updates" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-teal-50/80 hover:bg-white/10"}`}>
                Updates
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0">
            {activeTab === "details" ? (
              <>
                {/* ── Specialist card ───────────────── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0 border border-primary/20">
                      {tmpSpec.avatar ? (
                        <img
                          src={tmpSpec.avatar}
                          alt={tmpSpec.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        tmpSpec.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">
                        {tmpSpec.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {tmpSpec.services?.length > 0 ? (
                          <SkillBadges services={tmpSpec.services} />
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No skills listed</span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0">
                          {[...Array(5)].map((_, i) => (
                            <span
                              key={i}
                              className={`text-xs ${
                                i < Math.floor(tmpSpec.rating)
                                  ? "text-amber-400"
                                  : i < tmpSpec.rating
                                  ? "text-amber-300"
                                  : "text-gray-200"
                              }`}
                            >
                              ★
                            </span>
                          ))}
                          <span className="text-[10px] text-gray-400 ml-0.5">
                            ({tmpSpec.reviewCount})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <StatusChip status={booking.status} />
                </div>

              {/* ── Ongoing: Contact + ETA ────────── */}
              {booking.status === "ongoing" && (
                <div className="flex items-center gap-3">
                  <a
                    href={`tel:${tmpSpec.phone || ""}`}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span> Contact
                  </a>
                  {booking.etaMinutes && (
                    <p className="text-sm text-gray-600 font-medium">
                      ETA: <span className="text-gray-900 font-bold">{booking.etaMinutes} min</span>
                    </p>
                  )}
                </div>
              )}

              {/* ── Completed: Call only ─────────── */}
              {booking.status === "completed" && (
                <div className="flex items-center justify-between">
                  <a
                    href={`tel:${tmpSpec.phone || ""}`}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span> Call
                  </a>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{booking.costBreakdown?.total ?? booking.amount}
                  </p>
                </div>
              )}

              {/* ── Cancelled: Call only ─────────── */}
              {booking.status === "cancelled" && (
                <a
                  href={`tel:${tmpSpec.phone || ""}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">call</span> Call
                </a>
              )}

              {/* ── Booking Info ──────────────────── */}
              <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/40 divide-y divide-outline-variant/40">
                <InfoRow
                  label="Booking ID"
                  icon="receipt_long"
                  value={booking.bookingNumber}
                  right={
                    booking.status === "completed"
                      ? <span className="font-bold text-gray-900">₹{booking.costBreakdown?.total ?? booking.amount}</span>
                      : booking.status === "ongoing"
                      ? <span className="font-bold text-gray-900">₹{booking.amount}</span>
                      : null
                  }
                />
                <InfoRow
                  label="Address"
                  icon="location_on"
                  value={booking.address}
                  right={
                    booking.status === "completed" && booking.costBreakdown
                      ? <span className="font-bold text-gray-900">₹{booking.costBreakdown.visitCharge + (booking.costBreakdown.repairWork ?? 0)}</span>
                      : booking.status === "ongoing"
                      ? <StatusChip status="ongoing" small />
                      : null
                  }
                />
                {(booking.receiverName || booking.contactNumber) && (
                  <InfoRow
                    label="Contact"
                    icon="person"
                    value={[booking.receiverName, booking.contactNumber].filter(Boolean).join(" · ")}
                  />
                )}
                {(booking.houseFlat || booking.blockArea || booking.landmark) && (
                  <InfoRow
                    label={booking.customAddressLabel || booking.addressLabel || "Address details"}
                    icon="home"
                    value={[booking.houseFlat, booking.blockArea, booking.landmark].filter(Boolean).join(", ")}
                  />
                )}
                <InfoRow
                  label="Date & Time"
                  icon="calendar_today"
                  value={`${date} · ${booking.scheduledTime}`}
                  right={
                    booking.status === "completed" && booking.costBreakdown?.tip
                      ? <span className="text-sm text-gray-500">• Tip given: ₹{booking.costBreakdown.tip}</span>
                      : null
                  }
                />
              </div>

              {/* ── Ongoing: Action buttons ───────── */}
              {booking.status === "ongoing" && (
                <div className="grid grid-cols-3 gap-3">
                  <button className="py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-container transition-colors flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">navigation</span> Track
                  </button>
                  <button className="py-3 border border-outline-variant text-on-surface-variant rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">call</span> Call
                  </button>
                  <button className="py-3 border border-red-200 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">close</span> Cancel
                  </button>
                </div>
              )}

              {/* ── Cancelled: Raise issue ────────── */}
              {booking.status === "cancelled" && (
                <button className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">report_problem</span> Raise Issue
                </button>
              )}

              {/* ── Booking Notes ─────────────────── */}
              {booking.notes && (
                <div className="rounded-2xl p-4 bg-primary/5 border border-primary/15">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px]">sticky_note_2</span>
                    </span>
                    <p className="text-sm font-semibold text-gray-800">Booking Notes</p>
                  </div>
                  <div className="bg-surface-container-lowest rounded-xl p-3 border border-primary/10">
                    <div className="flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">check_circle</span>
                      <p className="text-sm text-gray-700 leading-relaxed">{booking.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Completed: Cost breakdown + feedback ── */}
              {booking.status === "completed" && booking.costBreakdown && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Customer feedback */}
                  <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/40">
                    <p className="text-sm font-semibold text-gray-800 mb-2">
                      Customer feedback
                    </p>
                    {booking.customerFeedback ? (
                      <>
                        <p className="text-sm text-gray-600 mb-2">
                          {booking.customerFeedback}
                        </p>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <span
                              key={i}
                              className={`text-lg ${
                                i < (booking.customerRating ?? 0)
                                  ? "text-amber-400"
                                  : "text-gray-200"
                              }`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No feedback given</p>
                    )}
                  </div>

                  {/* Cost breakdown */}
                  <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/40">
                    <p className="text-sm font-semibold text-gray-800 mb-3">
                      Cost Breakdown
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Visit Charge</span>
                        <span className="font-medium">₹{booking.costBreakdown.visitCharge}</span>
                      </div>
                      {booking.costBreakdown.repairWork && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Repair Work</span>
                          <span className="font-medium">₹{booking.costBreakdown.repairWork}</span>
                        </div>
                      )}
                      {booking.costBreakdown.tip && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Tip</span>
                          <span className="font-medium">₹{booking.costBreakdown.tip}</span>
                        </div>
                      )}
                      <div className="h-px bg-outline-variant/60 my-1" />
                      <div className="flex justify-between text-sm font-bold">
                        <span>Total</span>
                        <span>₹{booking.costBreakdown.total}</span>
                      </div>
                    </div>
                    {booking.costBreakdown.paymentMethod && (
                      <p className="text-xs text-gray-400 mt-3 text-right">
                        Paid with {booking.costBreakdown.paymentMethod}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Cancelled: reason ─────────────── */}
              {booking.status === "cancelled" && booking.cancellationReason && (
                <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-red-400 text-[18px]">block</span>
                  <p className="text-sm text-red-600">
                    Booking was cancelled by {booking.cancelledBy === "client" ? "you" : "specialist"}:{" "}
                    {booking.cancellationReason}
                  </p>
                </div>
              )}

              {/* ── Visiting charge note ──────────── */}
              {booking.status === "ongoing" && (
                <p className="text-xs text-gray-400 text-center">
                  Visiting charge will be adjusted in the final bill if work is completed
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-40">update</span>
              <p className="text-base font-medium text-gray-700">No recent updates</p>
              <p className="text-sm mt-1">Updates about your booking will appear here.</p>
            </div>
          )}
        </div>
    </motion.div>
  </div>,
    document.body
  );
}

// ─────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────

function StatusChip({ status, small = false }: { status: string; small?: boolean }) {
  const meta = STATUS_META[status] || { label: status, color: "#00535b", bg: "#F0FDFA" };
  const iconMap: Record<string, string> = {
    ongoing: "autorenew",
    upcoming: "schedule",
    completed: "check_circle",
    cancelled: "cancel",
    accepted: "thumb_up",
    started: "directions_car",
    reached: "pin_drop",
    rejected: "block",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-semibold ${small ? "px-2 py-0.5" : ""}`}
      style={{ color: meta.color, background: meta.bg, borderColor: `${meta.color}25` }}
    >
      <span className="material-symbols-outlined text-[14px] leading-none">
        {iconMap[status] || "schedule"}
      </span>
      {meta.label}
    </span>
  );
}

function InfoRow({
  label,
  value,
  icon,
  right,
}: {
  label: string;
  value: string;
  icon?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="w-9 h-9 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-primary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
        </div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}

