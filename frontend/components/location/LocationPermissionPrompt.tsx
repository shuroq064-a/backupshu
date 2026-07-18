"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { locationPermissionApi } from "@/lib/api";
import { ServiceLocationFlow } from "@/components/location/ServiceLocationFlow";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import { useAppDispatch, useAppSelector } from "@/store";
import { setLocation, updateLocation } from "@/store/slices/authSlice";
import type {
  LocationPermissionChoice,
  LocationPlaceResult,
  ServiceLocation,
} from "@/types";

const PERMISSION_KEY = "shuroqx_location_permission";
const SERVICE_LOCATION_KEY = "shuroqx_service_location";
const SAVED_LOCATIONS_KEY = "shuroqx_saved_locations";
const SESSION_PERMISSION_KEY = "shuroqx_location_permission_session";
const GRANTED_SESSION_KEY = "shuroqx_location_permission_granted_session";
const API_URL = API_BASE_URL;

type PermissionState = "idle" | "detecting" | "manual" | "saving";

const GPS_TIMEOUT_MS = 15000;

function readStoredServiceLocation(): ServiceLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(SERVICE_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredServiceLocation(location: ServiceLocation) {
  localStorage.setItem(SERVICE_LOCATION_KEY, JSON.stringify(location));
  window.dispatchEvent(new CustomEvent("shuroqx-service-location", { detail: location }));
}

function addSavedLocation(address: string) {
  const cleaned = address.trim();
  if (!cleaned) return;

  let locations: string[] = [];
  try {
    const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
    locations = raw ? JSON.parse(raw) : [];
  } catch {
    locations = [];
  }

  const exists = locations.some((item) => item.toLowerCase() === cleaned.toLowerCase());
  const next = exists ? locations : [cleaned, ...locations].slice(0, 12);
  localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("shuroqx-saved-locations", { detail: next }));
}

function clearWhileUsingSession() {
  sessionStorage.removeItem(SESSION_PERMISSION_KEY);
  sessionStorage.removeItem(GRANTED_SESSION_KEY);
  localStorage.removeItem(SERVICE_LOCATION_KEY);
}

function hasGrantedPermissionForSession() {
  return (
    sessionStorage.getItem(GRANTED_SESSION_KEY) === "true" ||
    sessionStorage.getItem(SESSION_PERMISSION_KEY) === "While Using This Site" ||
    localStorage.getItem(PERMISSION_KEY) === "Allow all the time"
  );
}

function grantedPermissionChoice(): LocationPermissionChoice | null {
  if (sessionStorage.getItem(SESSION_PERMISSION_KEY) === "While Using This Site") {
    return "While Using This Site";
  }
  if (localStorage.getItem(PERMISSION_KEY) === "Allow all the time") {
    return "Allow all the time";
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function getLocationErrorMessage(error: unknown) {
  if (error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Browser location access is blocked. Please allow location for this site or choose a location manually.";
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Your device could not provide a live location right now. Please try again or choose a location manually.";
    }
    if (error.code === error.TIMEOUT) {
      return "Live location took too long to respond. Please try again or choose a location manually.";
    }
  }

  return error instanceof Error
    ? error.message
    : "Live location could not be detected. Please choose a location manually.";
}

function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location detection."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: GPS_TIMEOUT_MS,
      maximumAge: 0,
    });
  });
}

export function LegacyLocationPermissionPrompt() {
  const dispatch = useAppDispatch();
  const { user, activeMode, isHydrated, location } = useAppSelector((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PermissionState>("idle");
  const [message, setMessage] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [places, setPlaces] = useState<LocationPlaceResult[]>([]);
  const [selected, setSelected] = useState<ServiceLocation | null>(null);

  const isClientDashboard = isHydrated && Boolean(user) && activeMode === "client";
  const hasExistingLocation = Boolean(selected?.address || location);

  const title = useMemo(() => {
    if (state === "manual") return "Choose service location";
    if (state === "detecting") return "Detecting your location";
    return "Allow location access?";
  }, [state]);

  const persistLocation = useCallback(
    (serviceLocation: ServiceLocation) => {
      setSelected(serviceLocation);
      setManualAddress(serviceLocation.address);
      saveStoredServiceLocation(serviceLocation);
      addSavedLocation(serviceLocation.address);
      dispatch(setLocation(serviceLocation.address));
      void dispatch(updateLocation(serviceLocation.address));
    },
    [dispatch]
  );

  const detectAndSave = useCallback(
    async (choice: LocationPermissionChoice) => {
      setState("detecting");
      setMessage("Checking your device location...");

      await withTimeout(
        locationPermissionApi.detect(),
        6000,
        "Location permission check took too long. Please try again or choose a location manually."
      );
      const position = await withTimeout(
        getBrowserPosition(),
        GPS_TIMEOUT_MS + 3000,
        "Live location took too long to respond. Please try again or choose a location manually."
      );
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let address = `Detected location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
      try {
        const resolved = await locationPermissionApi.reverseGeocode(latitude, longitude);
        if (resolved.formatted_address) address = resolved.formatted_address;
      } catch {
        setMessage("Location detected, but the address could not be resolved. You can edit it manually.");
      }

      persistLocation({
        address,
        latitude,
        longitude,
        permission: choice,
        source: "gps",
      });
      setMessage("Location detected. You can edit it before booking.");
      setState("manual");
    },
    [persistLocation]
  );

  const handleLiveLocation = useCallback(async () => {
    const choice = grantedPermissionChoice();
    if (!choice) {
      setState("idle");
      setMessage("Please choose a location permission option first.");
      return;
    }

    try {
      await locationPermissionApi.requestPermission(choice);
      await detectAndSave(choice);
    } catch (err) {
      setState("manual");
      setMessage(getLocationErrorMessage(err));
    }
  }, [detectAndSave]);

  const handlePermissionChoice = useCallback(
    async (choice: LocationPermissionChoice) => {
      setMessage("");
      try {
        const response = await locationPermissionApi.requestPermission(choice);

        if (choice === "Allow all the time") {
          await detectAndSave(choice);
          localStorage.setItem(PERMISSION_KEY, choice);
          sessionStorage.setItem(GRANTED_SESSION_KEY, "true");
          sessionStorage.removeItem(SESSION_PERMISSION_KEY);
          return;
        }

        if (choice === "While Using This Site") {
          await detectAndSave(choice);
          sessionStorage.setItem(SESSION_PERMISSION_KEY, choice);
          sessionStorage.setItem(GRANTED_SESSION_KEY, "true");
          localStorage.removeItem(PERMISSION_KEY);
          return;
        }

        localStorage.setItem(PERMISSION_KEY, choice);
        sessionStorage.removeItem(SESSION_PERMISSION_KEY);
        setState("manual");
        setMessage(response.message || "Location access is off. You can still choose a service location manually.");
      } catch (err) {
        setState("manual");
        setMessage(err instanceof Error ? err.message : "Location setup failed. Please enter your location manually.");
      }
    },
    [detectAndSave]
  );

  const handleManualSave = useCallback(
    async (place?: LocationPlaceResult) => {
      const address = (place?.address || manualAddress).trim();
      if (!address) {
        setMessage("Please enter a service location to continue.");
        return;
      }

      setState("saving");
      let nextLocation: ServiceLocation = {
        address,
        permission:
          (sessionStorage.getItem(SESSION_PERMISSION_KEY) as LocationPermissionChoice | null) ||
          (localStorage.getItem(PERMISSION_KEY) as LocationPermissionChoice | null) ||
          undefined,
        source: "manual",
      };

      if (place) {
        nextLocation = {
          ...nextLocation,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        };
      } else {
        try {
          const resolved = await locationPermissionApi.geocode(address);
          nextLocation = {
            ...nextLocation,
            address: resolved.formatted_address || address,
            latitude: resolved.latitude ?? undefined,
            longitude: resolved.longitude ?? undefined,
          };
        } catch {
          nextLocation = { ...nextLocation, address };
        }
      }

      persistLocation(nextLocation);
      setMessage("Service location saved.");
      setState("manual");
      setOpen(false);
    },
    [manualAddress, persistLocation]
  );

  const searchManualPlaces = useCallback(async () => {
    const query = manualAddress.trim();
    if (!query) {
      setPlaces([]);
      return;
    }

    setMessage("");
    try {
      const results = await locationPermissionApi.searchPlaces(query);
      setPlaces(results);
      if (!results.length) setMessage("No matching places found. You can still save the typed address.");
    } catch (err) {
      setPlaces([]);
      setMessage(err instanceof Error ? err.message : "Place search is unavailable. You can save the typed address.");
    }
  }, [manualAddress]);

  useEffect(() => {
    if (!isClientDashboard) return;

    const storedLocation = readStoredServiceLocation();
    if (storedLocation) {
      setSelected(storedLocation);
      setManualAddress(storedLocation.address);
      dispatch(setLocation(storedLocation.address));
    }

    const sessionChoice = sessionStorage.getItem(SESSION_PERMISSION_KEY);
    const persistentChoice = localStorage.getItem(PERMISSION_KEY);

    if (sessionChoice === "While Using This Site") return;
    if (persistentChoice === "Allow all the time") {
      void locationPermissionApi.requestPermission("Allow all the time")
        .then(() => detectAndSave("Allow all the time"))
        .catch(() => {});
      return;
    }
    if (persistentChoice === "Deny") return;

    setOpen(true);
  }, [detectAndSave, dispatch, isClientDashboard]);

  useEffect(() => {
    const openPermission = () => {
      const storedLocation = readStoredServiceLocation();
      if (storedLocation) {
        setSelected(storedLocation);
        setManualAddress(storedLocation.address);
      }
      setPlaces([]);
      setMessage("");
      setState(hasGrantedPermissionForSession() ? "manual" : "idle");
      setOpen(true);
    };

    window.addEventListener("shuroqx-open-location-permission", openPermission);
    return () => window.removeEventListener("shuroqx-open-location-permission", openPermission);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionStorage.getItem(SESSION_PERMISSION_KEY) !== "While Using This Site") return;

      clearWhileUsingSession();
      const token = getToken();
      fetch(`${API_URL}/location-permission/clear-on-close`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: "{}",
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  if (!isClientDashboard || !open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-on-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Location permission</p>
            <h2 className="text-lg font-bold text-on-surface mt-1">{title}</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Used only for service discovery, specialist matching, and navigation.
            </p>
          </div>
          {hasExistingLocation && (
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Close
            </button>
          )}
        </div>

        <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
          <div className="min-h-64 bg-primary/5 relative overflow-hidden border-b md:border-b-0 md:border-r border-outline-variant">
            <div className="absolute inset-0 opacity-60 bg-[linear-gradient(90deg,rgba(16,185,129,0.18)_1px,transparent_1px),linear-gradient(0deg,rgba(16,185,129,0.18)_1px,transparent_1px)] bg-[size:28px_28px]" />
            <div className="absolute inset-x-8 top-12 h-8 rounded-full bg-white/70 rotate-[-12deg]" />
            <div className="absolute inset-x-10 bottom-12 h-9 rounded-full bg-white/70 rotate-[16deg]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
              <div className="h-12 w-12 rounded-full bg-primary text-on-primary shadow-lg shadow-primary/25 flex items-center justify-center font-bold">
                PIN
              </div>
              <div className="mx-auto h-5 w-5 rotate-45 bg-primary -mt-3" />
            </div>
            <div className="absolute left-4 right-4 bottom-4 rounded-xl bg-surface-container-highest/90 border border-outline-variant/30 px-3 py-2 shadow-sm">
              <p className="text-xs font-semibold text-on-surface truncate">
                {selected?.address || location || "No service location selected"}
              </p>
              {selected?.latitude !== undefined && selected?.longitude !== undefined && (
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </p>
              )}
            </div>
          </div>

          <div className="p-5 space-y-4">
            {state === "idle" && (
              <div className="space-y-3">
                <button
                  onClick={() => void handlePermissionChoice("Allow all the time")}
                  className="w-full rounded-xl border border-outline-variant px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
                >
                  <span className="block text-sm font-semibold text-on-surface">Allow all the time</span>
                  <span className="block text-xs text-on-surface-variant mt-1">Use GPS for faster nearby matches on future visits.</span>
                </button>
                <button
                  onClick={() => void handlePermissionChoice("While Using This Site")}
                  className="w-full rounded-xl border border-outline-variant px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
                >
                  <span className="block text-sm font-semibold text-on-surface">While Using This Site</span>
                  <span className="block text-xs text-on-surface-variant mt-1">Clear location access when this tab or app session closes.</span>
                </button>
                <button
                  onClick={() => void handlePermissionChoice("Deny")}
                  className="w-full rounded-xl border border-outline-variant px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
                >
                  <span className="block text-sm font-semibold text-on-surface">Deny</span>
                  <span className="block text-xs text-on-surface-variant mt-1">Continue by searching or typing a service location manually.</span>
                </button>
              </div>
            )}

            {(state === "manual" || state === "saving") && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Service location</span>
                  <input
                    value={manualAddress}
                    onChange={(event) => setManualAddress(event.target.value)}
                    placeholder="Search or enter your service address"
                    className="mt-2 w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest placeholder-on-surface-variant/70"
                  />
                </label>

                {grantedPermissionChoice() && (
                  <button
                    onClick={() => void handleLiveLocation()}
                    className="w-full rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    Use live location
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => void searchManualPlaces()}
                    className="flex-1 rounded-xl bg-surface-container-high px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-container-highest transition-colors"
                  >
                    Search map
                  </button>
                  <button
                    onClick={() => void handleManualSave()}
                    disabled={state === "saving"}
                    className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-60 transition-colors"
                  >
                    Save location
                  </button>
                </div>

                {places.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-outline-variant divide-y divide-outline-variant/50 bg-surface-container-lowest">
                    {places.map((place) => (
                      <button
                        key={`${place.latitude}-${place.longitude}-${place.name}`}
                        onClick={() => void handleManualSave(place)}
                        className="w-full px-3 py-2 text-left hover:bg-surface-container-low transition-colors"
                      >
                        <span className="block text-sm font-semibold text-on-surface">{place.name}</span>
                        <span className="block text-xs text-on-surface-variant line-clamp-1">{place.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {state === "detecting" && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-4">
                <div className="h-8 w-8 rounded-full border-3 border-outline-variant border-t-primary animate-spin" />
                <p className="text-sm font-semibold text-on-surface mt-3">Waiting for browser GPS permission...</p>
                <p className="text-xs text-on-surface-variant mt-1">If your browser asks, choose Allow to detect this device location.</p>
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-error/30 bg-error-container px-3 py-2 text-xs font-medium text-on-error-container">
                {message}
              </div>
            )}

            {state !== "idle" && !hasGrantedPermissionForSession() && (
              <button
                onClick={() => setState("idle")}
                className="text-xs font-semibold text-on-surface-variant hover:text-primary"
              >
                Change permission choice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { SERVICE_LOCATION_KEY };
export { SAVED_LOCATIONS_KEY };

export function LocationPermissionPrompt() {
  return <ServiceLocationFlow />;
}
