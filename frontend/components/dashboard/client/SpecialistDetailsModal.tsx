"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { workerExtApi } from "@/lib/api";
import { getSpecialistAvatar } from "@/lib/avatar";
import type { BookingReview, SpecialistResult } from "@/types";

interface SpecialistDetailsModalProps {
  specialist: SpecialistResult;
  onClose: () => void;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`material-symbols-outlined text-base ${s <= Math.round(rating) ? "text-amber-400" : "text-surface-container-highest"}`}
          style={s <= Math.round(rating) ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          star
        </span>
      ))}
    </div>
  );
}

function Cover() {
  return (
    <div
      className="h-28 w-full"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #00535b) 25%, transparent), color-mix(in srgb, var(--color-primary, #00535b) 10%, transparent) 60%, transparent), radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, #000 15%, transparent), transparent 60%)",
      }}
    />
  );
}

export function SpecialistDetailsModal({ specialist, onClose }: SpecialistDetailsModalProps) {
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    workerExtApi.getReviews(specialist.workerId)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [specialist.workerId]);

  if (!mounted) return null;

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const verifiedServices = specialist.services?.filter(s => s.status === "verified") || [];

  const primaryService = specialist.services?.[0]?.service_name || "General Service";
  const spGender = specialist.gender === "female" ? "female" : "male";
  const avatarSrc = specialist.avatar || getSpecialistAvatar(specialist.name, primaryService, spGender);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 36 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.8 }}
        className="bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col relative"
      >

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors cursor-pointer z-10 backdrop-blur-md"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>

        <Cover />

        {/* Header - Overlapping Avatar */}
        <div className="-mt-12 relative px-6 pb-2">
          <div className="w-24 h-24 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-3xl flex-shrink-0 overflow-hidden border-4 border-surface-container-lowest shadow-md">
            <img src={avatarSrc} alt={specialist.name} className="w-full h-full object-cover" />
          </div>
          <div className="mt-4">
            <h2 className="text-gray-900 font-bold text-2xl flex items-center gap-2">
              {specialist.name}
              {specialist.isVerified && (
                <span className="bg-primary/10 text-primary font-mono text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-primary/20">
                  PRO
                </span>
              )}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Top Rated Specialist · Expert Team
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 bg-surface-container-lowest">
          <div className="px-6 pb-6 pt-2 space-y-6">

            <div className="flex flex-col gap-2 text-gray-500 text-sm">
              {specialist.isAvailable && (
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Available now for new bookings
                </div>
              )}
              {specialist.phone && (
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">mail</span>
                  {specialist.phone}
                </div>
              )}
            </div>

            <hr className="border-outline-variant/40" />

            <div className="grid grid-cols-3 gap-2 text-center py-2">
              <div>
                <div className="font-bold text-gray-900 text-xl">{reviews.length}</div>
                <div className="font-mono text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Reviews</div>
              </div>
              <div>
                <div className="font-bold text-gray-900 text-xl">{avgRating.toFixed(1)}</div>
                <div className="font-mono text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Rating</div>
              </div>
              <div>
                <div className="font-bold text-gray-900 text-xl">{verifiedServices.length}</div>
                <div className="font-mono text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Services</div>
              </div>
            </div>

            {/* Services */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Verified Skills</p>
              <div className="flex flex-wrap gap-2">
                {verifiedServices.map(s => (
                  <span key={s.service_id} className="bg-surface-container-low border border-outline-variant/50 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                    {s.service_name}
                  </span>
                ))}
                {verifiedServices.length === 0 && <span className="text-sm text-gray-400 italic">No verified services yet</span>}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 pt-2">
              <a
                href={`tel:${specialist.phone}`}
                className="flex-1 px-5 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-container hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 text-center flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">call</span>
                Call Now
              </a>
              <button
                className="flex-1 px-5 py-3 bg-surface-container-lowest text-gray-700 border border-outline-variant/50 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all active:scale-95 text-center flex items-center justify-center gap-2 cursor-pointer"
              >
                Book
              </button>
            </div>

            {/* Reviews */}
            <div className="pt-4 border-t border-outline-variant/40">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Recent Feedback</p>
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm bg-surface-container-low border border-outline-variant/30 rounded-2xl">
                  No reviews available yet
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.slice(0, 5).map(r => (
                    <div key={r.bookingId} className="bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-xs">
                            {r.clientName[0]}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-800 block leading-none">{r.clientName}</span>
                            <span className="text-[10px] text-gray-400 mt-1 block">{r.date}</span>
                          </div>
                        </div>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.feedback && <p className="text-sm text-gray-600 leading-relaxed bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30">{r.feedback}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

