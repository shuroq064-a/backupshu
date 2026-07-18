"use client";

import { useCallback, useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/location/LocationMapPicker";
import { locationPermissionApi, userApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import { useAppDispatch, useAppSelector } from "@/store";
import { setLocation, updateLocation } from "@/store/slices/authSlice";
import type { LocationPermissionChoice, SavedAddress, ServiceAddressDetails, ServiceLocation } from "@/types";

const PERMISSION_KEY = "shuroqx_location_permission";
export const SERVICE_LOCATION_KEY = "shuroqx_service_location";
export const SERVICE_ADDRESS_DETAILS_KEY = "shuroqx_service_address_details";
export const SERVICE_ADDRESS_ID_KEY = "shuroqx_service_address_id";
export const SAVED_LOCATIONS_KEY = "shuroqx_saved_locations";
const SESSION_PERMISSION_KEY = "shuroqx_location_permission_session";

const EMPTY_ADDRESS_DETAILS: ServiceAddressDetails = {
  receiverName: "",
  contactNumber: "",
  houseFlat: "",
  blockArea: "",
  landmark: "",
  addressLabel: "Home",
  customAddressLabel: "",
};

type Step = "permission" | "detecting" | "map" | "address";

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser does not support location detection."));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
  });
}

function detailsFromSavedAddress(address: SavedAddress): ServiceAddressDetails {
  return {
    receiverName: address.receiverName,
    contactNumber: address.contactNumber,
    houseFlat: address.houseFlat,
    blockArea: address.blockArea,
    landmark: address.landmark || "",
    addressLabel: address.addressLabel,
    customAddressLabel: address.customAddressLabel || "",
  };
}

function locationFromSavedAddress(address: SavedAddress): ServiceLocation {
  return {
    address: address.address,
    latitude: address.latitude ?? undefined,
    longitude: address.longitude ?? undefined,
    source: "profile",
  };
}

export function ServiceLocationFlow() {
  const dispatch = useAppDispatch();
  const { user, activeMode, isHydrated, location } = useAppSelector((state) => state.auth);
  const isClientDashboard = isHydrated && Boolean(user) && activeMode === "client";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("permission");
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocation | null>(null);
  const [savedDetails, setSavedDetails] = useState<ServiceAddressDetails | null>(null);
  const [message, setMessage] = useState("");

  const persistLocal = useCallback((nextLocation: ServiceLocation, details: ServiceAddressDetails, addressId?: string | null) => {
    localStorage.setItem(SERVICE_LOCATION_KEY, JSON.stringify(nextLocation));
    localStorage.setItem(SERVICE_ADDRESS_DETAILS_KEY, JSON.stringify(details));
    if (addressId) localStorage.setItem(SERVICE_ADDRESS_ID_KEY, addressId);
    else localStorage.removeItem(SERVICE_ADDRESS_ID_KEY);
    const saved = readStored<string[]>(SAVED_LOCATIONS_KEY) || [];
    const addresses = [nextLocation.address, ...saved].filter((item, index, items) => item && items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).slice(0, 12);
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(addresses));
    window.dispatchEvent(new CustomEvent("shuroqx-service-location", { detail: nextLocation }));
    window.dispatchEvent(new CustomEvent("shuroqx-service-address-details", { detail: details }));
    dispatch(setLocation(nextLocation.address));
    void dispatch(updateLocation(nextLocation.address));
  }, [dispatch]);

  const loadAddressBook = useCallback(async () => {
    try {
      return await userApi.getAddresses();
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!isClientDashboard) return;
    const storedLocation = readStored<ServiceLocation>(SERVICE_LOCATION_KEY);
    const details = readStored<ServiceAddressDetails>(SERVICE_ADDRESS_DETAILS_KEY);
    const storedAddressId = localStorage.getItem(SERVICE_ADDRESS_ID_KEY);
    if (storedLocation) {
      setSelectedLocation(storedLocation);
      dispatch(setLocation(storedLocation.address));
    }
    if (details) setSavedDetails(details);

    void loadAddressBook().then((addresses) => {
      const storedSavedAddress = storedAddressId ? addresses.find((address) => address.id === storedAddressId) : null;
      const defaultAddress = addresses.find((address) => address.isDefault);
      const preferred = storedSavedAddress || (!storedLocation && !details ? defaultAddress : null);
      if (!preferred) {
        if (!storedLocation) { setOpen(true); setStep("permission"); }
        return;
      }

      const nextLocation = locationFromSavedAddress(preferred);
      const nextDetails = detailsFromSavedAddress(preferred);
      setSelectedLocation(nextLocation);
      setSavedDetails(nextDetails);
      persistLocal(nextLocation, nextDetails, preferred.id);
    });

    if (!storedLocation && !details) { setOpen(true); setStep("permission"); }
  }, [dispatch, isClientDashboard, loadAddressBook, persistLocal]);

  useEffect(() => {
    const openPicker = () => {
      const stored = readStored<ServiceLocation>(SERVICE_LOCATION_KEY);
      if (stored) setSelectedLocation(stored);
      setMessage("");
      setStep("map");
      setOpen(true);
      void loadAddressBook();
    };
    window.addEventListener("shuroqx-open-location-permission", openPicker);
    return () => window.removeEventListener("shuroqx-open-location-permission", openPicker);
  }, [loadAddressBook]);

  useEffect(() => {
    const refreshAddressBook = () => {
      void loadAddressBook().then((addresses) => {
        const storedAddressId = localStorage.getItem(SERVICE_ADDRESS_ID_KEY);
        const current = storedAddressId ? addresses.find((address) => address.id === storedAddressId) : null;
        const preferred = current || addresses.find((address) => address.isDefault);
        if (!preferred) return;
        const nextLocation = locationFromSavedAddress(preferred);
        const nextDetails = detailsFromSavedAddress(preferred);
        setSelectedLocation(nextLocation);
        setSavedDetails(nextDetails);
        persistLocal(nextLocation, nextDetails, preferred.id);
      });
    };
    window.addEventListener("shuroqx-address-book-updated", refreshAddressBook);
    return () => window.removeEventListener("shuroqx-address-book-updated", refreshAddressBook);
  }, [loadAddressBook, persistLocal]);

  useEffect(() => {
    const clearSessionPermission = () => {
      if (sessionStorage.getItem(SESSION_PERMISSION_KEY) !== "While Using This Site") return;
      sessionStorage.removeItem(SESSION_PERMISSION_KEY);
      const token = getToken();
      fetch(`${API_BASE_URL}/location-permission/clear-on-close`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: "{}" }).catch(() => {});
    };
    window.addEventListener("beforeunload", clearSessionPermission);
    return () => window.removeEventListener("beforeunload", clearSessionPermission);
  }, []);

  async function choosePermission(choice: LocationPermissionChoice) {
    setMessage("");
    if (choice === "Deny") { localStorage.setItem(PERMISSION_KEY, choice); setStep("map"); return; }
    setStep("detecting");
    try {
      await locationPermissionApi.requestPermission(choice);
      const position = await getBrowserPosition();
      setSelectedLocation({ address: `Selected location (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`, latitude: position.coords.latitude, longitude: position.coords.longitude, source: "gps", permission: choice });
      if (choice === "While Using This Site") sessionStorage.setItem(SESSION_PERMISSION_KEY, choice);
      else localStorage.setItem(PERMISSION_KEY, choice);
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message} You can still choose a location manually.` : "Location access is unavailable. You can still choose a location manually.");
    }
    setStep("map");
  }

  if (!isClientDashboard || !open) return null;
  const heading = step === "address" ? "Address details" : step === "map" ? "Choose service location" : step === "detecting" ? "Detecting your location" : "Allow location access?";
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[36px] bg-surface-container-lowest shadow-2xl border border-outline-variant">
        <div className="flex items-start justify-between gap-4 px-8 py-6 pb-2">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-primary shadow-sm">
              <span className="material-symbols-outlined text-[24px]">location_on</span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Service location</p>
              <h2 className="mt-1 text-xl font-extrabold text-on-surface">{heading}</h2>
              <p className="mt-1 text-sm font-medium text-on-surface-variant">Choose the exact place where the specialist should meet you.</p>
            </div>
          </div>
          {(selectedLocation || location) && (
            <button 
              onClick={() => setOpen(false)} 
              className="rounded-xl bg-surface-container-high px-4 py-2 text-sm font-bold text-on-surface shadow-sm hover:bg-surface-container-highest hover:text-on-surface transition-all cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
        <div className="px-8 pb-8 pt-4">
          {step === "permission" && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-on-surface-variant mb-6">You can always search the map and move the pin manually, even if location access is denied.</p>
              {(["Allow all the time", "While Using This Site", "Deny"] as LocationPermissionChoice[]).map((choice) => (
                <button 
                  key={choice} 
                  onClick={() => void choosePermission(choice)} 
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-container-high px-6 py-4 text-left shadow-sm hover:bg-surface-container-highest hover:shadow-md transition-all cursor-pointer group"
                >
                  <span>
                    <span className="block text-base font-bold text-on-surface">{choice}</span>
                    <span className="mt-1 block text-sm font-medium text-on-surface-variant">{choice === "Deny" ? "Continue with map search and pin selection." : "Use your browser location to position the map."}</span>
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high shadow-sm text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                    <span className="material-symbols-outlined">{choice === "Deny" ? "block" : "location_on"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {step === "detecting" && <div className="py-10 text-center text-sm font-bold text-primary"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-outline-variant border-t-primary shadow-sm" /><p className="mt-4">Detecting your location...</p></div>}
          {step === "map" && <LocationMapPicker initialLocation={selectedLocation} onBack={() => setStep("permission")} onConfirm={(nextLocation) => { setSelectedLocation(nextLocation); setMessage(""); persistLocal(nextLocation, savedDetails || EMPTY_ADDRESS_DETAILS); setOpen(false); }} />}
          {message && <p className="mt-4 rounded-xl border border-error/30 bg-error-container px-4 py-3 text-sm font-bold text-on-error-container shadow-inner">{message}</p>}
        </div>
      </div>
    </div>
  );
}
