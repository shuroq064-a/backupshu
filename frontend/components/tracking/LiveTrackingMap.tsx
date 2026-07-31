"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { FaMapLocationDot } from "react-icons/fa6";
import type { BookingDetail, LocationUpdateEvent } from "@/types";
import { WS_BASE_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import { useGpsTracking } from "./GpsTrackingContext";

interface LiveTrackingMapProps {
  booking: BookingDetail;
  onClose: () => void;
  role: "client" | "specialist";
}

function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function LiveTrackingMap({ booking, onClose, role }: LiveTrackingMapProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<unknown>(null);
  const specialistMarkerRef = useRef<unknown>(null);
  const routeLayerRef = useRef<unknown>(null);
  const glowLayerRef = useRef<unknown>(null);
  const lastBearingRef = useRef<number>(0);
  const followModeRef = useRef(true);
  const routeCoordsRef = useRef<[number, number][]>([]);

  // Throttle refs for OSRM route re-fetch
  const lastFetchPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const FETCH_MIN_DISTANCE_M = 100;
  const FETCH_MIN_INTERVAL_MS = 30000;

  const { position: gpsPosition, isTracking } = useGpsTracking();

  const [eta, setEta] = useState<number | null>(booking.etaMinutes ?? null);
  const [distance, setDistance] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(
    role === "specialist"
      ? (!booking.currentLatitude || !booking.currentLongitude) && !isTracking
      : false
  );
  const [isFollowing, setIsFollowing] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const specialistName = booking.specialist?.name || "Specialist";

  // Sync waitingForGps when booking prop updates with new location
  useEffect(() => {
    if (role === "specialist" && booking.currentLatitude && booking.currentLongitude) {
      setIsWaiting(false);
    }
  }, [booking.currentLatitude, booking.currentLongitude, role]);

  // For specialist: update marker from GPS context (no WebSocket roundtrip needed for own position)
  useEffect(() => {
    if (role !== "specialist" || !gpsPosition || !isOpen) return;
    if (!leafletMap.current || !isMapLoaded) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      const map = leafletMap.current as L.Map;
      if (!map) return;

      setIsWaiting(false);

      if (!specialistMarkerRef.current) {
        specialistMarkerRef.current = L.marker([gpsPosition.latitude, gpsPosition.longitude], { icon: makeSpecIconRef.current(L) })
          .addTo(map)
          .bindPopup("Your location");
        if (followModeRef.current) followNavRef.current(map, gpsPosition.latitude, gpsPosition.longitude);
        const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
        if (cLat && cLng) throttledFetchRouteRef.current(L, map, gpsPosition.latitude, gpsPosition.longitude, cLat, cLng);
      } else {
        (specialistMarkerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([gpsPosition.latitude, gpsPosition.longitude]);
        if (followModeRef.current) followNavRef.current(map, gpsPosition.latitude, gpsPosition.longitude);
        const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
        if (cLat && cLng) throttledFetchRouteRef.current(L, map, gpsPosition.latitude, gpsPosition.longitude, cLat, cLng);
      }
    }).catch(() => {});
  }, [gpsPosition, role, isOpen, isMapLoaded, booking.customerLatitude, booking.customerLongitude]);

  const toggleOpen = () => {
    if (isOpen) {
      setIsMapLoaded(false);
      setIsOpen(false);
      onClose();
    } else {
      setIsOpen(true);
    }
  };

  const springConfig = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 0.8,
  };

  // ── Leaflet helpers ──

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clearRoute = useCallback((map: any) => {
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (glowLayerRef.current) { map.removeLayer(glowLayerRef.current); glowLayerRef.current = null; }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRoute = useCallback((L: any, map: any, coords: [number, number][]) => {
    clearRoute(map);
    routeCoordsRef.current = coords;
    glowLayerRef.current = L.polyline(coords, { color: "#00897b", weight: 12, opacity: 0.15, lineCap: "round", lineJoin: "round" }).addTo(map);
    routeLayerRef.current = L.polyline(coords, { color: "#1a1a2e", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(map);
  }, [clearRoute]);

  const getBearingFromRoute = useCallback((specLat: number, specLng: number): number => {
    const coords = routeCoordsRef.current;
    if (coords.length < 2) {
      const clat = booking.customerLatitude;
      const clng = booking.customerLongitude;
      if (clat && clng) return calcBearing(specLat, specLng, clat, clng);
      return lastBearingRef.current;
    }
    let minDist = Infinity, idx = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = (coords[i][0] - specLat) ** 2 + (coords[i][1] - specLng) ** 2;
      if (d < minDist) { minDist = d; idx = i; }
    }
    const next = Math.min(idx + 3, coords.length - 1);
    if (next === idx) {
      const clat = booking.customerLatitude;
      const clng = booking.customerLongitude;
      if (clat && clng) return calcBearing(specLat, specLng, clat, clng);
      return lastBearingRef.current;
    }
    return calcBearing(coords[idx][0], coords[idx][1], coords[next][0], coords[next][1]);
  }, [booking.customerLatitude, booking.customerLongitude]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followNavigation = useCallback((map: any, specLat: number, specLng: number) => {
    const bearing = getBearingFromRoute(specLat, specLng);
    lastBearingRef.current = bearing;
    map.setView([specLat, specLng], map.getZoom(), { animate: true, duration: 0.6 });
    if (map.setBearing) map.setBearing(-bearing);
    const mapHeight = mapRef.current?.clientHeight ?? 500;
    requestAnimationFrame(() => {
      setTimeout(() => { map.panBy([0, mapHeight * 0.3], { animate: true, duration: 0.3 }); }, 80);
    });
  }, [getBearingFromRoute]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const throttledFetchRoute = useCallback(async (L: any, map: any, sLat: number, sLng: number, cLat: number, cLng: number) => {
    const now = Date.now();
    const lastPos = lastFetchPosRef.current;
    const lastTime = lastFetchTimeRef.current;
    if (lastPos && (now - lastTime) < FETCH_MIN_INTERVAL_MS) {
      const distMoved = haversineMeters(sLat, sLng, lastPos.lat, lastPos.lng);
      if (distMoved < FETCH_MIN_DISTANCE_M) return;
    }
    lastFetchPosRef.current = { lat: sLat, lng: sLng };
    lastFetchTimeRef.current = now;

    const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${cLng},${cLat}?overview=full&geometries=geojson`;
    let data: any = null;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch {
      // retry once after 1s
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res2 = await fetch(url);
        data = await res2.json();
      } catch {}
    }

    if (data?.code === "Ok" && data.routes?.length) {
      const route = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      setDistance(route.distance >= 1000 ? `${(route.distance / 1000).toFixed(1)} km` : `${Math.round(route.distance)} m`);
      if (!booking.etaMinutes && route.duration) setEta(Math.ceil(route.duration / 60));
      drawRoute(L, map, coords);
      if (followModeRef.current) followNavigation(map, sLat, sLng);
    }
  }, [booking.etaMinutes, drawRoute, followNavigation]);

  const recenter = useCallback(() => {
    if (!leafletMap.current) return;
    followModeRef.current = true;
    setIsFollowing(true);
    import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      const map = leafletMap.current as L.Map;
      if (!map) return;
      if (specialistMarkerRef.current) {
        const ll = (specialistMarkerRef.current as { getLatLng: () => { lat: number; lng: number } }).getLatLng();
        followNavigation(map, ll.lat, ll.lng);
      }
    }).catch(() => {});
  }, [followNavigation]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeSpecIcon = useCallback((L: any) => L.divIcon({
    className: "",
    html: `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(0,137,123,.15);animation:navPulse 2s ease-in-out infinite;"></div>
      <div style="width:36px;height:36px;border-radius:50%;background:#00897b;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,137,123,.5);border:3px solid white;position:relative;z-index:1;">
        <span style="font-size:18px;">🚲</span>
      </div>
      <style>@keyframes navPulse{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.4);opacity:0}}</style>
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  }), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeClientIcon = useCallback((L: any) => L.divIcon({
    className: "",
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(239,68,68,.4);border:3px solid white;">
      <span class="material-symbols-outlined" style="font-size:15px;color:white">person</span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  }), []);

  // ── Init Leaflet when expanded ──
  useEffect(() => {
    if (!isOpen || !mapRef.current || leafletMap.current) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled || !mapRef.current) return;

      const leaflet = await import("leaflet");
      await import("leaflet-rotate");
      const L = leaflet.default;
      if (cancelled || !mapRef.current) return;

      const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
      const sLat = booking.currentLatitude, sLng = booking.currentLongitude;
      // Client: always center on their own location first; Specialist: center on their position
      const centerLat = role === "client" ? (cLat ?? sLat ?? 17.385) : (sLat ?? cLat ?? 17.385);
      const centerLng = role === "client" ? (cLng ?? sLng ?? 78.4867) : (sLng ?? cLng ?? 78.4867);

      const map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true,
        bounceAtZoomLimits: false,
        rotate: true, rotateControl: false, pitch: false,
      }).setView([centerLat, centerLng], 18);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      if (cLat && cLng) L.marker([cLat, cLng], { icon: makeClientIcon(L) }).addTo(map);

      if (sLat && sLng) {
        specialistMarkerRef.current = L.marker([sLat, sLng], { icon: makeSpecIcon(L) })
          .addTo(map)
          .bindPopup(role === "client" ? specialistName : "Your location");
        if (cLat && cLng) throttledFetchRoute(L, map, sLat, sLng, cLat, cLng);
        else map.setView([sLat, sLng], 18);
      } else if (cLat && cLng) {
        map.setView([cLat, cLng], 18);
        if (role === "specialist") {
          setIsWaiting(true);
        }
      }

      map.on("dragstart", () => { followModeRef.current = false; setIsFollowing(false); });

      leafletMap.current = map;
      setIsMapLoaded(true);

      setTimeout(() => { map.invalidateSize(); }, 300);
      setTimeout(() => { map.invalidateSize(); }, 800);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (leafletMap.current && typeof (leafletMap.current as { remove?: () => void }).remove === "function") {
        (leafletMap.current as { remove: () => void }).remove();
        leafletMap.current = null;
      }
      setIsMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep WS handler stable via refs to prevent reconnects
  const throttledFetchRouteRef = useRef(throttledFetchRoute);
  throttledFetchRouteRef.current = throttledFetchRoute;
  const followNavRef = useRef(followNavigation);
  followNavRef.current = followNavigation;
  const makeSpecIconRef = useRef(makeSpecIcon);
  makeSpecIconRef.current = makeSpecIcon;
  const bookingRef = useRef(booking);
  bookingRef.current = booking;
  const roleRef = useRef(role);
  roleRef.current = role;
  const specialistNameRef = useRef(specialistName);
  specialistNameRef.current = specialistName;

  // ── WebSocket: live location updates (stable, reconnects only on isOpen/booking.id) ──
  useEffect(() => {
    if (!isOpen) return;
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(
      `${WS_BASE_URL}/ws/bookings/${encodeURIComponent(booking.id)}?token=${encodeURIComponent(token)}`
    );

    let opened = false;
    ws.onopen = () => { opened = true; };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LocationUpdateEvent;
        if (data.type !== "LOCATION_UPDATE") return;
        if (data.etaMinutes != null) setEta(data.etaMinutes);
        if (!leafletMap.current) return;

        import("leaflet").then((leaflet) => {
          const L = leaflet.default;
          const map = leafletMap.current as L.Map;
          if (!map) return;
          const b = bookingRef.current;
          const r = roleRef.current;
          const sName = specialistNameRef.current;

          if (!specialistMarkerRef.current) {
            specialistMarkerRef.current = L.marker([data.latitude, data.longitude], { icon: makeSpecIconRef.current(L) })
              .addTo(map)
              .bindPopup(r === "client" ? sName : "Your location");
            setIsWaiting(false);
            const cLat = b.customerLatitude, cLng = b.customerLongitude;
            if (cLat && cLng) throttledFetchRouteRef.current(L, map, data.latitude, data.longitude, cLat, cLng);
          } else {
            (specialistMarkerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([data.latitude, data.longitude]);
            if (followModeRef.current) followNavRef.current(map, data.latitude, data.longitude);
            const cLat = b.customerLatitude, cLng = b.customerLongitude;
            if (cLat && cLng) throttledFetchRouteRef.current(L, map, data.latitude, data.longitude, cLat, cLng);
          }
        }).catch(() => {});
      } catch {}
    };
    ws.onerror = () => ws.close();
    return () => { if (opened) ws.close(); else ws.onopen = () => ws.close(); };
  }, [isOpen, booking.id]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const waitingLabel = role === "client"
    ? `Waiting for ${specialistName}'s location...`
    : "Starting location tracking...";

  return createPortal(
    <AnimatePresence>
      {!isOpen ? (
        /* --- PILL BUTTON (fixed bottom-center) --- */
        <motion.div
          key="pill"
          onClick={toggleOpen}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] group flex cursor-pointer items-center justify-center overflow-hidden bg-[#E5E4EE] shadow-lg transition-colors duration-300 dark:bg-[#1C1C1E]"
          style={{ width: 200, height: 52, borderRadius: 26 }}
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={springConfig}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <div
            className="absolute inset-0 opacity-20 brightness-110 grayscale transition-opacity dark:opacity-10 dark:brightness-50"
            style={{
              backgroundImage: "url(https://images.unsplash.com/photo-1526778548025-fa2f459cd5ce?q=80&w=2000&auto=format&fit=crop)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="relative z-10 flex items-center space-x-2.5 px-4 py-4">
            <FaMapLocationDot className="h-5 w-5 text-[#6A6973] transition-colors dark:text-white/60" />
            <span className="text-[15px] font-semibold tracking-tight text-[#3D3C43] transition-colors dark:text-white">
              Track on Map
            </span>
          </div>
        </motion.div>
      ) : (
        /* --- EXPANDED MAP (fixed fullscreen overlay) --- */
        <motion.div
          key="map-expanded"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) toggleOpen(); }}
        >
          {/* CLOSE BUTTON */}
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            onClick={toggleOpen}
            className="absolute top-4 left-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#85848B] shadow-lg transition-all hover:bg-gray-50 active:scale-90 sm:top-6 sm:left-6 sm:h-11 sm:w-11 dark:bg-[#2A2A2D] dark:text-white dark:hover:bg-[#3A3A3D]"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
          </motion.button>

          {/* Map card */}
          <motion.div
            className="relative w-[calc(100vw-32px)] bg-[#DEDEDE] shadow-2xl sm:w-[720px] dark:bg-[#141414]"
            style={{ borderRadius: 32, aspectRatio: "1 / 0.6", touchAction: "none", overflow: "hidden" }}
            initial={{ scale: 0.85, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={springConfig}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Leaflet map */}
            <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ touchAction: "none" }} />

            {/* GPS waiting / error */}
            <AnimatePresence>
              {(isWaiting || gpsError) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-[800] bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5"
                >
                  {gpsError ? (
                    <>
                      <span className="material-symbols-outlined text-[14px] text-red-500">location_off</span>
                      <span className="text-[11px] font-semibold text-red-600 max-w-[200px] truncate">{gpsError}</span>
                      <button
                        onClick={() => {
                          setGpsError(null);
                          setIsWaiting(true);
                          // GPS context will handle position updates automatically
                        }}
                        className="text-[11px] font-bold text-primary hover:underline cursor-pointer ml-1"
                      >
                        Retry
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] font-semibold text-gray-700">{waitingLabel}</span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Re-center */}
            <AnimatePresence>
              {isMapLoaded && !isFollowing && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={recenter}
                  className="absolute bottom-16 right-4 z-[800] w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">my_location</span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Bottom info pill */}
            {isMapLoaded && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="absolute bottom-3 left-3 right-3 z-[800] bg-white/90 backdrop-blur-sm rounded-2xl px-3 py-2.5 shadow-md flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1">
                    <span className="text-sm">🚲</span>
                    <span className="text-[10px] text-gray-600 font-semibold">
                      {role === "client" ? specialistName : "You"}
                    </span>
                  </div>
                  <div className="w-px h-3 bg-gray-200" />
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] text-gray-600 font-semibold">
                      {role === "client" ? "You" : booking.clientName || "Client"}
                    </span>
                  </div>
                  {distance && (
                    <>
                      <div className="w-px h-3 bg-gray-200" />
                      <span className="text-[10px] text-gray-500 font-medium">{distance}</span>
                    </>
                  )}
                </div>
                {eta != null && (
                  <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full">
                    <span className="material-symbols-outlined text-primary text-[11px]">schedule</span>
                    <span className="text-[10px] font-bold text-primary">{eta}m</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
