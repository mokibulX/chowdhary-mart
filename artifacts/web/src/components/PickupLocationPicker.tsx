import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Crosshair, Expand, Loader2, MapPin, Minus, Navigation, Plus, Search, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { resolveRuntimeApiUrl } from "@/lib/mobile-runtime";

declare global {
  interface Window {
    google?: any;
    __cmGoogleMapsPromise?: Promise<any>;
    gm_authFailure?: () => void;
    __cmGoogleMapsRuntimeConfig?: { key: string; mapStyleId?: string | null };
  }
}

export type PickupLocation = {
  lat: number;
  lng: number;
  address: string;
  distanceKm: number | null;
  available: boolean;
  pincode?: string;
  city?: string;
  state?: string;
  area?: string;
};

type StorePoint = {
  lat?: number | string | null;
  lng?: number | string | null;
  name?: string | null;
  address?: string | null;
};

type Props = {
  open?: boolean;
  mode?: "sheet" | "inline";
  store?: StorePoint | null;
  initial?: PickupLocation | null;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  locateFirst?: boolean;
  compact?: boolean;
  onClose: () => void;
  onConfirm: (location: PickupLocation) => void;
};

const SERVICE_RADIUS_KM = 5;
const FALLBACK_TILE_MAX_ZOOM = 18;

function env(name: string) {
  const values = import.meta.env as Record<string, string | undefined>;
  return values[`VITE_${name}`] || values[name] || "";
}

async function getMapsRuntimeConfig() {
  if (window.__cmGoogleMapsRuntimeConfig?.key) return window.__cmGoogleMapsRuntimeConfig;
  try {
    const config = await customFetch<{ browserKey?: string | null; key?: string; mapStyleId?: string | null }>("/api/maps/config", { responseType: "json" });
    const key = config?.browserKey || config?.key;
    if (key) {
      window.__cmGoogleMapsRuntimeConfig = { key, mapStyleId: config.mapStyleId };
      return window.__cmGoogleMapsRuntimeConfig;
    }
  } catch {
    // Fall back to Vite-injected key for static/browser-only development.
  }
  const key = env("MAPS_API_KEY") || env("GOOGLE_MAPS_API_KEY");
  const mapStyleId = env("MAP_STYLE_ID") || null;
  return key ? { key, mapStyleId } : null;
}

async function loadGoogleMaps() {
  const runtime = await getMapsRuntimeConfig();
  const apiKey = runtime?.key;
  if (!apiKey) return Promise.reject(new Error("Google Maps API key missing."));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__cmGoogleMapsPromise) return window.__cmGoogleMapsPromise;

  window.__cmGoogleMapsPromise = new Promise((resolve, reject) => {
    document.querySelectorAll<HTMLScriptElement>("script[data-cm-google-maps]").forEach((script) => script.remove());
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places,geometry",
      v: "weekly",
      loading: "async",
      auth_referrer_policy: "origin",
    });
    const mapStyleId = runtime?.mapStyleId || env("MAP_STYLE_ID");
    if (mapStyleId) params.set("map_ids", mapStyleId);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.cmGoogleMaps = "true";
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent("cm-google-maps-auth-failure"));
      window.__cmGoogleMapsPromise = undefined;
      script.remove();
      reject(new Error("Map provider rejected this app origin."));
    };
    script.onload = () => {
      setTimeout(() => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps could not initialize."));
      }, 50);
    };
    script.onerror = () => {
      window.__cmGoogleMapsPromise = undefined;
      script.remove();
      reject(new Error("Google Maps failed to load."));
    };
    document.head.appendChild(script);
  });
  return window.__cmGoogleMapsPromise;
}

function pointFrom(value?: StorePoint | null) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function addressComponent(components: any[] | undefined, type: string, short = false) {
  const match = components?.find((item) => item.types?.includes(type));
  return match ? String(short ? match.short_name : match.long_name) : "";
}

function locationPartsFromGeocodeResult(result: any, fallbackAddress: string) {
  const components = result?.address_components ?? [];
  const pincode = addressComponent(components, "postal_code");
  const city = addressComponent(components, "locality")
    || addressComponent(components, "postal_town")
    || addressComponent(components, "administrative_area_level_3")
    || addressComponent(components, "administrative_area_level_2");
  const state = addressComponent(components, "administrative_area_level_1");
  const area = addressComponent(components, "sublocality_level_1")
    || addressComponent(components, "sublocality")
    || addressComponent(components, "route")
    || result?.name
    || fallbackAddress;
  return { pincode, city, state, area };
}

function clampLat(lat: number) {
  return Math.max(-85.0511, Math.min(85.0511, lat));
}

function lngToTileX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number) {
  const rad = clampLat(lat) * Math.PI / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

function tileXToLng(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function browserGps(): Promise<{ lat: number; lng: number }> {
  if (!navigator.geolocation) return Promise.reject(new Error("GPS is not available on this device."));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: Number(position.coords.latitude.toFixed(7)),
        lng: Number(position.coords.longitude.toFixed(7)),
      }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location permission denied. Please allow GPS permission." : "Could not detect current location.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  });
}

export function PickupLocationPicker({
  open = false,
  mode = "sheet",
  store,
  initial,
  title = "Select exact delivery point",
  subtitle = "Search, move the map, tap or use GPS to set the exact pin.",
  confirmLabel = "Confirm This Delivery Point",
  locateFirst = true,
  compact = false,
  onClose,
  onConfirm,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const storeMarker = useRef<any>(null);
  const circle = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const autocomplete = useRef<any>(null);
  const idleTimer = useRef<number | null>(null);
  const googleTileTimer = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const [selected, setSelected] = useState<PickupLocation | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fallbackMap, setFallbackMap] = useState(true);
  const [search, setSearch] = useState("");
  const [fallbackCenter, setFallbackCenter] = useState<{ lat: number; lng: number } | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [fallbackZoom, setFallbackZoom] = useState(FALLBACK_TILE_MAX_ZOOM);
  const [fallbackDrag, setFallbackDrag] = useState<{ x: number; y: number; center: { lat: number; lng: number } } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const storePoint = pointFrom(store);
  const active = mode === "inline" || open;
  const defaultDeliveryPoint = storePoint
    ? { lat: Number((storePoint.lat + 0.0016).toFixed(7)), lng: Number((storePoint.lng + 0.0015).toFixed(7)) }
    : { lat: 22.6092, lng: 88.471 };

  const buildLocation = async (point: { lat: number; lng: number }) => {
    setBusy(true);
    setError("");
    setFallbackCenter(point);
    try {
      const distance = storePoint ? haversineKm(storePoint, point) : null;
      let address = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
      let parts: ReturnType<typeof locationPartsFromGeocodeResult> = { pincode: "", city: "", state: "", area: "" };
      if (geocoder.current) {
        try {
          const result = await geocoder.current.geocode({ location: point });
          const best = result.results?.[0];
          address = best?.formatted_address || address;
          parts = locationPartsFromGeocodeResult(best, address);
        } catch {
          const data = await customFetch<any>(`/api/maps/geocode?latlng=${point.lat},${point.lng}`, { responseType: "json" });
          const best = data.results?.[0];
          address = best?.formatted_address || address;
          parts = locationPartsFromGeocodeResult(best, address);
        }
      }
      setSelected({
        lat: point.lat,
        lng: point.lng,
        address,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        available: distance === null || distance <= SERVICE_RADIUS_KM,
        ...parts,
      });
    } catch {
      const distance = storePoint ? haversineKm(storePoint, point) : null;
      setSelected({
        lat: point.lat,
        lng: point.lng,
        address: `Pinned location ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        available: distance === null || distance <= SERVICE_RADIUS_KM,
      });
      setError("Address name could not be loaded, but this pinned coordinate is ready.");
    } finally {
      setBusy(false);
    }
  };

  const setMarkerPosition = (point: { lat: number; lng: number }) => {
    if (!window.google?.maps || !map.current) return;
    if (!marker.current) {
      marker.current = new window.google.maps.Marker({
        map: map.current,
        position: point,
        draggable: false,
        visible: false,
        title: "Selected delivery point",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
            <svg width="34" height="48" viewBox="0 0 34 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 46 C17 46 29 27 29 16 C29 8.8 23.6 3 17 3 C10.4 3 5 8.8 5 16 C5 27 17 46 17 46Z" fill="#ff5a00" stroke="white" stroke-width="3"/>
              <circle cx="17" cy="16" r="5" fill="white"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(34, 48),
          anchor: new window.google.maps.Point(17, 46),
        },
      });
    } else {
      marker.current.setPosition(point);
    }
    map.current.panTo(point);
    void buildLocation(point);
  };

  const locateMe = async () => {
    try {
      setBusy(true);
      const point = await browserGps();
      if (map.current) setMarkerPosition(point);
      else await buildLocation(point);
      map.current?.setZoom(20);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GPS unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const searchAddress = async () => {
    const query = search.trim();
    if (!query) return;
    try {
      setBusy(true);
      setError("");
      const data = await customFetch<any>(`/api/maps/geocode?address=${encodeURIComponent(query)}`, { responseType: "json" });
      const loc = data.results?.[0]?.geometry?.location;
      if (!loc) {
        setError("No location found for this search.");
        return;
      }
      const point = { lat: Number(loc.lat), lng: Number(loc.lng) };
      if (map.current) {
        setMarkerPosition(point);
        map.current.setZoom(20);
      } else {
        await buildLocation(point);
      }
      setSearch(data.results?.[0]?.formatted_address || query);
    } catch {
      setError("Search failed. Please tap the map or use GPS.");
    } finally {
      setBusy(false);
    }
  };

  const fallbackPointFromEvent = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const center = fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint;
    const tileX = lngToTileX(center.lng, fallbackZoom) + ((event.clientX - rect.left) - rect.width / 2) / 256;
    const tileY = latToTileY(center.lat, fallbackZoom) + ((event.clientY - rect.top) - rect.height / 2) / 256;
    return {
      lat: Number(clampLat(tileYToLat(tileY, fallbackZoom)).toFixed(7)),
      lng: Number(tileXToLng(tileX, fallbackZoom).toFixed(7)),
    };
  };

  const selectFallbackPoint = (event: React.MouseEvent<HTMLElement>) => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    const point = fallbackPointFromEvent(event);
    setFallbackCenter(point);
    void buildLocation(point);
  };

  const startFallbackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setFallbackDrag({
      x: event.clientX,
      y: event.clientY,
      center: fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint,
    });
  };

  const moveFallbackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!fallbackDrag) return;
    const dx = event.clientX - fallbackDrag.x;
    const dy = event.clientY - fallbackDrag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
    const x = lngToTileX(fallbackDrag.center.lng, fallbackZoom) - dx / 256;
    const y = latToTileY(fallbackDrag.center.lat, fallbackZoom) - dy / 256;
    setFallbackCenter({
      lat: Number(clampLat(tileYToLat(y, fallbackZoom)).toFixed(7)),
      lng: Number(tileXToLng(x, fallbackZoom).toFixed(7)),
    });
  };

  const endFallbackDrag = () => {
    if (!fallbackDrag) return;
    setFallbackDrag(null);
    const center = fallbackCenter ?? fallbackDrag.center;
    void buildLocation(center);
  };

  const zoomMap = (delta: number) => {
    if (map.current) {
      const nextZoom = Math.min(21, Math.max(4, Number(map.current.getZoom?.() ?? 18) + delta));
      map.current.setZoom(nextZoom);
      return;
    }
    setFallbackZoom((value) => Math.min(FALLBACK_TILE_MAX_ZOOM, Math.max(4, value + delta)));
  };

  useEffect(() => {
    if (!active || !mapRef.current) return;
    let cancelled = false;
    setFallbackMap(true);
    const handleAuthFailure = () => {
      setFallbackMap(true);
      if (!selected) void buildLocation(defaultDeliveryPoint);
    };
    window.addEventListener("cm-google-maps-auth-failure", handleAuthFailure);
    loadGoogleMaps().then(async (google) => {
      if (cancelled || !mapRef.current) return;
      geocoder.current = new google.maps.Geocoder();
      const firstPoint = initial ? { lat: initial.lat, lng: initial.lng } : defaultDeliveryPoint;
      const center = firstPoint;
      map.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: 20,
        disableDefaultUI: true,
        clickableIcons: true,
        gestureHandling: "greedy",
        mapTypeId: "roadmap",
        mapId: window.__cmGoogleMapsRuntimeConfig?.mapStyleId || env("MAP_STYLE_ID") || undefined,
        styles: window.__cmGoogleMapsRuntimeConfig?.mapStyleId || env("MAP_STYLE_ID") ? undefined : PLACE_LABEL_MAP_STYLE,
      });
      googleTileTimer.current = window.setTimeout(() => {
        if (cancelled) return;
        setFallbackMap(true);
      }, 3500);
      google.maps.event.addListenerOnce(map.current, "tilesloaded", () => {
        if (googleTileTimer.current) window.clearTimeout(googleTileTimer.current);
        googleTileTimer.current = null;
        if (!cancelled) setFallbackMap(false);
      });
      if (storePoint) {
        storeMarker.current = new google.maps.Marker({
          map: map.current,
          position: storePoint,
          title: store?.name || "Store",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#16a34a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
        circle.current = new google.maps.Circle({
          map: map.current,
          center: storePoint,
          radius: SERVICE_RADIUS_KM * 1000,
          fillColor: "#22c55e",
          fillOpacity: 0.08,
          strokeColor: "#16a34a",
          strokeOpacity: 0.5,
          strokeWeight: 2,
        });
      }
      map.current.addListener("click", (event: any) => {
        setMarkerPosition({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      map.current.addListener("idle", () => {
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(() => {
          const centerPoint = map.current?.getCenter?.();
          if (!centerPoint) return;
          const point = { lat: Number(centerPoint.lat().toFixed(7)), lng: Number(centerPoint.lng().toFixed(7)) };
          marker.current?.setPosition(point);
          void buildLocation(point);
        }, 420);
      });
      if (searchRef.current) {
        autocomplete.current = new google.maps.places.Autocomplete(searchRef.current, {
          componentRestrictions: { country: "in" },
          fields: ["geometry", "formatted_address", "name"],
        });
        autocomplete.current.addListener("place_changed", () => {
          const place = autocomplete.current.getPlace();
          const loc = place?.geometry?.location;
          if (!loc) {
            setError("Please select a place from suggestions.");
            return;
          }
          const point = { lat: loc.lat(), lng: loc.lng() };
          setSearch(place.formatted_address || place.name || "");
          setMarkerPosition(point);
          map.current?.setZoom(20);
        });
      }
      setMarkerPosition(firstPoint);
      if (!initial && locateFirst) void locateMe();
    }).catch(async () => {
      setFallbackMap(true);
      setFallbackZoom(FALLBACK_TILE_MAX_ZOOM);
      if (!selected) {
        try {
          const point = locateFirst ? await browserGps() : defaultDeliveryPoint;
          await buildLocation(point);
        } catch {
          await buildLocation(defaultDeliveryPoint);
        }
      }
    });
    return () => {
      cancelled = true;
      window.removeEventListener("cm-google-maps-auth-failure", handleAuthFailure);
      marker.current?.setMap(null);
      storeMarker.current?.setMap(null);
      circle.current?.setMap(null);
      marker.current = null;
      map.current = null;
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (googleTileTimer.current) window.clearTimeout(googleTileTimer.current);
    };
  }, [active]);

  useEffect(() => {
    if (!window.google?.maps || !map.current) return;
    window.setTimeout(() => {
      window.google.maps.event.trigger(map.current, "resize");
      const point = selected ? { lat: selected.lat, lng: selected.lng } : fallbackCenter ?? storePoint ?? defaultDeliveryPoint;
      map.current?.setCenter(point);
      map.current?.setZoom(20);
    }, 80);
  }, [fullscreen]);

  if (!active) return null;

  const center = fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint;
  const tileZoom = Math.min(FALLBACK_TILE_MAX_ZOOM, fallbackZoom);
  const centerTileX = lngToTileX(center.lng, tileZoom);
  const centerTileY = latToTileY(center.lat, tileZoom);
  const fallbackTiles = Array.from({ length: 49 }, (_, index) => {
    const dx = (index % 7) - 3;
    const dy = Math.floor(index / 7) - 3;
    const x = Math.floor(centerTileX) + dx;
    const y = Math.floor(centerTileY) + dy;
    const max = 2 ** tileZoom;
    const wrappedX = ((x % max) + max) % max;
    return {
      key: `${tileZoom}-${x}-${y}`,
      src: resolveRuntimeApiUrl(`/api/maps/tile?z=${tileZoom}&x=${wrappedX}&y=${y}`),
      fallbackSrc: `https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${y}.png`,
      left: `${(x - centerTileX) * 256}px`,
      top: `${(y - centerTileY) * 256}px`,
    };
  });

  const mapSurface = (
    <>
      <div className={`relative flex-shrink-0 overflow-hidden bg-slate-900 ${fullscreen ? "h-[100dvh] min-h-[100dvh]" : compact ? "h-[280px] min-h-[260px] sm:h-[340px]" : "h-[50dvh] min-h-[320px] sm:h-[56dvh]"}`}>
        <div ref={mapRef} className="absolute inset-0" />
        {fallbackMap && (
          <div
            role="button"
            tabIndex={0}
            onClick={selectFallbackPoint}
            onPointerDown={startFallbackDrag}
            onPointerMove={moveFallbackDrag}
            onPointerUp={endFallbackDrag}
            onPointerCancel={endFallbackDrag}
            className="absolute inset-0 block h-full w-full touch-none overflow-hidden bg-[#dbe7ee] text-left"
          >
            <div className="absolute left-1/2 top-1/2 h-0 w-0">
              {fallbackTiles.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.src}
                  alt=""
                  draggable={false}
                  className="absolute h-64 w-64 max-w-none select-none"
                  onError={(event) => {
                    const image = event.currentTarget;
                    if (image.dataset.triedDirect !== "true") {
                      image.dataset.triedDirect = "true";
                      image.src = tile.fallbackSrc;
                      return;
                    }
                    image.style.display = "none";
                  }}
                  style={{ left: tile.left, top: tile.top, transform: "translate(-50%, -50%)" }}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-3 text-xs font-semibold text-slate-700 shadow-xl">
              Move or tap the map to set the exact point.
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-2xl">
          <svg width="30" height="46" viewBox="0 0 30 46" aria-hidden="true">
            <path d="M15 44 C15 44 26 26 26 15 C26 8.4 21.1 3 15 3 C8.9 3 4 8.4 4 15 C4 26 15 44 15 44Z" fill="#ff5a00" stroke="white" strokeWidth="3" />
            <circle cx="15" cy="15" r="4.6" fill="white" />
          </svg>
        </div>
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10">
          <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-2xl bg-white p-2 shadow-2xl sm:gap-2">
            <Search className="ml-2 h-5 w-5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchAddress();
                }
              }}
              placeholder="Search road, building or landmark"
              className="min-w-0 border-0 text-sm shadow-none focus-visible:ring-0 sm:text-base"
            />
            <Button type="button" size="sm" className="h-9 flex-shrink-0 rounded-xl px-3" onClick={searchAddress} disabled={busy}>Find</Button>
          </div>
        </div>
        <div className="absolute right-3 top-20 z-10 flex flex-col gap-2">
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? "Exit fullscreen map" : "Open fullscreen map"}>
            {fullscreen ? <X className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
          </Button>
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => zoomMap(1)} aria-label="Zoom in">
            <Plus className="h-5 w-5" />
          </Button>
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => zoomMap(-1)} aria-label="Zoom out">
            <Minus className="h-5 w-5" />
          </Button>
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={locateMe}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className={`${fullscreen ? "absolute inset-x-3 bottom-3 z-20 max-h-[32dvh] overflow-y-auto rounded-3xl bg-white/95 shadow-2xl backdrop-blur" : mode === "inline" ? "" : "native-page-scroll max-h-[34dvh] overflow-y-auto"} flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3`}>
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-full bg-orange-100 p-2 text-primary">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold">{selected?.address || "Detecting selected address..."}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Lat: {selected ? selected.lat.toFixed(7) : "--"} | Lng: {selected ? selected.lng.toFixed(7) : "--"}
            </p>
            <p className="mt-1 text-xs font-semibold">
              Distance from shop: {selected?.distanceKm === null || selected?.distanceKm === undefined ? "Checking" : `${selected.distanceKm.toFixed(2)} km`}
            </p>
          </div>
          <Navigation className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
        {!selected?.available && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            Sorry! We currently deliver only within a 5 KM service area.
          </p>
        )}
        <Button className="mt-4 w-full" size="lg" disabled={!selected || !selected.available || busy} onClick={() => selected && onConfirm(selected)}>
          {busy ? "Checking location..." : confirmLabel}
        </Button>
      </div>
    </>
  );

  if (mode === "inline") {
    return (
      <div className={`${fullscreen ? "fixed inset-0 z-[120] rounded-none border-0 bg-white" : "overflow-hidden rounded-[28px] border bg-white shadow-sm"}`}>
        <div className={`${fullscreen ? "hidden" : "flex"} flex-shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4`}>
          <div className="min-w-0">
            <Badge className={selected?.available ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
              {selected?.available ? "Delivery available" : "Outside 5 KM"}
            </Badge>
            <h2 className="mt-2 text-lg font-black">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className={fullscreen ? "" : compact ? "[&>div:first-child]:h-[280px] sm:[&>div:first-child]:h-[340px]" : "[&>div:first-child]:h-[360px] sm:[&>div:first-child]:h-[430px]"}>
          {mapSurface}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-[2px]">
      <button className="absolute inset-0 h-full w-full cursor-default" type="button" aria-label="Close map picker" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-10 mx-auto flex max-h-[92dvh] max-w-3xl flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl sm:bottom-4 sm:rounded-[30px]">
        <div className="mx-auto mt-3 h-1 w-12 flex-shrink-0 rounded-full bg-slate-200" />
        <div className="flex flex-shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <Badge className={selected?.available ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
              {selected?.available ? "Delivery available" : "Outside 5 KM"}
            </Badge>
            <h2 className="mt-2 text-lg font-black">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="rounded-full"><X className="h-5 w-5" /></Button>
        </div>

        {mapSurface}
      </div>
    </div>
  );
}

const PLACE_LABEL_MAP_STYLE = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.attraction", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.government", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.medical", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.place_of_worship", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.school", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.sports_complex", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "on" }] },
];
