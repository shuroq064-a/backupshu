"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2 } from "lucide-react";

interface ViewOnMapProps {
  address?: string;
  className?: string;
}

export const ViewOnMap: React.FC<ViewOnMapProps> = ({
  address = "Hyderabad, India",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const toggleOpen = () => {
    setIsOpen((open) => !open);
    if (isOpen) setIsMapLoaded(false);
  };

  const springConfig = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 0.8,
  };

  const publicMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {!isOpen ? (
          /* ── PILL BUTTON ── */
          <motion.button
            key="button"
            layoutId="map-container"
            onClick={toggleOpen}
            className="group flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-on-surface shadow-sm ring-1 ring-outline-variant/50 transition hover:bg-surface-container-high"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springConfig}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="material-symbols-outlined text-base text-primary">map</span>
            <span>View on Map</span>
          </motion.button>
        ) : (
          /* ── EXPANDED MAP ── */
          <motion.div
            key="map"
            layoutId="map-container"
            className="relative aspect-square w-[calc(100vw-64px)] overflow-hidden bg-surface-container-low shadow-xl sm:w-[360px]"
            style={{ borderRadius: 28 }}
            transition={springConfig}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="absolute inset-0 h-full w-full"
            >
              <iframe
                title="Map"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                src={publicMapUrl}
                allowFullScreen
                onLoad={() => setIsMapLoaded(true)}
                className={`transition-opacity duration-700 ${isMapLoaded ? "opacity-100" : "opacity-0"}`}
              />
            </motion.div>

            {!isMapLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low">
                <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
              </div>
            )}

            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={toggleOpen}
              className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant shadow-lg transition-all hover:bg-surface-container-low active:scale-90"
            >
              <X className="h-5 w-5" strokeWidth={3} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
