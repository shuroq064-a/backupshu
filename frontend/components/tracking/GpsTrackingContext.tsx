"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { bookingApi } from "@/lib/api";

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface GpsTrackingContextValue {
  position: GpsPosition | null;
  isTracking: boolean;
  error: string | null;
  startTracking: (bookingId: string) => void;
  stopTracking: () => void;
}

const GpsTrackingContext = createContext<GpsTrackingContextValue | null>(null);

export function useGpsTracking(): GpsTrackingContextValue {
  const ctx = useContext(GpsTrackingContext);
  if (!ctx) throw new Error("useGpsTracking must be used within GpsTrackingProvider");
  return ctx;
}

export function GpsTrackingProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bookingIdRef = useRef<string | null>(null);

  const sendToBackend = useCallback(async (bookingId: string, pos: GpsPosition) => {
    try {
      await bookingApi.updateLocation(bookingId, pos.latitude, pos.longitude);
    } catch {
      // silent — will retry on next interval tick
    }
  }, []);

  const startTracking = useCallback((bookingId: string) => {
    if (watchIdRef.current !== null) return;

    if (!navigator.geolocation) {
      setError("Geolocation not available");
      return;
    }

    bookingIdRef.current = bookingId;
    setIsTracking(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const pos: GpsPosition = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
          timestamp: geo.timestamp,
        };
        setPosition(pos);
        setError(null);
        sendToBackend(bookingId, pos);
      },
      (err) => {
        const msg = err.code === 1 ? "GPS permission denied" : err.code === 2 ? "GPS unavailable" : "GPS timeout";
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GpsPosition = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
          timestamp: geo.timestamp,
        };
        setPosition(pos);
        setError(null);
      },
      (err) => {
        const msg = err.code === 1 ? "GPS permission denied" : err.code === 2 ? "GPS unavailable" : "GPS timeout";
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [sendToBackend]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    bookingIdRef.current = null;
    setIsTracking(false);
    setPosition(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <GpsTrackingContext.Provider value={{ position, isTracking, error, startTracking, stopTracking }}>
      {children}
    </GpsTrackingContext.Provider>
  );
}
