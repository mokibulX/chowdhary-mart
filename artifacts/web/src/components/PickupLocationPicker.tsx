import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Crosshair, Expand, Layers, Loader2, MapPin, Minus, Navigation, Plus, Search, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { resolveRuntimeApiUrl } from "@/lib/mobile-runtime";
import { DEFAULT_LOCATION } from "@/lib/default-location";

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
  district?: string;
  state?: string;
  area?: string;
  boundaryGeometry?: any;
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
  serviceZones?: Array<{ id: number; centreLatitude?: number; centreLongitude?: number; radiusMeters?: number; boundaryGeometry?: any; insideServiceZone?: boolean }>;
  serviceZoneType?: "customer" | "seller" | "rider";
  polygonMode?: boolean;
  initialPolygon?: Array<{ lat: number; lng: number }>;
  onLocationChange?: (point: { lat: number; lng: number }) => void;
  hideTechnicalDetails?: boolean;
  onClose: () => void;
  onConfirm: (location: PickupLocation) => void;
};

const SERVICE_RADIUS_KM = 5;
const SERVICE_ZONE_DEFAULT_ZOOM = 18;
const FALLBACK_TILE_MAX_ZOOM = 18;
// All location pickers share the Admin service-area road/building map.
const USE_SHARED_LEAFLET_MAP = true;

// Keep the pickup point distinct from the user's blue location dot while
// leaving its position attached to the map's geographic coordinate system.
const PICKUP_PIN_SVG = `
  <svg width="28" height="48" viewBox="0 0 28 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="14" cy="10" r="10" fill="#cf2027" stroke="#fff" stroke-width="2"/>
    <path d="M13 19h2v24l-1 5-1-5z" fill="#b8b8b8" stroke="#777" stroke-width=".5"/>
  </svg>
`;

function env(name: string) {
  const values = import.meta.env as Record<string, string | undefined>;
  return values[`VITE_${name}`] || values[name] || "";
}

async function getMapsRuntimeConfig() {
  const browserKey = env("MAPS_API_KEY") || env("GOOGLE_MAPS_API_KEY");
  if (browserKey) {
    return { key: browserKey, mapStyleId: env("MAP_STYLE_ID") || null };
  }
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
  const key = browserKey;
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
  const district = addressComponent(components, "administrative_area_level_2");
  const area = addressComponent(components, "sublocality_level_1")
    || addressComponent(components, "sublocality")
    || addressComponent(components, "route")
    || result?.name
    || fallbackAddress;
  return { pincode, city, district, state, area };
}

function clampLat(lat: number) {
  return Math.max(-85.0511, Math.min(85.0511, lat));
}

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
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
  serviceZones: suppliedServiceZones,
  serviceZoneType = "customer",
  polygonMode = false,
  initialPolygon = [],
  onLocationChange,
  hideTechnicalDetails = false,
  onClose,
  onConfirm,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const map = useRef<any>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const leafletGeometry = useRef<L.LayerGroup | null>(null);
  const marker = useRef<any>(null);
  const currentLocationMarker = useRef<any>(null);
  const storeMarker = useRef<any>(null);
  const circle = useRef<any>(null);
  const zoneOverlays = useRef<any[]>([]);
  const boundaryMarkers = useRef<any[]>([]);
  const wheelZoomTimer = useRef<number | null>(null);
  const geocoder = useRef<any>(null);
  const autocomplete = useRef<any>(null);
  const idleTimer = useRef<number | null>(null);
  const googleTileTimer = useRef<number | null>(null);
  const googleMapFailed = useRef(false);
  const gpsWatchId = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const [selected, setSelected] = useState<PickupLocation | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fallbackMap, setFallbackMap] = useState(true);
  const [googleTilesReady, setGoogleTilesReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [search, setSearch] = useState("");
  const [fallbackCenter, setFallbackCenter] = useState<{ lat: number; lng: number } | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [fallbackZoom, setFallbackZoom] = useState(SERVICE_ZONE_DEFAULT_ZOOM);
  const [fallbackDrag, setFallbackDrag] = useState<{ x: number; y: number; center: { lat: number; lng: number } } | null>(null);
  const [liveGpsPoint, setLiveGpsPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [serviceZones, setServiceZones] = useState(suppliedServiceZones ?? []);
  const [polygonPoints, setPolygonPoints] = useState(initialPolygon);
  const [polygonClosed, setPolygonClosed] = useState(initialPolygon.length >= 3);
  const maskId = `cm-zone-mask-${useId().replace(/:/g, "")}`;
  const [selectedPolygonPoint, setSelectedPolygonPoint] = useState<number | null>(null);
  const [polygonCursorPoint, setPolygonCursorPoint] = useState<{ lat: number; lng: number } | null>(null);
  const draggingPolygonPointRef = useRef<number | null>(null);
  const polygonVertexMovedRef = useRef(false);
  const fittedZoneKeyRef = useRef("");
  const initialPolygonKey = initialPolygon.map((point) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`).join("|");
  const polygonClosedRef = useRef(initialPolygon.length >= 3);
  const fallbackSizeRef = useRef({ width: 560, height: 420 });
  // Delivery-zone maps open in the familiar light road view; satellite/tilt remains available.
  const [is3D, setIs3D] = useState(false);
  const storePoint = pointFrom(store);
  const active = mode === "inline" || open;
  const defaultDeliveryPoint = { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };

  useEffect(() => {
    setPolygonPoints(initialPolygon);
    setPolygonClosed(initialPolygon.length >= 3);
    polygonClosedRef.current = initialPolygon.length >= 3;
    setSelectedPolygonPoint(null);
  }, [initialPolygonKey]);

  useEffect(() => {
    if (!active || !USE_SHARED_LEAFLET_MAP || !mapRef.current) return;
    const center = fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint;
    const instance = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      zoomDelta: 0.5,
      zoomSnap: 0.5,
      minZoom: 4,
      maxZoom: 19,
    }).setView([center.lat, center.lng], SERVICE_ZONE_DEFAULT_ZOOM);
    const browserTiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      crossOrigin: true,
    }).addTo(instance);
    let proxyTiles: L.TileLayer | null = null;
    browserTiles.on("tileerror", () => {
      if (proxyTiles) return;
      proxyTiles = L.tileLayer(resolveRuntimeApiUrl("/api/maps/tile/{z}/{x}/{y}"), {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
        crossOrigin: true,
      }).addTo(instance);
    });
    instance.on("click", (event) => {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (polygonMode) addPolygonPoint(point);
      else instance.panTo([point.lat, point.lng], { animate: true, duration: 0.2 });
    });
    instance.on("moveend", () => {
      if (polygonMode) return;
      const centre = instance.getCenter();
      const point = { lat: Number(centre.lat.toFixed(7)), lng: Number(centre.lng.toFixed(7)) };
      setFallbackCenter(point);
      void buildLocation(point);
      onLocationChange?.(point);
    });
    leafletMap.current = instance;
    setFallbackMap(false);
    setGoogleTilesReady(true);
    setLeafletReady(true);
    if (!polygonMode) {
      if (initial) setMarkerPosition(center);
      else if (locateFirst) void locateMe();
    }
    window.setTimeout(() => instance.invalidateSize(), 0);
    window.setTimeout(() => instance.invalidateSize(), 250);
    window.setTimeout(() => instance.invalidateSize(), 1000);
    return () => {
      leafletGeometry.current?.removeFrom(instance);
      leafletGeometry.current = null;
      instance.remove();
      leafletMap.current = null;
      setLeafletReady(false);
    };
  }, [active, polygonMode]);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || !leafletMap.current) return;
    const instance = leafletMap.current;
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false, debounceMoveend: true }));
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [leafletReady]);

  useEffect(() => {
    const instance = leafletMap.current;
    if (!instance || !leafletReady) return;
    leafletGeometry.current?.removeFrom(instance);
    const group = L.layerGroup().addTo(instance);
    leafletGeometry.current = group;
    if (polygonMode && polygonClosed && polygonPoints.length >= 3) {
      const world = [[85, -180], [85, 180], [-85, 180], [-85, -180]] as L.LatLngExpression[];
      L.polygon([world, polygonPoints.map((point) => [point.lat, point.lng] as L.LatLngExpression)], {
        fillColor: "#111827",
        fillOpacity: 0.58,
        stroke: false,
        interactive: false,
      }).addTo(group);
    } else if (polygonMode) {
      if (polygonPoints.length >= 2) {
        L.polyline(polygonPoints.map((point) => [point.lat, point.lng] as L.LatLngExpression), {
          color: "#2563eb",
          weight: 3,
          interactive: false,
        }).addTo(group);
      }
      polygonPoints.forEach((point, index) => {
        const vertex = L.marker([point.lat, point.lng], {
          draggable: true,
          icon: L.divIcon({
            className: "cm-zone-native-vertex",
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            html: `<span style="display:block;width:${index === 0 ? 18 : 14}px;height:${index === 0 ? 18 : 14}px;margin:${index === 0 ? 0 : 2}px;border-radius:999px;background:${index === 0 ? "#f97316" : "#2563eb"};border:2px solid white;box-shadow:0 0 0 2px ${index === 0 ? "rgba(249,115,22,.55)" : "rgba(37,99,235,.35)"}"></span>`,
          }),
          title: index === 0 ? "Start point: click here to close the boundary" : `Boundary point ${index + 1}`,
        }).addTo(group);
        vertex.on("click", () => {
          if (index === 0 && polygonPoints.length >= 3 && !polygonClosedRef.current) {
            polygonClosedRef.current = true;
            setPolygonClosed(true);
          } else setSelectedPolygonPoint(index);
        });
        vertex.on("dragend", () => {
          const next = vertex.getLatLng();
          setPolygonPoints((points) => points.map((item, pointIndex) => pointIndex === index
            ? { lat: Number(next.lat.toFixed(7)), lng: Number(next.lng.toFixed(7)) }
            : item));
        });
      });
    }
    if (!polygonMode) {
      if (storePoint && validCoordinate(storePoint.lat, storePoint.lng)) {
        L.circleMarker([storePoint.lat, storePoint.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#16a34a",
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
      }
      serviceZones.forEach((zone) => {
        const geometry = zone.boundaryGeometry;
        const raw = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : geometry?.coordinates ?? geometry?.points ?? geometry?.vertices;
        if (Array.isArray(raw) && raw.length >= 3) {
          const points: Array<[number, number]> = raw.map((item: any) => Array.isArray(item)
            ? [Number(item[1]), Number(item[0])]
            : [Number(item.lat ?? item.latitude), Number(item.lng ?? item.longitude)]);
          if (points.every((item) => validCoordinate(Number(item[0]), Number(item[1])))) {
            L.polygon(points, {
              color: "#16a34a",
              weight: 2,
              opacity: 0.8,
              fillColor: "#22c55e",
              fillOpacity: 0.1,
              interactive: false,
            }).addTo(group);
          }
          return;
        }
        const centreLat = Number((zone as any).centreLatitude ?? (zone as any).centerLatitude);
        const centreLng = Number((zone as any).centreLongitude ?? (zone as any).centerLongitude);
        const radiusMeters = Number(zone.radiusMeters);
        if (validCoordinate(centreLat, centreLng) && Number.isFinite(radiusMeters) && radiusMeters > 0) {
          L.circle([centreLat, centreLng], {
            radius: radiusMeters,
            color: "#16a34a",
            weight: 2,
            opacity: 0.8,
            fillColor: "#22c55e",
            fillOpacity: 0.1,
            interactive: false,
          }).addTo(group);
        }
      });
      if (!polygonMode && serviceZones.length) {
        const zoneKey = serviceZones.map((zone: any) => `${zone.id}:${zone.boundaryGeometry ? JSON.stringify(zone.boundaryGeometry) : `${zone.centreLatitude ?? zone.centerLatitude},${zone.centreLongitude ?? zone.centerLongitude},${zone.radiusMeters ?? ""}`}`).join("|");
        if (zoneKey && fittedZoneKeyRef.current !== zoneKey) {
          const bounds = L.latLngBounds([]);
          serviceZones.forEach((zone: any) => {
            const geometry = zone.boundaryGeometry;
            const raw = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : geometry?.coordinates ?? geometry?.points ?? geometry?.vertices;
            if (Array.isArray(raw)) raw.forEach((item: any) => {
              const lat = Array.isArray(item) ? Number(item[1]) : Number(item.lat ?? item.latitude);
              const lng = Array.isArray(item) ? Number(item[0]) : Number(item.lng ?? item.longitude);
              if (validCoordinate(lat, lng)) bounds.extend([lat, lng]);
            });
            const lat = Number(zone.centreLatitude ?? zone.centerLatitude);
            const lng = Number(zone.centreLongitude ?? zone.centerLongitude);
            const radius = Number(zone.radiusMeters);
            if (validCoordinate(lat, lng) && Number.isFinite(radius) && radius > 0) {
              const deltaLat = radius / 111320;
              const deltaLng = radius / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
              bounds.extend([lat - deltaLat, lng - deltaLng]);
              bounds.extend([lat + deltaLat, lng + deltaLng]);
            }
          });
          if (bounds.isValid()) {
            instance.fitBounds(bounds.pad(0.12), { animate: false, maxZoom: 17 });
            fittedZoneKeyRef.current = zoneKey;
          }
        }
      }
    }
    if (liveGpsPoint && validCoordinate(liveGpsPoint.lat, liveGpsPoint.lng)) {
      L.circle([liveGpsPoint.lat, liveGpsPoint.lng], {
        radius: 35,
        color: "#2563eb",
        weight: 1,
        opacity: 0.35,
        fillColor: "#60a5fa",
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(group);
      L.circleMarker([liveGpsPoint.lat, liveGpsPoint.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
    return () => { group.removeFrom(instance); };
  }, [leafletReady, polygonMode, polygonPoints, polygonClosed, liveGpsPoint, selected, initial, serviceZones, storePoint]);

  const loadServiceability = async (point: { lat: number; lng: number }) => {
    // Preview zones are client-only. Real assigned zones must be rechecked at
    // the current map coordinate so stale `insideServiceZone` values cannot
    // keep seller or rider pickup locations incorrectly unavailable.
    if (suppliedServiceZones?.some((zone) => zone.id <= 0)) {
      return suppliedServiceZones.some((zone) => zone.insideServiceZone);
    }
    try {
      const data = await customFetch<{ items: typeof serviceZones }>(`/api/public/service-zones?type=${serviceZoneType}&lat=${point.lat}&lng=${point.lng}`, { responseType: "json" });
      const items = data.items ?? [];
      setServiceZones(items);
      if (suppliedServiceZones) {
        const assignedIds = new Set(suppliedServiceZones.map((zone) => Number(zone.id)));
        return items.some((zone) => assignedIds.has(Number(zone.id)) && zone.insideServiceZone);
      }
      return items.some((zone) => zone.insideServiceZone);
    } catch {
      return null;
    }
  };

  const buildLocation = async (point: { lat: number; lng: number }) => {
    setBusy(true);
    setError("");
    setFallbackCenter(point);
    try {
      const distance = storePoint ? haversineKm(storePoint, point) : null;
      let address = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
      let parts: ReturnType<typeof locationPartsFromGeocodeResult> = { pincode: "", city: "", district: "", state: "", area: "" };
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
      } else {
        const data = await customFetch<any>(`/api/maps/geocode?latlng=${point.lat},${point.lng}`, { responseType: "json" });
        const best = data.results?.[0];
        address = best?.formatted_address || address;
        parts = locationPartsFromGeocodeResult(best, address);
      }
      const zoneAvailable = await loadServiceability(point);
      const shopAvailable = distance === null || distance <= SERVICE_RADIUS_KM;
      setSelected({
        lat: point.lat,
        lng: point.lng,
        address,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        available: zoneAvailable === null ? shopAvailable : zoneAvailable,
        ...parts,
      });
    } catch {
      const distance = storePoint ? haversineKm(storePoint, point) : null;
      const zoneAvailable = await loadServiceability(point);
      setSelected({
        lat: point.lat,
        lng: point.lng,
        address: `Pinned location ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        available: zoneAvailable === null ? distance === null || distance <= SERVICE_RADIUS_KM : zoneAvailable,
      });
      setError("Address name could not be loaded, but this pinned coordinate is ready.");
    } finally {
      setBusy(false);
    }
  };

  const setMarkerPosition = (point: { lat: number; lng: number }) => {
    if (leafletMap.current) {
      setFallbackCenter(point);
      const centre = leafletMap.current.getCenter();
      if (Math.abs(centre.lat - point.lat) > 0.0000001 || Math.abs(centre.lng - point.lng) > 0.0000001) {
        leafletMap.current.panTo([point.lat, point.lng], { animate: true, duration: 0.2 });
      } else {
        void buildLocation(point);
      }
      return;
    }
    if (!window.google?.maps || !map.current) return;
    if (!marker.current) {
      marker.current = new window.google.maps.Marker({
        map: map.current,
        position: point,
        draggable: false,
        visible: false,
        title: "Selected delivery point",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(PICKUP_PIN_SVG),
          scaledSize: new window.google.maps.Size(28, 48),
          anchor: new window.google.maps.Point(14, 48),
        },
      });
    } else {
      marker.current.setPosition(point);
    }
    map.current.panTo(point);
    void buildLocation(point);
  };

  const addPolygonPoint = (point: { lat: number; lng: number }) => {
    if (!polygonMode || polygonClosedRef.current) return;
    setPolygonPoints((points) => {
      if (points.length >= 3) {
        const first = points[0];
        const distance = Math.hypot((point.lat - first.lat) * 111, (point.lng - first.lng) * 111);
        if (distance <= 0.03) {
          polygonClosedRef.current = true;
          setPolygonClosed(true);
          return points;
        }
      }
      return [...points, point];
    });
  };

  const locateMe = async () => {
    try {
      setBusy(true);
      const point = await browserGps();
      setLiveGpsPoint(point);
      // Keep the visible fallback road map in sync when Google tiles are unavailable.
      setFallbackCenter(point);
      setFallbackZoom(polygonMode ? SERVICE_ZONE_DEFAULT_ZOOM : 18);
      if (map.current && window.google?.maps) {
        if (!currentLocationMarker.current && window.google?.maps) {
          currentLocationMarker.current = new window.google.maps.Marker({
            map: map.current,
            position: point,
            title: "Current location reference",
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#f97316",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
            },
          });
        } else {
          currentLocationMarker.current?.setPosition(point);
          currentLocationMarker.current?.setMap(map.current);
        }
      }
      if (map.current && polygonMode) {
        map.current.setCenter(point);
        onLocationChange?.(point);
      } else if (leafletMap.current) {
        leafletMap.current.setView([point.lat, point.lng], SERVICE_ZONE_DEFAULT_ZOOM, { animate: true });
        onLocationChange?.(point);
        if (!polygonMode) setMarkerPosition(point);
      } else if (map.current) setMarkerPosition(point);
      else await buildLocation(point);
      if (!polygonMode) onLocationChange?.(point);
      if (map.current) map.current.setZoom(polygonMode ? SERVICE_ZONE_DEFAULT_ZOOM : 20);
      else if (leafletMap.current) leafletMap.current.setZoom(SERVICE_ZONE_DEFAULT_ZOOM);
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        if (gpsWatchId.current !== null) navigator.geolocation.clearWatch(gpsWatchId.current);
        gpsWatchId.current = navigator.geolocation.watchPosition(
          (position) => {
            const nextPoint = {
              lat: Number(position.coords.latitude.toFixed(7)),
              lng: Number(position.coords.longitude.toFixed(7)),
            };
            setLiveGpsPoint(nextPoint);
            setFallbackCenter((current) => current ?? nextPoint);
            if (currentLocationMarker.current && map.current) {
              currentLocationMarker.current.setPosition(nextPoint);
              currentLocationMarker.current.setMap(map.current);
            }
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        );
      }
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
      setFallbackCenter(point);
      setFallbackZoom(polygonMode ? SERVICE_ZONE_DEFAULT_ZOOM : 18);
      if (map.current && polygonMode) {
        map.current.setCenter(point);
        map.current.setZoom(SERVICE_ZONE_DEFAULT_ZOOM);
      } else if (leafletMap.current) {
        leafletMap.current.setView([point.lat, point.lng], SERVICE_ZONE_DEFAULT_ZOOM, { animate: true });
        if (!polygonMode) {
          setMarkerPosition(point);
          onLocationChange?.(point);
        }
      } else if (map.current) {
        setMarkerPosition(point);
        map.current.setZoom(20);
        onLocationChange?.(point);
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
    const rect = mapRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    fallbackSizeRef.current = { width: rect.width, height: rect.height };
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
    if (polygonMode) {
      addPolygonPoint(point);
      return;
    }
    setFallbackCenter(point);
    void buildLocation(point);
  };

  const moveFallbackPolygonPoint = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (draggingPolygonPointRef.current !== index) return;
    event.preventDefault();
    event.stopPropagation();
    polygonVertexMovedRef.current = true;
    const point = fallbackPointFromEvent(event);
    setPolygonPoints((points) => points.map((item, pointIndex) => pointIndex === index ? point : item));
  };

  const fallbackPlot = (point: { lat: number; lng: number }) => {
    const centerPoint = fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint;
    const centerX = lngToTileX(centerPoint.lng, fallbackZoom);
    const centerY = latToTileY(centerPoint.lat, fallbackZoom);
    const pointX = lngToTileX(point.lng, fallbackZoom);
    const pointY = latToTileY(point.lat, fallbackZoom);
    const { width, height } = fallbackSizeRef.current;
    return {
      x: Math.max(2, Math.min(98, 50 + (pointX - centerX) * 256 * 100 / width)),
      y: Math.max(2, Math.min(98, 50 + (pointY - centerY) * 256 * 100 / height)),
    };
  };

  const startFallbackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    setPolygonCursorPoint(null);
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

  useEffect(() => {
    if (!active || !mapRef.current || polygonMode || USE_SHARED_LEAFLET_MAP) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let googleErrorObserver: MutationObserver | null = null;
    setFallbackMap(true);
    setGoogleTilesReady(false);
    googleMapFailed.current = false;
    const handleAuthFailure = () => {
      googleMapFailed.current = true;
      setFallbackMap(true);
      setGoogleTilesReady(false);
      if (map.current) {
        map.current.setMapTypeId?.("roadmap");
        map.current.setOptions?.({ clickableIcons: false, gestureHandling: "none" });
      }
      if (!selected) void buildLocation(defaultDeliveryPoint);
    };
    window.addEventListener("cm-google-maps-auth-failure", handleAuthFailure);
    loadGoogleMaps().then(async (google) => {
      if (cancelled || !mapRef.current) return;
      const detectGoogleError = () => {
        if (cancelled || !mapRef.current || googleMapFailed.current) return;
        const text = mapRef.current.textContent || "";
        const errorNode = mapRef.current.querySelector(".gm-err-aut, .gm-err-container");
        if (errorNode || /map data not|something went wrong|development purposes only|for development purposes/i.test(text)) {
          handleAuthFailure();
        }
      };
      googleErrorObserver = new MutationObserver(detectGoogleError);
      googleErrorObserver.observe(mapRef.current, { childList: true, subtree: true, characterData: true });
      geocoder.current = new google.maps.Geocoder();
      const firstPoint = initial ? { lat: initial.lat, lng: initial.lng } : defaultDeliveryPoint;
      const center = firstPoint;
      const mapId = window.__cmGoogleMapsRuntimeConfig?.mapStyleId || env("MAP_STYLE_ID") || "";
      map.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: polygonMode ? SERVICE_ZONE_DEFAULT_ZOOM : 18,
        disableDefaultUI: true,
        clickableIcons: true,
        gestureHandling: "greedy",
        scrollwheel: true,
        disableDoubleClickZoom: false,
        keyboardShortcuts: true,
        mapTypeId: is3D ? "satellite" : "roadmap",
        tilt: is3D ? 45 : 0,
        heading: 0,
        rotateControl: true,
        isFractionalZoomEnabled: true,
        tiltInteractionEnabled: true,
        ...(mapId ? { mapId, renderingType: "VECTOR" } : {}),
        styles: mapId ? undefined : PLACE_LABEL_MAP_STYLE,
      });
      setMapReady(true);
      resizeObserver = new ResizeObserver(() => {
        if (!map.current || !window.google?.maps) return;
        window.google.maps.event.trigger(map.current, "resize");
      });
      resizeObserver.observe(mapRef.current);
      googleTileTimer.current = window.setTimeout(() => {
        if (cancelled) return;
        setFallbackMap(true);
      }, 3500);
      google.maps.event.addListenerOnce(map.current, "tilesloaded", () => {
        if (googleTileTimer.current) window.clearTimeout(googleTileTimer.current);
        googleTileTimer.current = null;
        if (cancelled || googleMapFailed.current) return;
        // Google can fire `tilesloaded` while showing its own auth/error pane.
        // Only promote it above the OSM fallback when the map surface is healthy.
        window.setTimeout(() => {
          if (cancelled || googleMapFailed.current || !mapRef.current) return;
          const surfaceText = mapRef.current.textContent || "";
          const hasGoogleError = /map data not|something went wrong|development purposes only|for development purposes/i.test(surfaceText);
          if (hasGoogleError) {
            googleMapFailed.current = true;
            setGoogleTilesReady(false);
            setFallbackMap(true);
            return;
          }
          setGoogleTilesReady(true);
          setFallbackMap(false);
        }, 120);
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
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        if (polygonMode) {
          addPolygonPoint(point);
          return;
        }
        setMarkerPosition(point);
        onLocationChange?.(point);
      });
      map.current.addListener("idle", () => {
        if (polygonMode) return;
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
          if (polygonMode) map.current?.setCenter(point);
          else setMarkerPosition(point);
          if (!polygonMode) onLocationChange?.(point);
        });
      }
      if (!polygonMode) setMarkerPosition(firstPoint);
      if (!initial && locateFirst) void locateMe();
    }).catch(async () => {
      setFallbackMap(true);
      setGoogleTilesReady(false);
      setFallbackZoom(SERVICE_ZONE_DEFAULT_ZOOM);
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
      resizeObserver?.disconnect();
      googleErrorObserver?.disconnect();
      marker.current?.setMap(null);
      currentLocationMarker.current?.setMap(null);
      storeMarker.current?.setMap(null);
      circle.current?.setMap(null);
      zoneOverlays.current.forEach((overlay) => overlay.setMap?.(null));
      zoneOverlays.current = [];
      marker.current = null;
      currentLocationMarker.current = null;
      map.current = null;
      setMapReady(false);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (googleTileTimer.current) window.clearTimeout(googleTileTimer.current);
      if (gpsWatchId.current !== null) {
        navigator.geolocation?.clearWatch(gpsWatchId.current);
        gpsWatchId.current = null;
      }
    };
  }, [active, polygonMode]);

  useEffect(() => {
    if (USE_SHARED_LEAFLET_MAP || !map.current) return;
    map.current.setMapTypeId(is3D ? "satellite" : "roadmap");
    map.current.setTilt(is3D ? 45 : 0);
    map.current.setOptions({
      gestureHandling: "greedy",
      scrollwheel: true,
      rotateControl: is3D,
      tiltInteractionEnabled: is3D,
    });
  }, [is3D, mapReady]);

  useEffect(() => {
    if (!window.google?.maps || !map.current) return;
    zoneOverlays.current.forEach((overlay) => overlay.setMap?.(null));
    zoneOverlays.current = serviceZones.map((zone) => {
      const geometry = zone.boundaryGeometry;
      const coordinates = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : geometry?.coordinates ?? geometry?.points ?? geometry?.vertices;
      if (Array.isArray(coordinates) && coordinates.length >= 3) {
        const paths = coordinates.map((point: any) => Array.isArray(point) ? { lat: Number(point[1]), lng: Number(point[0]) } : { lat: Number(point.lat ?? point.latitude), lng: Number(point.lng ?? point.longitude) });
        const world = [
          { lat: 85, lng: -180 },
          { lat: 85, lng: 180 },
          { lat: -85, lng: 180 },
          { lat: -85, lng: -180 },
        ];
        return new window.google.maps.Polygon({
          map: map.current,
          paths: [world, paths],
          fillColor: "#111827",
          fillOpacity: 0.58,
          strokeOpacity: 0,
          clickable: false,
        });
      }
      return null;
    });
    return () => {
      zoneOverlays.current.forEach((overlay) => overlay?.setMap?.(null));
    };
  }, [serviceZones, fallbackMap, mapReady]);

  useEffect(() => {
    if (!window.google?.maps || !map.current || !polygonMode) return;
    boundaryMarkers.current.forEach((item) => item.setMap?.(null));
    const outerMask = [
      { lat: 85, lng: -180 },
      { lat: 85, lng: 180 },
      { lat: -85, lng: 180 },
      { lat: -85, lng: -180 },
    ];
    const shape = polygonClosed ? new window.google.maps.Polygon({
      map: map.current,
      paths: [outerMask, polygonPoints],
      fillColor: "#111827",
      fillOpacity: 0.58,
      strokeOpacity: 0,
      clickable: false,
    }) : new window.google.maps.Polyline({
      map: map.current,
      path: polygonPoints,
      strokeColor: "#2563eb",
      strokeOpacity: 0.95,
      strokeWeight: 3,
      clickable: false,
    });
    boundaryMarkers.current = polygonClosed ? [] : polygonPoints.map((point, index) => {
      const dot = new window.google.maps.Marker({
        map: map.current,
        position: point,
        draggable: true,
        title: index === 0 ? "Start point: click here to close the boundary" : `Boundary point ${index + 1}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: index === 0 ? 6 : 5,
          fillColor: index === 0 ? "#f97316" : "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      dot.addListener("click", () => {
        if (index === 0 && polygonPoints.length >= 3 && !polygonClosedRef.current) {
          polygonClosedRef.current = true;
          setPolygonClosed(true);
        }
      });
      dot.addListener("drag", (event: any) => {
        const nextPath = shape.getPath().getArray().map((item: any) => ({ lat: item.lat(), lng: item.lng() }));
        nextPath[index] = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        shape.setPath(nextPath);
      });
      dot.addListener("dragend", (event: any) => {
        const nextPoint = { lat: Number(event.latLng.lat().toFixed(7)), lng: Number(event.latLng.lng().toFixed(7)) };
        setPolygonPoints((points) => points.map((item, pointIndex) => pointIndex === index ? nextPoint : item));
      });
      return dot;
    });
    return () => {
      shape.setMap(null);
      boundaryMarkers.current.forEach((item) => item.setMap?.(null));
      boundaryMarkers.current = [];
    };
  }, [polygonMode, polygonPoints, polygonClosed, mapReady]);

  useEffect(() => {
    if (polygonMode) return;
    polygonClosedRef.current = false;
    setPolygonPoints([]);
    setPolygonClosed(false);
  }, [polygonMode]);

  useEffect(() => {
    if (leafletMap.current) {
      window.setTimeout(() => leafletMap.current?.invalidateSize(), 80);
      return;
    }
    if (!window.google?.maps || !map.current) return;
    const currentCenter = map.current.getCenter?.();
    window.setTimeout(() => {
      window.google.maps.event.trigger(map.current, "resize");
      if (currentCenter) map.current?.setCenter(currentCenter);
    }, 80);
  }, [fullscreen]);

  if (!active) return null;

  const center = fallbackCenter ?? selected ?? storePoint ?? defaultDeliveryPoint;
  const polygonCentre = polygonPoints.length
    ? polygonPoints.reduce((result, point) => ({ lat: result.lat + point.lat, lng: result.lng + point.lng }), { lat: 0, lng: 0 })
    : center;
  const polygonSaveLocation: PickupLocation = {
    ...(selected ?? {
      address: "Service area boundary",
      distanceKm: null,
      available: true,
    }),
    lat: polygonPoints.length ? polygonCentre.lat / polygonPoints.length : center.lat,
    lng: polygonPoints.length ? polygonCentre.lng / polygonPoints.length : center.lng,
    boundaryGeometry: polygonMode && polygonPoints.length >= 3 && polygonClosed
      ? { type: "Polygon", coordinates: [[...polygonPoints, polygonPoints[0]].map((point) => [point.lng, point.lat])] }
      : undefined,
  };
  const undoPolygonPoint = () => {
    if (!polygonPoints.length) return;
    polygonClosedRef.current = false;
    setPolygonClosed(false);
    setSelectedPolygonPoint(null);
    setPolygonPoints((points) => points.slice(0, -1));
  };
  const deleteSelectedPolygonPoint = () => {
    if (selectedPolygonPoint === null || polygonPoints.length <= 3) return;
    polygonClosedRef.current = false;
    setPolygonClosed(false);
    setPolygonPoints((points) => points.filter((_, index) => index !== selectedPolygonPoint));
    setSelectedPolygonPoint(null);
  };
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
      fallbackSrc: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${tileZoom}/${y}/${wrappedX}`,
      fallbackAltSrc: `https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${y}.png`,
      left: `${(x - centerTileX) * 256}px`,
      top: `${(y - centerTileY) * 256}px`,
    };
  });
  const fallbackZoneOverlays: Array<
    | { kind: "polygon"; id: number; points: Array<{ lat: number; lng: number }> }
  > = serviceZones.reduce((overlays, zone: any) => {
    const geometry = zone.boundaryGeometry;
    const rawCoordinates = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : geometry?.coordinates ?? geometry?.points ?? geometry?.vertices;
    if (Array.isArray(rawCoordinates) && rawCoordinates.length >= 3) {
      const points = rawCoordinates
        .map((point: any) => Array.isArray(point)
          ? { lat: Number(point[1]), lng: Number(point[0]) }
          : { lat: Number(point.lat ?? point.latitude), lng: Number(point.lng ?? point.longitude) })
        .filter((point: { lat: number; lng: number }) => validCoordinate(point.lat, point.lng));
      if (points.length >= 3) {
        overlays.push({ kind: "polygon", id: Number(zone.id), points });
        return overlays;
      }
    }
    return overlays;
  }, [] as Array<
    | { kind: "polygon"; id: number; points: Array<{ lat: number; lng: number }> }
  >);
  // Polygon editing must never be blocked by a Google Maps auth/tile error.
  // Keep the reliable road-tile surface in front while drawing service zones.
  // Keep the OSM tile surface available whenever Google is still loading or
  // rejects the current origin. The map container must never become blank just
  // because the optional Google layer is unavailable.
  // Polygon mode uses Leaflet's native tile/geometry layers. The legacy
  // screen-projected fallback surface is only for the non-polygon picker.
  const showFallbackSurface = !polygonMode && fallbackMap && !googleTilesReady;
  const completedFallbackPolygon = polygonClosed && polygonPoints.length >= 3 ? polygonPoints : null;
  const visibleFallbackZones = polygonMode && polygonPoints.length >= 3 ? [] : fallbackZoneOverlays;

  const mapSurface = (
    <>
      <div
        className={`relative isolate flex-shrink-0 overflow-hidden bg-slate-100 ${fullscreen ? "h-[100dvh] min-h-[100dvh]" : compact ? "h-[280px] min-h-[260px] sm:h-[340px]" : "h-[50dvh] min-h-[320px] sm:h-[56dvh]"}`}
      >
        <div ref={mapRef} className="absolute inset-0 z-0" />
        {showFallbackSurface && (
          <div
            role="button"
            tabIndex={0}
            onClick={selectFallbackPoint}
            onPointerDown={startFallbackDrag}
            onPointerMove={(event) => {
              moveFallbackDrag(event);
              if (polygonMode && !fallbackDrag) setPolygonCursorPoint(fallbackPointFromEvent(event));
            }}
            onPointerUp={endFallbackDrag}
            onPointerCancel={endFallbackDrag}
            onPointerLeave={() => { if (!fallbackDrag) setPolygonCursorPoint(null); }}
              onWheel={(event) => {
              event.preventDefault();
              if (wheelZoomTimer.current !== null) return;
              wheelZoomTimer.current = window.setTimeout(() => {
                wheelZoomTimer.current = null;
                setFallbackZoom((value) => Math.min(FALLBACK_TILE_MAX_ZOOM, Math.max(4, value + (event.deltaY < 0 ? 1 : -1))));
              }, 300);
            }}
            className="absolute inset-0 z-[2] block h-full w-full touch-none overflow-hidden bg-[#dbe7ee] text-left"
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
                    if (image.dataset.triedEsri !== "true") {
                      image.dataset.triedEsri = "true";
                      image.src = tile.fallbackSrc;
                      return;
                    }
                    if (image.dataset.triedOsm !== "true") {
                      image.dataset.triedOsm = "true";
                      image.src = tile.fallbackAltSrc;
                      return;
                    }
                    image.style.display = "none";
                  }}
                  // The tile origin is the top-left corner. Translating each tile
                  // by half its size shifts the whole basemap and breaks GPS alignment.
                  style={{ left: tile.left, top: tile.top }}
                />
              ))}
            </div>
            {(visibleFallbackZones.length > 0 || completedFallbackPolygon) && <svg className="pointer-events-none absolute inset-0 z-[4] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  {(completedFallbackPolygon ? [completedFallbackPolygon] : visibleFallbackZones.map((zone) => zone.points)).map((points, index) => {
                    const maskPoints = points.map((point) => { const plot = fallbackPlot(point); return `${plot.x},${plot.y}`; }).join(" ");
                    return <polygon key={`zone-hole-${index}`} points={maskPoints} fill="black" />;
                  })}
                </mask>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="#111827" opacity="0.58" mask={`url(#${maskId})`} />
            </svg>}
            {liveGpsPoint && (() => {
              const plot = fallbackPlot(liveGpsPoint);
              return <div className="pointer-events-none absolute z-[8] -translate-x-1/2 -translate-y-1/2" style={{ left: `${plot.x}%`, top: `${plot.y}%` }} aria-label="Live GPS location">
                <span className="absolute -inset-2 animate-ping rounded-full bg-blue-500/35" />
                <span className="relative block h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-lg" />
              </div>;
            })()}
            {polygonPoints.length > 0 && !polygonClosed && <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={[...polygonPoints, ...(polygonCursorPoint ? [polygonCursorPoint] : [])].map((point) => { const plot = fallbackPlot(point); return `${plot.x},${plot.y}`; }).join(" ")} fill="none" stroke="#2563eb" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            </svg>}
            {!polygonClosed && polygonPoints.map((point, index) => {
              const plot = fallbackPlot(point);
              return <button type="button" key={`${point.lat}-${point.lng}-${index}`} className={`pointer-events-auto absolute z-[7] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg ${index === 0 ? "h-5 w-5 border-orange-200 bg-orange-500 ring-2 ring-orange-400/60" : selectedPolygonPoint === index ? "h-4 w-4 bg-blue-700 ring-2 ring-blue-300" : "h-2.5 w-2.5 bg-blue-600"}`} style={{ left: `${plot.x}%`, top: `${plot.y}%` }} title={index === 0 ? "Start point: click here to close the boundary" : `Boundary point ${index + 1}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); polygonVertexMovedRef.current = false; draggingPolygonPointRef.current = index; setSelectedPolygonPoint(index); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => moveFallbackPolygonPoint(event, index)} onPointerUp={(event) => { event.stopPropagation(); draggingPolygonPointRef.current = null; }} onPointerCancel={() => { draggingPolygonPointRef.current = null; }} onClick={(event) => { event.stopPropagation(); if (polygonVertexMovedRef.current) { polygonVertexMovedRef.current = false; return; } if (index === 0 && polygonPoints.length >= 3 && !polygonClosedRef.current) { polygonClosedRef.current = true; setPolygonClosed(true); } else { setSelectedPolygonPoint(index); } }}>
                <span className="sr-only">{index === 0 ? "Start point" : `Boundary point ${index + 1}`}</span>
              </button>;
            })}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-3 text-xs font-semibold text-slate-700 shadow-xl">
              {polygonMode ? (polygonClosed ? "Service area complete. Click Save service area." : polygonPoints.length >= 3 ? "Tap the first orange dot to close the border." : "Tap the map to add boundary dots.") : "Move or tap the map to set the exact point."}
            </div>
          </div>
        )}
        {!polygonMode && <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-12 w-7 -translate-x-1/2 -translate-y-full drop-shadow-xl"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: PICKUP_PIN_SVG }}
        />}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-lg">
          <span className="mr-3 inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-green-600" /> Service area</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Outside service area</span>
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
          {(showFallbackSurface || polygonMode || USE_SHARED_LEAFLET_MAP) && <>
            <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => leafletMap.current ? leafletMap.current.zoomIn() : setFallbackZoom((value) => Math.min(FALLBACK_TILE_MAX_ZOOM, value + 1))} aria-label="Zoom in map"><Plus className="h-5 w-5" /></Button>
            <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => leafletMap.current ? leafletMap.current.zoomOut() : setFallbackZoom((value) => Math.max(4, value - 1))} aria-label="Zoom out map"><Minus className="h-5 w-5" /></Button>
          </>}
          <Button size="icon" className={`rounded-full shadow-xl hover:bg-white ${is3D ? "bg-blue-600 text-white hover:text-slate-900" : "bg-white text-slate-900"}`} onClick={() => setIs3D((value) => !value)} aria-label={is3D ? "Switch to 2D map" : "Switch to 3D satellite map"}>
            <Layers className="h-5 w-5" />
          </Button>
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={locateMe}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {polygonMode ? <div className={`${fullscreen ? "absolute inset-x-3 bottom-3 z-20" : ""} flex items-center justify-between gap-3 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur`}>
        <p className="text-sm font-semibold text-slate-700">{polygonClosed ? `${polygonPoints.length} points ready` : "Tap the map to draw the boundary"}</p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={undoPolygonPoint} disabled={!polygonPoints.length}>Undo</Button>
          <Button type="button" variant="outline" size="sm" onClick={deleteSelectedPolygonPoint} disabled={selectedPolygonPoint === null || polygonPoints.length <= 3}>Delete point</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { polygonClosedRef.current = false; setPolygonPoints([]); setPolygonClosed(false); setSelectedPolygonPoint(null); }} disabled={!polygonPoints.length}>Cancel</Button>
          <Button type="button" size="sm" disabled={polygonPoints.length < 3 || !polygonClosed || busy} onClick={() => onConfirm(polygonSaveLocation)}>{confirmLabel}</Button>
        </div>
      </div> : <div className={`${fullscreen ? "absolute inset-x-3 bottom-3 z-20 max-h-[32dvh] overflow-y-auto rounded-3xl bg-white/95 shadow-2xl backdrop-blur" : mode === "inline" ? "" : "native-page-scroll max-h-[34dvh] overflow-y-auto"} flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3`}>
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-full bg-orange-100 p-2 text-primary">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold">{selected?.address || "Detecting selected address..."}</p>
            {!hideTechnicalDetails && <p className="mt-1 text-xs text-muted-foreground">
              Lat: {selected ? selected.lat.toFixed(7) : "--"} | Lng: {selected ? selected.lng.toFixed(7) : "--"}
            </p>}
            <p className="mt-1 text-xs font-semibold">
              Distance from shop: {selected?.distanceKm === null || selected?.distanceKm === undefined ? "Checking" : `${selected.distanceKm.toFixed(2)} km`}
            </p>
          </div>
          <Navigation className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
        {selected?.available && (
          <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">Delivery available at this location.</p>
        )}
        {!selected?.available && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            Sorry, cMart is not available at this location yet.
          </p>
        )}
        {polygonMode && <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-700"><span className="min-w-0 flex-1">{polygonClosed ? "Boundary closed and ready to save." : polygonPoints.length >= 3 ? "Tap the orange start dot to finish the area." : "Tap the map to add boundary dots."} Points: {polygonPoints.length}</span><Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-blue-800 hover:bg-blue-100" onClick={() => { polygonClosedRef.current = false; setPolygonPoints([]); setPolygonClosed(false); }} disabled={!polygonPoints.length}>Clear points</Button></div>}
        <Button className="mt-4 w-full" size="lg" disabled={polygonMode ? polygonPoints.length < 3 || !polygonClosed || busy : !selected || !selected.available || busy} onClick={() => onConfirm(polygonMode ? polygonSaveLocation : selected!)}>
          {busy ? "Checking location..." : confirmLabel}
        </Button>
      </div>}
    </>
  );

  if (mode === "inline") {
    return (
      <div className={`${fullscreen ? "fixed inset-0 z-[120] rounded-none border-0 bg-white" : "overflow-hidden rounded-[28px] border bg-white shadow-sm"}`}>
        <div className={`${fullscreen ? "hidden" : "flex"} flex-shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4`}>
          <div className="min-w-0">
            <Badge className={selected?.available ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
              {selected?.available ? "Delivery available" : "No service area"}
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
              {selected?.available ? "Delivery available" : "No service area"}
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
