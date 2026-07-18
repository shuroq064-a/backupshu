"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { locationPermissionApi } from "@/lib/api";
import type { LocationPlaceResult, ServiceLocation } from "@/types";

const DEFAULT_LOCATION = { latitude: 17.385, longitude: 78.4867 }; // Hyderabad
const ZOOM = 15;
const TILE_SIZE = 256;

function project(latitude: number, longitude: number) {
  const scale = TILE_SIZE * 2 ** ZOOM;
  const x = ((longitude + 180) / 360) * scale;
  const latRadians = (latitude * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(latRadians)) / Math.PI) / 2) * scale;
  return { x, y };
}

function unproject(x: number, y: number) {
  const scale = TILE_SIZE * 2 ** ZOOM;
  const longitude = (x / scale) * 360 - 180;
  const mercator = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { latitude, longitude };
}

type MapTheme = {
  id: string;
  label: string;
  icon: string;
  dark: boolean;
  tile: (x: number, y: number) => string;
  attribution: string;
};

const MAP_THEMES: MapTheme[] = [
  {
    id: "road",
    label: "Road",
    icon: "map",
    dark: false,
    tile: (x, y) => `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`,
    attribution: "© OpenStreetMap contributors",
  },
  {
    id: "minimal",
    label: "Minimal",
    icon: "layers",
    dark: false,
    tile: (x, y) => `https://a.basemaps.cartocdn.com/light_all/${ZOOM}/${x}/${y}.png`,
    attribution: "© OpenStreetMap, © CARTO",
  },
  {
    id: "dark",
    label: "Dark",
    icon: "dark_mode",
    dark: true,
    tile: (x, y) => `https://a.basemaps.cartocdn.com/dark_all/${ZOOM}/${x}/${y}.png`,
    attribution: "© OpenStreetMap, © CARTO",
  },
  {
    id: "satellite",
    label: "Satellite",
    icon: "satellite_alt",
    dark: true,
    tile: (x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${y}/${x}`,
    attribution: "© Esri",
  },
];

const MAP_THEME_KEY = "shuroqx_map_theme";

function useMapTheme() {
  const [themeId, setThemeId] = useState<string>("road");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(MAP_THEME_KEY) : null;
    if (saved && MAP_THEMES.some((t) => t.id === saved)) setThemeId(saved);
  }, []);

  const setTheme = (id: string) => {
    setThemeId(id);
    try {
      localStorage.setItem(MAP_THEME_KEY, id);
    } catch {
      // ignore persistence failure (private mode, etc.)
    }
  };

  const theme = MAP_THEMES.find((t) => t.id === themeId) ?? MAP_THEMES[0];
  return { theme, setTheme };
}

function MapCanvas({
  latitude,
  longitude,
  theme,
  onSelect,
  onSelectTheme,
}: {
  latitude: number;
  longitude: number;
  theme: MapTheme;
  onSelect: (latitude: number, longitude: number) => void;
  onSelectTheme: (id: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const center = useMemo(() => project(latitude, longitude), [latitude, longitude]);
  const centralTileX = Math.floor(center.x / TILE_SIZE);
  const centralTileY = Math.floor(center.y / TILE_SIZE);
  const tileOffsetX = center.x - centralTileX * TILE_SIZE;
  const tileOffsetY = center.y - centralTileY * TILE_SIZE;

  function selectAt(clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pixelX = center.x + (clientX - rect.left - rect.width / 2);
    const pixelY = center.y + (clientY - rect.top - rect.height / 2);
    const point = unproject(pixelX, pixelY);
    onSelect(Math.max(-85, Math.min(85, point.latitude)), Math.max(-180, Math.min(180, point.longitude)));
  }

  return (
    <div
      ref={mapRef}
      className="relative h-80 overflow-hidden rounded-[24px] bg-surface-container-lowest shadow-sm touch-none cursor-crosshair border border-outline-variant"
      aria-label="Interactive map. Click or drag the pin to choose the service location."
      onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); selectAt(event.clientX, event.clientY); }}
      onPointerMove={(event) => { if (dragging.current) selectAt(event.clientX, event.clientY); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <div className="absolute inset-0" style={{ transform: `translate(calc(50% - ${tileOffsetX}px), calc(50% - ${tileOffsetY}px))` }}>
        {[-1, 0, 1].flatMap((row) => [-1, 0, 1].map((column) => {
          const x = centralTileX + column;
          const y = centralTileY + row;
          const maxTile = 2 ** ZOOM;
          const wrappedX = ((x % maxTile) + maxTile) % maxTile;
          return (
            <img
              key={`${x}-${y}`}
              src={theme.tile(wrappedX, y)}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none pointer-events-none"
              style={{ width: TILE_SIZE, height: TILE_SIZE, left: column * TILE_SIZE, top: row * TILE_SIZE }}
            />
          );
        }))}
      </div>

      {/* Theme switcher */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 z-10 flex gap-1 rounded-full bg-surface-container-highest/90 p-1 shadow-md backdrop-blur border border-outline-variant/30"
      >
        {MAP_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={`${t.label} map style`}
            onClick={() => onSelectTheme(t.id)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition shadow-sm ${
              theme.id === t.id
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant bg-surface-container-high hover:bg-surface-container-highest"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none drop-shadow-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-full rounded-br-none rotate-45 bg-primary text-sm font-bold text-on-primary ring-4 ring-primary/20">
          <span className="-rotate-45">PIN</span>
        </div>
      </div>

      <p className="absolute bottom-3 left-3 rounded-xl bg-surface-container-highest/95 px-3 py-2 text-xs font-bold text-on-surface shadow-md">
        Tap or drag to move the pin
      </p>
      <p className="absolute bottom-3 right-3 rounded-md bg-surface-container-highest/45 px-2 py-0.5 text-[10px] text-on-surface-variant/90">
        {theme.attribution}
      </p>
    </div>
  );
}

export function LocationMapPicker({ initialLocation, onConfirm, onBack, onSelectTheme }: {
  initialLocation?: ServiceLocation | null;
  onConfirm: (location: ServiceLocation) => void;
  onBack?: () => void;
  onSelectTheme?: (id: string) => void;
}) {
  const [latitude, setLatitude] = useState(initialLocation?.latitude ?? DEFAULT_LOCATION.latitude);
  const [longitude, setLongitude] = useState(initialLocation?.longitude ?? DEFAULT_LOCATION.longitude);
  const initialQuery = initialLocation?.address.startsWith("Selected location (") ? "" : initialLocation?.address || "";
  const [query, setQuery] = useState(initialQuery);
  const [places, setPlaces] = useState<LocationPlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [isRelocating, setIsRelocating] = useState(false);
  const { theme, setTheme } = useMapTheme();

  const handleTheme = (id: string) => {
    setTheme(id);
    onSelectTheme?.(id);
  };

  async function handleRelocate() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setError("Location detection is not supported by your browser.");
      return;
    }
    setIsRelocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setPlaces([]);
        setHint("");
        try {
          const resolved = await locationPermissionApi.reverseGeocode(lat, lng);
          setQuery(resolved.formatted_address || "");
        } catch {
          setQuery("");
        } finally {
          setIsRelocating(false);
        }
      },
      async (err) => {
        let msg = "Could not detect location.";
        if (err.code === 1) {
          msg = "Location is blocked for this site. Allow it (lock icon → Site settings → Location) and turn on Windows 'Location services' to use GPS.";
        } else if (err.code === 2) {
          msg = "Location details are unavailable.";
        } else if (err.code === 3) {
          msg = "Location request timed out.";
        }
        setHint(`${msg} You can keep the pin you placed — it's saved as your service location.`);
        setIsRelocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  }

  useEffect(() => {
    if (!initialLocation) return;
    setQuery(initialLocation.address.startsWith("Selected location (") ? "" : initialLocation.address);
    if (initialLocation.latitude !== undefined) setLatitude(initialLocation.latitude);
    if (initialLocation.longitude !== undefined) setLongitude(initialLocation.longitude);
  }, [initialLocation]);

  async function search() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setError("");
    setHint("");
    try {
      const results = await locationPermissionApi.searchPlaces(trimmed);
      if (results.length > 0) {
        setPlaces(results);
        return;
      }
      try {
        const geocoded = await locationPermissionApi.geocode(trimmed);
        if (geocoded.valid !== false && geocoded.latitude != null && geocoded.longitude != null) {
          setLatitude(geocoded.latitude);
          setLongitude(geocoded.longitude);
          setQuery(geocoded.formatted_address || trimmed);
          setPlaces([]);
          return;
        }
      } catch {
        // ignore and show the fallback message below
      }
      setPlaces([]);
      setError("No matches found for that search. You can still move the pin manually on the map.");
    } catch {
      setPlaces([]);
      setError("Search suggestions are unavailable. You can still confirm the pin; the typed location will be saved with it.");
    } finally {
      setIsSearching(false);
    }
  }

  function choosePlace(place: LocationPlaceResult) {
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setQuery(place.address);
    setPlaces([]);
    setError("");
    setHint("");
  }

  async function confirm() {
    setIsConfirming(true);
    setError("");
    setHint("");
    try {
      const resolved = await locationPermissionApi.reverseGeocode(latitude, longitude, query.trim() || undefined);
      if (!resolved.valid && resolved.valid !== undefined) throw new Error("Please select a valid service location.");
      onConfirm({
        address: resolved.formatted_address || query || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        latitude,
        longitude,
        source: "map",
        permission: initialLocation?.permission,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please select a valid service location before continuing.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <div className="relative min-w-0 flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
            placeholder="Search area, landmark, or address"
            className="w-full rounded-2xl border-none bg-surface-container-highest shadow-inner py-3 pl-12 pr-4 text-sm font-medium text-on-surface placeholder-on-surface-variant/70 outline-none transition focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={() => void search()}
          disabled={!query.trim() || isSearching}
          className="shrink-0 rounded-2xl bg-primary px-6 text-sm font-bold text-on-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSearching ? "Searching…" : "Search"}
        </button>
      </div>

      {places.length > 0 && (
        <div className="max-h-36 overflow-y-auto rounded-xl border border-outline-variant divide-y divide-outline-variant/50 bg-surface-container-lowest">
          {places.map((place) => (
            <button key={`${place.latitude}-${place.longitude}-${place.name}`} onClick={() => choosePlace(place)} className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-surface-container-low">
              <span className="text-sm font-semibold text-on-surface">{place.name}</span>
              <span className="block truncate text-xs text-on-surface-variant">{place.address}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <MapCanvas
          latitude={latitude}
          longitude={longitude}
          theme={theme}
          onSelect={(nextLatitude, nextLongitude) => { setLatitude(nextLatitude); setLongitude(nextLongitude); setPlaces([]); }}
          onSelectTheme={handleTheme}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleRelocate();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={isRelocating}
          title="Use my current location"
          className="absolute bottom-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest text-on-surface shadow-lg transition-all hover:bg-surface-container-high hover:shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isRelocating ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#e3ebf3] border-t-teal-700" />
          ) : (
            <span className="material-symbols-outlined text-[22px]">my_location</span>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-on-surface-variant">
        <span>Selected coordinates</span>
        <span className="font-mono">{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
      </div>

      {error && (
        <p className="rounded-xl border border-error/30 bg-error-container px-3 py-2 text-xs font-medium text-on-error-container">{error}</p>
      )}
      {hint && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-medium text-on-surface-variant">{hint}</p>
      )}

      <div className="flex justify-between items-center gap-3 pt-4">
        {onBack ? (
          <button onClick={onBack} className="rounded-xl bg-surface-container-high px-6 py-3 text-sm font-bold text-on-surface shadow-md hover:bg-surface-container-highest hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer">
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => void confirm()}
          disabled={isConfirming}
          className="rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-on-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 cursor-pointer"
        >
          {isConfirming ? "Checking location…" : "Confirm location"}
        </button>
      </div>
    </div>
  );
}
