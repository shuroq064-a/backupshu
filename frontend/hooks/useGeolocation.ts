"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { bookingApi } from "@/lib/api";

interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGeolocationOptions {
  bookingId: string;
  enabled: boolean;
  intervalMs?: number;
  onPositionUpdate?: (pos: GeoPosition) => void;
}

/**
 * Tracks the device GPS and sends location updates to the backend at a
 * configurable interval.  Designed for specialists during active bookings
 * (started → reached → ongoing) so clients can see real-time position.
 */
export function useGeolocation({
  bookingId,
  enabled,
  intervalMs = 8000,
  onPositionUpdate,
}: UseGeolocationOptions) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<GeoPosition | null>(null);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sendToBackend = useCallback(
    async (pos: GeoPosition) => {
      try {
        setSending(true);
        await bookingApi.updateLocation(bookingId, pos.latitude, pos.longitude);
        lastSentRef.current = pos;
        onPositionUpdate?.(pos);
      } catch (err) {
        console.warn("[useGeolocation] Failed to send location:", err);
      } finally {
        setSending(false);
      }
    },
    [bookingId, onPositionUpdate]
  );

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setError("Geolocation not available");
      return;
    }

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const pos: GeoPosition = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
        setPosition(pos);
        sendToBackend(pos);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GeoPosition = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
        setPosition(pos);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    // Send to backend at interval
    intervalRef.current = setInterval(() => {
      // Use latest position from watchPosition
      navigator.geolocation.getCurrentPosition(
        (geo) => {
          const pos: GeoPosition = {
            latitude: geo.coords.latitude,
            longitude: geo.coords.longitude,
            accuracy: geo.coords.accuracy,
          };
          setPosition(pos);
          sendToBackend(pos);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 }
      );
    }, intervalMs);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, sendToBackend]);

  return { position, error, sending };
}
