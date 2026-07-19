import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Crosshair, Loader2, MapPin, Navigation, Search, X } from "lucide-react";

declare global {
  interface Window {
    google?: any;
    __cmGoogleMapsPromise?: Promise<any>;
    gm_authFailure?: () => void;
  }
}

export type PickupLocation = {
  lat: number;
  lng: number;
  address: string;
  distanceKm: number | null;
  available: boolean;
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
  onClose: () => void;
  onConfirm: (location: PickupLocation) => void;
};

const SERVICE_RADIUS_KM = 5;

function env(name: string) {
  const values = import.meta.env as Record<string, string | undefined>;
  return values[`VITE_${name}`] || values[name] || "";
}

function loadGoogleMaps() {
  const apiKey = env("MAPS_API_KEY") || env("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return Promise.reject(new Error("Google Maps API key missing."));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__cmGoogleMapsPromise) return window.__cmGoogleMapsPromise;

  window.__cmGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({ key: apiKey, libraries: "places,geometry", v: "weekly" });
    const mapStyleId = env("MAP_STYLE_ID");
    if (mapStyleId) params.set("map_ids", mapStyleId);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.cmGoogleMaps = "true";
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent("cm-google-maps-auth-failure"));
      reject(new Error("Google Maps key is not allowed for this app. Check API, billing and referrer settings."));
    };
    script.onload = () => {
      setTimeout(() => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps could not initialize."));
      }, 50);
    };
    script.onerror = () => reject(new Error("Google Maps failed to load."));
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

export function PickupLocationPicker({ open = false, mode = "sheet", store, initial, onClose, onConfirm }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const storeMarker = useRef<any>(null);
  const circle = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const autocomplete = useRef<any>(null);
  const [selected, setSelected] = useState<PickupLocation | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fallbackMap, setFallbackMap] = useState(false);
  const [search, setSearch] = useState("");
  const storePoint = pointFrom(store);
  const active = mode === "inline" || open;
  const defaultDeliveryPoint = storePoint
    ? { lat: Number((storePoint.lat + 0.0016).toFixed(7)), lng: Number((storePoint.lng + 0.0015).toFixed(7)) }
    : { lat: 22.6092, lng: 88.471 };

  const buildLocation = async (point: { lat: number; lng: number }) => {
    setBusy(true);
    setError("");
    try {
      const distance = storePoint ? haversineKm(storePoint, point) : null;
      let address = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
      if (geocoder.current) {
        const result = await geocoder.current.geocode({ location: point });
        address = result.results?.[0]?.formatted_address || address;
      }
      setSelected({
        lat: point.lat,
        lng: point.lng,
        address,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        available: distance === null || distance <= SERVICE_RADIUS_KM,
      });
    } catch {
      setError("Could not convert this location into an address. Please try another point.");
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
        draggable: true,
        title: "Selected delivery point",
      });
      marker.current.addListener("dragend", () => {
        const pos = marker.current.getPosition();
        void buildLocation({ lat: pos.lat(), lng: pos.lng() });
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

  const selectFallbackPoint = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const base = selected ?? (storePoint ? { ...storePoint, address: store?.address || "Store area", distanceKm: 0, available: true } : null);
    const center = base ? { lat: base.lat, lng: base.lng } : { lat: 22.5726, lng: 88.3639 };
    void buildLocation({
      lat: Number((center.lat - y * 0.01).toFixed(7)),
      lng: Number((center.lng + x * 0.01).toFixed(7)),
    });
  };

  useEffect(() => {
    if (!active || !mapRef.current) return;
    let cancelled = false;
    setFallbackMap(false);
    const handleAuthFailure = () => {
      setFallbackMap(true);
      setError("Google Maps key is not allowed for this app. Fallback selector is active.");
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
        mapId: env("MAP_STYLE_ID") || undefined,
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
      if (!initial) void locateMe();
    }).catch(async (err) => {
      setFallbackMap(true);
      setError(err instanceof Error ? err.message : "Map failed to load.");
      if (!selected) {
        try {
          const point = await browserGps();
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
    };
  }, [active]);

  if (!active) return null;

  const mapSurface = (
    <>
      <div className="relative h-[50dvh] min-h-[320px] flex-shrink-0 overflow-hidden bg-slate-900 sm:h-[56dvh]">
        <div ref={mapRef} className="absolute inset-0" />
        {fallbackMap && (
          <button type="button" onClick={selectFallbackPoint} className="absolute inset-0 block h-full w-full overflow-hidden bg-[#e8f2ec] text-left">
            <div className="absolute inset-0 opacity-80" style={{
              backgroundImage: "linear-gradient(30deg, transparent 0 42%, rgba(255,255,255,.9) 42% 47%, transparent 47% 100%), linear-gradient(120deg, transparent 0 44%, rgba(255,255,255,.85) 44% 49%, transparent 49% 100%), linear-gradient(rgba(15,23,42,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.08) 1px, transparent 1px)",
              backgroundSize: "220px 220px, 260px 260px, 42px 42px, 42px 42px",
            }} />
            <div className="absolute left-[16%] top-[18%] h-24 w-36 rounded-full bg-emerald-200/70 blur-sm" />
            <div className="absolute right-[12%] top-[28%] h-28 w-44 rounded-3xl bg-blue-100/80" />
            <div className="absolute bottom-[18%] left-[22%] h-20 w-48 rounded-3xl bg-amber-100/80" />
            {storePoint && (
              <div className="absolute left-1/2 top-1/2 flex -translate-x-[135px] -translate-y-[90px] items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-lg">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Store
              </div>
            )}
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
              <div className="rounded-full bg-white p-2 shadow-2xl ring-4 ring-orange-500/20">
                <MapPin className="h-8 w-8 fill-orange-500 text-orange-600" />
              </div>
              <div className="mt-1 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-bold text-white">Tap map to move pin</div>
            </div>
          </button>
        )}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white p-2 shadow-2xl">
            <Search className="ml-2 h-5 w-5 text-muted-foreground" />
            <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search road, building or landmark" className="border-0 shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <div className="absolute right-3 top-20 z-10 flex flex-col gap-2">
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={locateMe}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
          </Button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-2xl bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-xl">
          Tap map or drag pin exactly to your gate or handover point.
        </div>
      </div>

      <div className={`${mode === "inline" ? "" : "native-page-scroll max-h-[34dvh] overflow-y-auto"} flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3`}>
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
          {busy ? "Checking location..." : "Confirm This Delivery Point"}
        </Button>
      </div>
    </>
  );

  if (mode === "inline") {
    return (
      <div className="overflow-hidden rounded-[28px] border bg-white shadow-sm">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <Badge className={selected?.available ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
              {selected?.available ? "Delivery available" : "Outside 5 KM"}
            </Badge>
            <h2 className="mt-2 text-lg font-black">Select exact delivery point</h2>
            <p className="text-xs text-muted-foreground">Live map, zoom 20. Search, tap map, or drag the pin.</p>
          </div>
          <div className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white shadow-lg">ZOOM 20</div>
        </div>
        <div className="[&>div:first-child]:h-[360px] sm:[&>div:first-child]:h-[430px]">
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
            <h2 className="mt-2 text-lg font-black">Select exact delivery point</h2>
            <p className="text-xs text-muted-foreground">Zoom 20 map. Tap location, search address, or drag the pin.</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="rounded-full"><X className="h-5 w-5" /></Button>
        </div>

        {mapSurface}
      </div>
    </div>
  );
}
