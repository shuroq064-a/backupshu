"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { SpecialistResult } from "@/types";
import { getSpecialistAvatar } from "@/lib/avatar";

interface SpecialistProfileCardProps {
  specialist: SpecialistResult;
  onClose: () => void;
  onViewFull?: (specialist: SpecialistResult) => void;
}

function Cover() {
  return (
    <div
      className="h-24 w-full"
      style={{
        background:
          "linear-gradient(135deg, rgba(0,83,91,0.30), rgba(0,109,119,0.12) 60%, transparent), radial-gradient(120% 100% at 0% 0%, rgba(24,26,46,0.10), transparent 60%)",
      }}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-bold text-on-surface text-base">{value}</div>
      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-[0.15em] mt-0.5">
        {label}
      </div>
    </div>
  );
}

export function SpecialistProfileCard({
  specialist,
  onClose,
  onViewFull,
}: SpecialistProfileCardProps) {
  const router = useRouter();
  const primaryService = specialist.services?.[0]?.service_name || "General Service";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function handleMessage() {
    const q = `I want to book ${specialist.name} for ${primaryService} service.`;
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(q)}`);
    onClose();
  }

  const rating = specialist.rating != null ? specialist.rating.toFixed(1) : "New";
  const distance = specialist.distanceKm != null ? `${specialist.distanceKm} km` : "—";
  const eta = specialist.etaMinutes != null ? `${specialist.etaMinutes} min` : "—";
  const contact = specialist.email || specialist.phone || "Contact via chat";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-on-surface/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 36 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.8 }}
        className="w-full sm:max-w-sm bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/15 hover:bg-black/30 text-white flex items-center justify-center transition-colors cursor-pointer z-10 backdrop-blur-md"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>

        <Cover />

        {/* Overlapping avatar */}
        <div className="-mt-10 relative px-6 pb-2">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}
            className="w-20 h-20 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-2xl flex-shrink-0 overflow-hidden border-4 border-surface-container-lowest shadow-md"
          >
            {specialist.avatar ? (
              <img src={specialist.avatar} alt={specialist.name} className="w-full h-full object-cover" />
            ) : (
              <img
                src={getSpecialistAvatar(specialist.name, primaryService, specialist.gender === "female" ? "female" : "male")}
                alt={specialist.name}
                className="w-full h-full object-cover"
              />
            )}
          </motion.div>

          <h2 className="mt-3 text-on-surface font-bold text-xl flex items-center gap-2">
            {specialist.name}
            {specialist.isVerified && (
              <span className="bg-primary/10 text-primary font-mono text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-primary/20">
                PRO
              </span>
            )}
          </h2>
          <p className="text-on-surface-variant text-sm mt-0.5">
            {primaryService} · Verified Specialist
          </p>
        </div>

        <div className="px-6 pb-6 pt-2 space-y-4">
          <div className="flex flex-col gap-1.5 text-on-surface-variant text-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
              {distance} away
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">mail</span>
              {contact}
            </div>
          </div>

          <hr className="border-outline-variant/50" />

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rating" value={rating} />
            <Stat label="Distance" value={distance} />
            <Stat label="Response" value={eta} />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleMessage}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-container transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">forum</span>
              Message
            </button>
            <button
              onClick={() => onViewFull?.(specialist)}
              className="flex-1 px-4 py-2.5 bg-surface-container-low text-on-surface border border-outline-variant rounded-xl text-sm font-bold hover:bg-surface-container-high transition-all active:scale-95 cursor-pointer"
            >
              View profile
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
