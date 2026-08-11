"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Navigation } from "lucide-react";
import { FaMapLocationDot } from "react-icons/fa6";
import type { BookingDetail, LocationUpdateEvent } from "@/types";
import { WS_BASE_URL, API_BASE_URL } from "@/lib/config";
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

  const lastFetchPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const routeFetchInFlightRef = useRef(false);
  const routeOpenTimeRef = useRef<number>(0);
  const FITBOUNDS_GRACE_MS = 2000;
  const FETCH_MIN_DISTANCE_M = 100;
  const FETCH_MIN_INTERVAL_MS = 30000;

  const { position: gpsPosition, isTracking, error: gpsContextError } = useGpsTracking();

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

  // Live specialist position. booking.currentLatitude/currentLongitude are a
  // stale snapshot (never refreshed by WS events), so track the latest position
  // here — the Navigate button must use it as the Google Maps origin, otherwise
  // Google picks the device location as the start and the routes don't match.
  const [specPos, setSpecPos] = useState<{ latitude: number; longitude: number } | null>(() =>
    booking.currentLatitude && booking.currentLongitude
      ? { latitude: booking.currentLatitude, longitude: booking.currentLongitude }
      : null
  );

  useEffect(() => {
    if (gpsContextError) setGpsError(gpsContextError);
  }, [gpsContextError]);

  useEffect(() => {
    if (role === "specialist" && booking.currentLatitude && booking.currentLongitude) {
      setIsWaiting(false);
    }
  }, [booking.currentLatitude, booking.currentLongitude, role]);

  const isClosingRef = useRef(false);

  const toggleOpen = () => {
    if (isOpen) {
      isClosingRef.current = true;
      setIsMapLoaded(false);
      setIsOpen(false);
    } else {
      isClosingRef.current = false;
      setIsOpen(true);
    }
  };

  const springConfig = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 0.8,
  };

  const clearRoute = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map: any) => {
      if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
      if (glowLayerRef.current) { map.removeLayer(glowLayerRef.current); glowLayerRef.current = null; }
    },
    []
  );

  const drawRoute = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L: any, map: any, coords: [number, number][]) => {
      if (!coords.length) return;
      clearRoute(map);
      routeCoordsRef.current = coords;
      glowLayerRef.current = L.polyline(coords, { color: "#3b82f6", weight: 8, opacity: 0.15, smoothFactor: 1.5, lineCap: "round", lineJoin: "round" }).addTo(map);
      routeLayerRef.current = L.polyline(coords, { color: "#2563eb", weight: 3.5, opacity: 0.9, smoothFactor: 1.5, lineCap: "round", lineJoin: "round" }).addTo(map);
    },
    [clearRoute]
  );

  const getBearingFromRoute = useCallback(
    (specLat: number, specLng: number): number => {
      const coords = routeCoordsRef.current;
      if (coords.length < 2) {
        const clat = booking.customerLatitude;
        const clng = booking.customerLongitude;
        if (clat && clng) return calcBearing(specLat, specLng, clat, clng);
        return lastBearingRef.current;
      }
      let minDist = Infinity,
        idx = 0;
      for (let i = 0; i < coords.length; i++) {
        const d = haversineMeters(specLat, specLng, coords[i][0], coords[i][1]);
        if (d < minDist) {
          minDist = d;
          idx = i;
        }
      }
      const next = Math.min(idx + 3, coords.length - 1);
      if (next === idx) {
        const clat = booking.customerLatitude;
        const clng = booking.customerLongitude;
        if (clat && clng) return calcBearing(specLat, specLng, clat, clng);
        return lastBearingRef.current;
      }
      return calcBearing(coords[idx][0], coords[idx][1], coords[next][0], coords[next][1]);
    },
    [booking.customerLatitude, booking.customerLongitude]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followNavigation = useCallback((map: any, specLat: number, specLng: number) => {
    const bearing = getBearingFromRoute(specLat, specLng);
    lastBearingRef.current = bearing;
    try {
      map.setView([specLat, specLng], map.getZoom(), { animate: true, duration: 0.6 });
    } catch {}
    if (map.setBearing) map.setBearing(-bearing);
    const mapHeight = mapRef.current?.clientHeight ?? 500;
    try {
      // panBy animates the map's pane; it can throw (or crash on the next
      // animation frame) if a drag/animation is already in flight — e.g. right
      // after dragstart. Guard it so a stale in-flight pan can't break the map.
      map.panBy([0, mapHeight * 0.3], { animate: true, duration: 0.3 });
    } catch {}
  }, [getBearingFromRoute]);

  // Straight-line fallback route — used when the driving route service is
  // unreachable so the map always has a visible start→destination line.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawStraightLine = useCallback((L: any, map: any, sLat: number, sLng: number, cLat: number, cLng: number) => {
    const steps = 24;
    const coords: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      coords.push([sLat + (cLat - sLat) * t, sLng + (cLng - sLng) * t]);
    }
    drawRoute(L, map, coords);
    setDistance(haversineMeters(sLat, sLng, cLat, cLng) >= 1000
      ? `${(haversineMeters(sLat, sLng, cLat, cLng) / 1000).toFixed(1)} km`
      : `${Math.round(haversineMeters(sLat, sLng, cLat, cLng))} m`);
  }, [drawRoute]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchRoute = useCallback(async (L: any, map: any, sLat: number, sLng: number, cLat: number, cLng: number) => {
    if (routeFetchInFlightRef.current) return;
    routeFetchInFlightRef.current = true;

    const url = `${API_BASE_URL}/routes/driving?origin_lat=${sLat}&origin_lng=${sLng}&destination_lat=${cLat}&destination_lng=${cLng}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res2 = await fetch(url);
        data = await res2.json();
      } catch {}
    }

    routeFetchInFlightRef.current = false;
    if (!leafletMap.current) return;

    if (data?.coordinates?.length >= 2) {
      const coords: [number, number][] = data.coordinates.map((c: [number, number]) => [c[0], c[1]]);
      setDistance(data.distance_meters >= 1000
        ? `${(data.distance_meters / 1000).toFixed(1)} km`
        : `${Math.round(data.distance_meters)} m`);
      if (!booking.etaMinutes && data.eta_minutes) setEta(data.eta_minutes);
      drawRoute(L, map, coords);
      if (Date.now() - routeOpenTimeRef.current < FITBOUNDS_GRACE_MS) {
        const bounds = L.latLngBounds([sLat, sLng], [cLat, cLng]);
        map.fitBounds(bounds.pad(0.15), { animate: true, duration: 0.5 });
      } else if (followModeRef.current) {
        followNavigation(map, sLat, sLng);
      }
    } else if (!routeCoordsRef.current.length) {
      // No driving route available — fall back to a straight line so the map
      // still shows the start→destination path and distance.
      drawStraightLine(L, map, sLat, sLng, cLat, cLng);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawRoute, drawStraightLine, followNavigation]);

  const throttledFetchRoute = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L: any, map: any, sLat: number, sLng: number, cLat: number, cLng: number) => {
      const now = Date.now();
      const lastPos = lastFetchPosRef.current;
      const lastTime = lastFetchTimeRef.current;
      if (lastPos && (now - lastTime) < FETCH_MIN_INTERVAL_MS) {
        const distMoved = haversineMeters(sLat, sLng, lastPos.lat, lastPos.lng);
        if (distMoved < FETCH_MIN_DISTANCE_M) return;
      }
      lastFetchPosRef.current = { lat: sLat, lng: sLng };
      lastFetchTimeRef.current = now;
      fetchRoute(L, map, sLat, sLng, cLat, cLng);
    },
    [fetchRoute]
  );

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
        if (role === "specialist") {
          followNavigation(map, ll.lat, ll.lng);
        } else {
          map.setView([ll.lat, ll.lng], 17, { animate: true, duration: 0.4 });
          if (map.setBearing) map.setBearing(0);
        }
      }
    }).catch(() => {});
  }, [role, followNavigation]);

  const makeSpecIcon = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L: any) => {
      if (!document.getElementById("nav-pulse-keyframes")) {
        const style = document.createElement("style");
        style.id = "nav-pulse-keyframes";
        style.textContent = "@keyframes navPulse{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.4);opacity:0}}";
        document.head.appendChild(style);
      }
      return L.divIcon({
        className: "",
        html: `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(0,137,123,.15);animation:navPulse 2s ease-in-out infinite;"></div>
          <div style="width:36px;height:36px;border-radius:50%;background:#00897b;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,137,123,.5);border:3px solid white;position:relative;z-index:1;">
            <span style="font-size:18px;">🚲</span>
          </div>
        </div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });
    },
    []
  );

  const makeClientIcon = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L: any) => L.divIcon({
      className: "",
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(239,68,68,.4);border:3px solid white;">
        <span class="material-symbols-outlined" style="font-size:15px;color:white">person</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    }),
    []
  );

  // ── Master effect: owns map lifecycle, markers, route, WS, GPS ──
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;
    let disposed = false;
    let invalidateTimer1: ReturnType<typeof setTimeout> | null = null;
    let invalidateTimer2: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let L: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    let onDragStart: (() => void) | null = null;

    // ── Reset all state for fresh open ──
    specialistMarkerRef.current = null;
    routeLayerRef.current = null;
    glowLayerRef.current = null;
    routeCoordsRef.current = [];
    lastFetchPosRef.current = null;
    lastFetchTimeRef.current = 0;
    routeFetchInFlightRef.current = false;
    routeOpenTimeRef.current = Date.now();
    followModeRef.current = true;
    lastBearingRef.current = 0;

    const timer = setTimeout(async () => {
      if (disposed || !mapRef.current) return;

      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.id = "leaflet-css";
        document.head.appendChild(link);
      }

      try {
        const leaflet = await import("leaflet");
        await import("leaflet-rotate");
        L = leaflet.default;
      } catch {
        if (!disposed) setGpsError("Failed to load map. Check your connection.");
        return;
      }
      if (disposed || !mapRef.current) return;

      const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
      const sLat = booking.currentLatitude, sLng = booking.currentLongitude;
      const centerLat = role === "client" ? (cLat ?? sLat) : (sLat ?? cLat);
      const centerLng = role === "client" ? (cLng ?? sLng) : (sLng ?? cLng);

      map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true,
        bounceAtZoomLimits: false,
        rotate: true, rotateControl: false, pitch: false,
      }).setView(
        centerLat && centerLng ? [centerLat, centerLng] : [17.385, 78.4867],
        18
      );

      L.tileLayer("https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
         maxZoom: 20, attribution: "&copy; OpenStreetMap, &copy; CARTO",
       }).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      if (cLat && cLng) L.marker([cLat, cLng], { icon: makeClientIcon(L) }).addTo(map);

      if (sLat && sLng) {
        specialistMarkerRef.current = L.marker([sLat, sLng], { icon: makeSpecIcon(L) })
          .addTo(map)
          .bindPopup(role === "client" ? specialistName : "Your location");
        if (role === "specialist") setIsWaiting(false);
      } else if (role === "specialist") {
        setIsWaiting(true);
      }

      if (cLat && cLng && sLat && sLng) {
        fetchRoute(L, map, sLat, sLng, cLat, cLng);
      } else if (sLat && sLng) {
        map.setView([sLat, sLng], 18);
      } else if (cLat && cLng) {
        map.setView([cLat, cLng], 18);
      }

      onDragStart = () => { followModeRef.current = false; setIsFollowing(false); };
      map.on("dragstart", onDragStart);

      leafletMap.current = map;
      setIsMapLoaded(true);

      invalidateTimer1 = setTimeout(() => { if (!disposed && leafletMap.current) map.invalidateSize(); }, 300);
      invalidateTimer2 = setTimeout(() => { if (!disposed && leafletMap.current) map.invalidateSize(); }, 800);

      // ── WebSocket: live location updates ──
      const token = getToken();
      if (token) {
        const safeToken = token;
        function connectWs() {
          if (disposed) return;
          ws = new WebSocket(
            `${WS_BASE_URL}/ws/bookings/${encodeURIComponent(booking.id)}?token=${encodeURIComponent(safeToken)}`
          );
          ws.onmessage = (e) => {
            try {
              const data = JSON.parse(e.data) as LocationUpdateEvent;
              if (data.type !== "LOCATION_UPDATE") return;
              if (data.etaMinutes != null) setEta(data.etaMinutes);
              setSpecPos({ latitude: data.latitude, longitude: data.longitude });
              if (!leafletMap.current || !L || disposed) return;

              const map = leafletMap.current;

              if (!specialistMarkerRef.current) {
                specialistMarkerRef.current = L.marker([data.latitude, data.longitude], { icon: makeSpecIcon(L) })
                  .addTo(map)
                  .bindPopup(role === "client" ? specialistName : "Your location");
                setIsWaiting(false);
                const destLat = booking.customerLatitude, destLng = booking.customerLongitude;
                if (destLat && destLng) fetchRoute(L, map, data.latitude, data.longitude, destLat, destLng);
              } else {
                (specialistMarkerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([data.latitude, data.longitude]);
                if (followModeRef.current) followNavigation(map, data.latitude, data.longitude);
                const destLat = booking.customerLatitude, destLng = booking.customerLongitude;
                if (destLat && destLng) throttledFetchRoute(L, map, data.latitude, data.longitude, destLat, destLng);
              }
            } catch {}
          };
          ws.onerror = () => ws?.close();
          ws.onclose = () => {
            if (!disposed) reconnectTimer = setTimeout(connectWs, 3000);
          };
        }
        connectWs();
      }
    }, 200);

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (invalidateTimer1) clearTimeout(invalidateTimer1);
      if (invalidateTimer2) clearTimeout(invalidateTimer2);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      if (onDragStart && map) try { map.off("dragstart", onDragStart); } catch {}
      if (map && typeof map.remove === "function") try { map.remove(); } catch {}
      leafletMap.current = null;
      specialistMarkerRef.current = null;
      routeLayerRef.current = null;
      glowLayerRef.current = null;
      routeCoordsRef.current = [];
      lastFetchPosRef.current = null;
      lastFetchTimeRef.current = 0;
      routeFetchInFlightRef.current = false;
      routeOpenTimeRef.current = 0;
      setIsMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── GPS context: specialist sends own position to server ──
  useEffect(() => {
    if (role !== "specialist" || !gpsPosition || !isOpen || !isMapLoaded) return;
    if (!leafletMap.current) return;

    let cancelled = false;
    setIsWaiting(false);
    setSpecPos({ latitude: gpsPosition.latitude, longitude: gpsPosition.longitude });

    if (!specialistMarkerRef.current) {
      import("leaflet").then((leaflet) => {
        if (cancelled || !leafletMap.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = leafletMap.current as any;
        const LocalL = leaflet.default;
        specialistMarkerRef.current = LocalL.marker([gpsPosition.latitude, gpsPosition.longitude], { icon: makeSpecIcon(LocalL) })
          .addTo(map)
          .bindPopup("Your location");
        if (followModeRef.current) followNavigation(map, gpsPosition.latitude, gpsPosition.longitude);
        const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
        if (cLat && cLng) fetchRoute(LocalL, map, gpsPosition.latitude, gpsPosition.longitude, cLat, cLng);
      }).catch(() => {});
    } else {
      (specialistMarkerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([gpsPosition.latitude, gpsPosition.longitude]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (followModeRef.current) followNavigation(leafletMap.current as any, gpsPosition.latitude, gpsPosition.longitude);
      const cLat = booking.customerLatitude, cLng = booking.customerLongitude;
      if (cLat && cLng) {
        import("leaflet").then((leaflet) => {
          if (cancelled || !leafletMap.current) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          throttledFetchRoute(leaflet.default, leafletMap.current as any, gpsPosition.latitude, gpsPosition.longitude, cLat, cLng);
        }).catch(() => {});
      }
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsPosition, role, isOpen, isMapLoaded]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const waitingLabel = role === "client"
    ? `Waiting for ${specialistName}'s location...`
    : "Starting location tracking...";

  return createPortal(
    <AnimatePresence onExitComplete={() => { if (isClosingRef.current) { isClosingRef.current = false; onClose(); } }}>
      {!isOpen ? (
        /* --- PILL BUTTON (fixed bottom-center) --- */
        <motion.div
          key="pill"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); } }}
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

           {/* GOOGLE MAPS NAVIGATE BUTTON */}
           {/* Specialist-only: routes from the specialist's LIVE position to the
               customer. Explicit origin keeps Google Maps' route in sync with the
               tracking map (no origin → Google uses the device location instead). */}
           {isMapLoaded && role === "specialist" && specPos && (booking.customerLatitude && booking.customerLongitude) && (
             <motion.a
               initial={{ opacity: 0, scale: 0.5 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.25 }}
               href={`https://www.google.com/maps/dir/?api=1&origin=${specPos.latitude},${specPos.longitude}&destination=${booking.customerLatitude},${booking.customerLongitude}&travelmode=driving`}
               target="_blank"
               rel="noopener noreferrer"
               className="absolute top-4 right-4 z-[9999] flex items-center gap-2 h-10 px-4 rounded-full bg-[#4285F4] text-white shadow-lg transition-all hover:bg-[#3367D6] active:scale-95 sm:top-6 sm:right-6 sm:h-11 dark:bg-[#5C9FFF] dark:hover:bg-[#4285F4]"
               title="Open in Google Maps"
             >
               <Navigation className="h-4 w-4 sm:h-5 sm:w-5" />
               <span className="text-xs font-semibold hidden sm:inline">Navigate</span>
             </motion.a>
           )}

          {/* Map card */}
          <motion.div
            className="relative h-[100dvh] w-full bg-[#DEDEDE] shadow-2xl sm:h-auto sm:w-[720px] sm:aspect-[1/0.6] rounded-none sm:rounded-[32px] dark:bg-[#141414]"
            style={{ touchAction: "none", overflow: "hidden" }}
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
                  className="absolute top-16 left-1/2 -translate-x-1/2 sm:top-4 z-[800] bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5"
                >
                  {gpsError ? (
                    <>
                      <span className="material-symbols-outlined text-[14px] text-red-500">location_off</span>
                      <span className="text-[11px] font-semibold text-red-600 max-w-[55vw] sm:max-w-[200px] truncate">{gpsError}</span>
                      <button
                        onClick={() => {
                          setGpsError(null);
                          setIsWaiting(true);
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

             {/* Apple Design — Materials & depth (§12 from apple-design skill) */}
             {isMapLoaded && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 transition={{ delay: 0.2, type: "spring", bounce: 0, duration: 0.4 }}
                 className="absolute top-16 left-3 right-3 sm:top-3 sm:left-3 sm:right-auto sm:w-[220px] z-[800] rounded-2xl overflow-hidden dark:border dark:border-white/10"
                 style={{
                   boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
                 }}
               >
                 {/* Light mode: Apple vibrancy rgba(255,255,255,0.6) + blur(20px) saturate(180%) */}
                 <div
                   className="absolute inset-0 dark:hidden"
                   style={{ background: "rgba(255, 255, 255, 0.6)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}
                 />
                 {/* Dark mode: solid dark surface with subtle gradient */}
                 <div
                   className="absolute inset-0 hidden dark:block"
                   style={{ background: "linear-gradient(180deg, rgba(44,44,46,0.85) 0%, rgba(28,28,30,0.9) 100%)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}
                 />
                 {/* Bright top edge — light catching the material */}
                 <div className="absolute top-0 left-0 right-0 h-px bg-white/60 dark:bg-white/20" />
                 {/* Content */}
                 <div className="relative">
                   {/* Row 1: Specialist */}
                   <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
                     <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(16, 185, 129, 0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                       <span className="text-base">🚲</span>
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="text-[12px] font-semibold text-gray-900 dark:text-white leading-tight truncate" style={{ letterSpacing: "-0.01em" }}>
                         {role === "client" ? specialistName : "You"}
                       </p>
                       <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium tracking-wide uppercase">Specialist</p>
                     </div>
                   </div>
                   {/* Divider — hairline */}
                   <div className="mx-3.5 h-px bg-gray-900/8 dark:bg-white/10" />
                   {/* Row 2: Customer */}
                   <div className="flex items-center gap-2.5 px-3.5 pt-2 pb-3">
                     <div className="w-9 h-9 rounded-xl flex items-center justify-center dark:bg-red-500/20" style={{ background: "rgba(239, 68, 68, 0.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                       <span className="material-symbols-outlined text-[16px] text-red-500 dark:text-red-400">person</span>
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="text-[12px] font-semibold text-gray-900 dark:text-white leading-tight truncate" style={{ letterSpacing: "-0.01em" }}>
                         {role === "client" ? "You" : booking.clientName || "Client"}
                       </p>
                       <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium tracking-wide uppercase">Customer</p>
                     </div>
                   </div>
                   {/* Stats bar */}
                   <div className="flex items-center gap-2 px-3.5 pb-3 pt-1">
                     {distance && (
                       <div className="flex-1 text-center rounded-lg py-1.5 dark:bg-white/10" style={{ background: "rgba(0,0,0,0.04)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}>
                         <p className="text-[12px] font-bold text-gray-900 dark:text-white">{distance}</p>
                         <p className="text-[7px] text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em] font-semibold">dist</p>
                       </div>
                     )}
                     {eta != null && (
                       <div className="flex-1 text-center rounded-lg py-1.5 dark:bg-blue-500/25" style={{ background: "rgba(59, 130, 246, 0.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)" }}>
                         <p className="text-[12px] font-bold text-blue-600 dark:text-blue-300">{eta} min</p>
                         <p className="text-[7px] text-blue-500/60 dark:text-blue-400/70 uppercase tracking-[0.1em] font-semibold">ETA</p>
                       </div>
                     )}
                   </div>
                 </div>
               </motion.div>
             )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
