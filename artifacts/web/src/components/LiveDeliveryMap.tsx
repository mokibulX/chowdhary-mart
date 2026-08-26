import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bike, Clock, Crosshair, Expand, Home, MapPin, MessageCircle, Navigation, Package, Phone, Route, ShieldCheck, Store, UserRound, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getRuntimeWebsocketUrl } from "@/lib/mobile-runtime";
import { customFetch } from "@workspace/api-client-react";

declare global {
  interface Window {
    google?: any;
    __cmGoogleMapsPromise?: Promise<any>;
    gm_authFailure?: () => void;
    __cmGoogleMapsRuntimeConfig?: { key: string; mapStyleId?: string | null };
  }
}

type Point = {
  lat?: number | string | null;
  lng?: number | string | null;
  label?: string;
  address?: string;
  speed?: number | string | null;
  heading?: number | string | null;
  accuracy?: number | string | null;
  updatedAt?: string | Date | null;
};

type LiveDeliveryMapProps = {
  tracking?: any;
  compact?: boolean;
  role?: "customer" | "partner" | "admin";
  className?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Seller accepted",
  preparing: "Preparing",
  packed: "Partner assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  arriving: "Arriving",
  delivered: "Delivered",
};

const STATUS_RING: Record<string, string> = {
  online: "#22c55e",
  waiting: "#f59e0b",
  arriving: "#2563eb",
  delivering: "#0ea5e9",
  offline: "#94a3b8",
  delivered: "#16a34a",
};

let sharedSocket: Socket | null = null;

function getEnv(name: string) {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[`VITE_${name}`] || env[name] || "";
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
    // Static APK/browser builds still work with Vite-injected map keys.
  }
  const key = getEnv("MAPS_API_KEY") || getEnv("GOOGLE_MAPS_API_KEY");
  const mapStyleId = getEnv("MAP_STYLE_ID") || null;
  return key ? { key, mapStyleId } : null;
}

function getRealtimeUrl() {
  return getRuntimeWebsocketUrl();
}

async function loadGoogleMaps() {
  const runtime = await getMapsRuntimeConfig();
  const apiKey = runtime?.key;
  const mapStyleId = runtime?.mapStyleId || getEnv("MAP_STYLE_ID");
  if (!apiKey) return Promise.reject(new Error("Google Maps API key missing"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__cmGoogleMapsPromise) return window.__cmGoogleMapsPromise;

  window.__cmGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-cm-google-maps]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google));
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places,geometry",
      v: "weekly",
    });
    if (mapStyleId) params.set("map_ids", mapStyleId);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.cmGoogleMaps = "true";
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent("cm-google-maps-auth-failure"));
      window.__cmGoogleMapsPromise = undefined;
      script.remove();
      reject(new Error("Google Maps key is not allowed for this app. Check API, billing and referrer settings."));
    };
    script.onload = () => {
      setTimeout(() => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps could not initialize"));
      }, 50);
    };
    script.onerror = () => {
      window.__cmGoogleMapsPromise = undefined;
      script.remove();
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return window.__cmGoogleMapsPromise;
}

type LatLng = { lat: number; lng: number };

function pointFrom(value: Point | undefined | null): LatLng | null {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function maskVehicle(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "Vehicle verified";
  return text.length > 4 ? `${text.slice(0, 2)}••••${text.slice(-2)}` : "••••";
}

function fallbackAvatar() {
  return "/delivery-partner-bike.png";
}

function createRiderOverlay(google: any, options: {
  position: LatLng;
  map: any;
  photoUrl?: string;
  name: string;
  status: string;
  heading: number;
  onClick: () => void;
}) {
  class RiderOverlay extends google.maps.OverlayView {
    div?: HTMLButtonElement;
    position = options.position;
    heading = options.heading;
    status = options.status;
    photoUrl = options.photoUrl;

    onAdd() {
      const div = document.createElement("button");
      div.type = "button";
      div.className = "cm-rider-marker";
      div.setAttribute("aria-label", `Open ${options.name} rider card`);
      div.innerHTML = markerHtml(this.photoUrl, this.status, this.heading);
      div.addEventListener("click", options.onClick);
      this.div = div;
      this.getPanes().overlayMouseTarget.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));
      if (!point) return;
      this.div.style.transform = `translate(${point.x - 34}px, ${point.y - 56}px)`;
      this.div.innerHTML = markerHtml(this.photoUrl, this.status, this.heading);
    }

    onRemove() {
      this.div?.remove();
    }

    update(next: { position: LatLng; heading: number; status: string; photoUrl?: string }) {
      this.position = next.position;
      this.heading = next.heading;
      this.status = next.status;
      this.photoUrl = next.photoUrl;
      this.draw();
    }
  }

  const overlay = new RiderOverlay();
  overlay.setMap(options.map);
  return overlay;
}

function markerHtml(photoUrl: string | undefined, status: string, heading: number) {
  const ring = STATUS_RING[status] ?? STATUS_RING.waiting;
  const safePhoto = photoUrl || fallbackAvatar();
  return `
    <span class="cm-rider-photo" style="border-color:${ring}">
      <img src="${safePhoto}" alt="" onerror="this.src='${fallbackAvatar()}'" />
    </span>
    <span class="cm-rider-bike" style="transform:translate(-50%, 0) rotate(${heading}deg)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 17.5A2.5 2.5 0 1 1 5 12.5a2.5 2.5 0 0 1 0 5Zm14 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM7.5 14h5.2l-1.6-3H8.7l-1.2 3Zm9.1-1.5h1.1l-2.2-4.4h-2.8v1.6h1.8l.7 1.4-2.5 2.9h2.1l1.8-1.5ZM5 16.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm14 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"/></svg>
    </span>
  `;
}

export function LiveDeliveryMap({ tracking, compact = false, role = "customer", className = "" }: LiveDeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const directionRenderer = useRef<any>(null);
  const routePolyline = useRef<any>(null);
  const trafficLayer = useRef<any>(null);
  const transitLayer = useRef<any>(null);
  const riderOverlay = useRef<any>(null);
  const staticMarkers = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [riderCardOpen, setRiderCardOpen] = useState(false);
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("satellite");
  const [trafficOn, setTrafficOn] = useState(false);
  const [transitOn, setTransitOn] = useState(false);
  const [routeTravelTime, setRouteTravelTime] = useState<string | null>(null);
  const [liveGps, setLiveGps] = useState<any>(null);
  const [fallbackMap, setFallbackMap] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const status = String(tracking?.status ?? "pending");
  const isDelivered = status === "delivered";
  const beforePickup = ["pending", "confirmed", "preparing", "packed"].includes(status);
  const storeLocation = tracking?.storeLocation as Point | undefined;
  const customerLocation = tracking?.customerLocation as Point | undefined;
  const rawPartner = (liveGps ?? tracking?.partnerLocation ?? tracking?.deliveryPartner?.location) as Point | undefined;
  const partnerInfo = tracking?.deliveryPartner ?? {};
  const store = pointFrom(storeLocation);
  const customer = pointFrom(customerLocation);
  const partner = pointFrom(rawPartner);
  const origin = isDelivered ? null : partner;
  const destination = beforePickup ? store : customer;
  const etaMins = isDelivered ? 0 : Math.max(1, Number(tracking?.estimatedMins ?? 40));
  const distanceKm = Number(tracking?.distanceKm ?? 0);
  const speed = Number(tracking?.speed ?? rawPartner?.["speed"] ?? partnerInfo?.location?.speed ?? 0);
  const accuracy = Number(tracking?.locationAccuracy ?? rawPartner?.["accuracy"] ?? partnerInfo?.location?.accuracy ?? 0);
  const heading = Number(tracking?.riderHeading ?? rawPartner?.["heading"] ?? partnerInfo?.location?.heading ?? 0);
  const riderStatus = isDelivered ? "delivered" : status === "arriving" ? "arriving" : ["picked_up", "on_the_way"].includes(status) ? "delivering" : partnerInfo?.status ?? "waiting";
  const lastUpdated = tracking?.lastLocationUpdatedAt ?? rawPartner?.["updatedAt"] ?? partnerInfo?.location?.updatedAt;
  const title = isDelivered ? "Order delivered" : beforePickup ? "Rider heading to seller" : `Arriving in ${etaMins} mins`;
  const googleKeyMissing = !(getEnv("MAPS_API_KEY") || getEnv("GOOGLE_MAPS_API_KEY"));
  const routeUnavailable = !origin || !destination;
  const shouldShowFallbackMap = fallbackMap || googleKeyMissing || Boolean(error && !ready);

  const boundsPoints = useMemo(() => [store, customer, partner].filter(Boolean) as LatLng[], [store?.lat, store?.lng, customer?.lat, customer?.lng, partner?.lat, partner?.lng]);

  useEffect(() => {
    const orderId = tracking?.orderId;
    if (!orderId || isDelivered) return;
    const websocketUrl = getRealtimeUrl();
    if (!sharedSocket) {
      sharedSocket = io(websocketUrl, {
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
    }
    sharedSocket.emit("join:order", orderId);
    const onTracking = (payload: any) => {
      if (Number(payload?.orderId) === Number(orderId)) setLiveGps(payload);
    };
    sharedSocket.on("delivery:tracking", onTracking);
    return () => {
      sharedSocket?.off("delivery:tracking", onTracking);
    };
  }, [tracking?.orderId, isDelivered]);

  useEffect(() => {
    if (!mapRef.current || googleKeyMissing) {
      if (googleKeyMissing) {
        setFallbackMap(true);
        setError("Google Maps API key missing. Set VITE_MAPS_API_KEY / MAPS_API_KEY in .env.");
      }
      return;
    }

    let cancelled = false;
    const handleAuthFailure = () => {
      setFallbackMap(true);
      setError("Google Maps key is not allowed for this app. Fallback live map is active.");
    };
    window.addEventListener("cm-google-maps-auth-failure", handleAuthFailure);
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapRef.current) return;
        const center = partner ?? store ?? customer;
        if (!center) {
          setError("Live map needs a real customer, store or rider GPS coordinate.");
          setFallbackMap(true);
          return;
        }
        const mapId = getEnv("MAP_STYLE_ID");
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center,
          zoom: compact ? 14 : 15,
          mapTypeId: mapType,
          tilt: mapType === "satellite" ? 45 : 0,
          heading: 0,
          rotateControl: true,
          isFractionalZoomEnabled: true,
          tiltInteractionEnabled: true,
          ...(mapId ? { mapId, renderingType: "VECTOR" } : {}),
          disableDefaultUI: true,
          clickableIcons: true,
          gestureHandling: "greedy",
          backgroundColor: "#f8fafc",
          styles: getEnv("MAP_STYLE_ID") ? undefined : PLACE_LABEL_MAP_STYLE,
        });
        directionRenderer.current = new google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: "#0757ee",
            strokeOpacity: 0.95,
            strokeWeight: compact ? 5 : 7,
          },
        });
        trafficLayer.current = new google.maps.TrafficLayer();
        transitLayer.current = new google.maps.TransitLayer();
        setReady(true);
        setFallbackMap(false);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setFallbackMap(true);
          setError(err instanceof Error ? err.message : "Google Maps failed to load");
        }
      });
    return () => {
      cancelled = true;
      window.removeEventListener("cm-google-maps-auth-failure", handleAuthFailure);
      routePolyline.current?.setMap(null);
      routePolyline.current = null;
      trafficLayer.current?.setMap(null);
      transitLayer.current?.setMap(null);
      trafficLayer.current = null;
      transitLayer.current = null;
    };
  }, [compact, googleKeyMissing]);

  useEffect(() => {
    if (!ready || !mapInstance.current || !window.google?.maps) return;
    mapInstance.current.setMapTypeId(mapType);
    mapInstance.current.setTilt(mapType === "satellite" ? 45 : 0);
  }, [mapType, ready]);

  useEffect(() => {
    if (!ready || !mapInstance.current || !window.google?.maps) return;
    window.setTimeout(() => {
      window.google.maps.event.trigger(mapInstance.current, "resize");
      if (boundsPoints.length) {
        const bounds = new window.google.maps.LatLngBounds();
        boundsPoints.forEach((point) => bounds.extend(point));
        mapInstance.current.fitBounds(bounds, compact ? 48 : 84);
      }
    }, 80);
  }, [fullscreen, ready, boundsPoints.length, compact]);

  useEffect(() => {
    if (!ready || !trafficLayer.current || !mapInstance.current) return;
    trafficLayer.current.setMap(trafficOn ? mapInstance.current : null);
  }, [trafficOn, ready]);

  useEffect(() => {
    if (!ready || !transitLayer.current || !mapInstance.current) return;
    transitLayer.current.setMap(transitOn ? mapInstance.current : null);
  }, [transitOn, ready]);

  useEffect(() => {
    if (!ready || !mapInstance.current || !window.google?.maps) return;
    const google = window.google;
    staticMarkers.current.forEach((marker) => marker.setMap(null));
    staticMarkers.current = [];

    if (store) staticMarkers.current.push(new google.maps.Marker({
      position: store,
      map: mapInstance.current,
      title: storeLocation?.label ?? "Pickup store",
      icon: svgIcon(storeMarkerSvg(), 42, 42),
    }));
    if (customer) staticMarkers.current.push(new google.maps.Marker({
      position: customer,
      map: mapInstance.current,
      title: customerLocation?.label ?? "Delivery address",
      icon: svgIcon(customerMarkerSvg(), 42, 42),
    }));

    if (partner && !isDelivered) {
      const photoUrl = partnerInfo.publicProfilePhotoUrl || partnerInfo.photoUrl || partnerInfo.profilePhotoUrl;
      if (!riderOverlay.current) {
        riderOverlay.current = createRiderOverlay(google, {
          position: partner,
          map: mapInstance.current,
          photoUrl,
          name: partnerInfo.name ?? "Delivery partner",
          status: riderStatus,
          heading,
          onClick: () => setRiderCardOpen((value) => !value),
        });
      } else {
        riderOverlay.current.update({ position: partner, photoUrl, status: riderStatus, heading });
      }
    } else {
      riderOverlay.current?.setMap(null);
      riderOverlay.current = null;
    }

    if (boundsPoints.length) {
      const bounds = new google.maps.LatLngBounds();
      boundsPoints.forEach((point) => bounds.extend(point));
      mapInstance.current.fitBounds(bounds, compact ? 48 : 84);
    }
  }, [ready, store?.lat, store?.lng, customer?.lat, customer?.lng, partner?.lat, partner?.lng, isDelivered, heading, riderStatus, boundsPoints.length]);

  useEffect(() => {
    if (!ready || !window.google?.maps || !directionRenderer.current) return;
    const google = window.google;
    setRouteTravelTime(null);
    const clearFallbackRoute = () => {
      routePolyline.current?.setMap(null);
      routePolyline.current = null;
    };
    const drawFallbackRoute = (path: LatLng[]) => {
      clearFallbackRoute();
      if (!path.length || !mapInstance.current) return;
      routePolyline.current = new google.maps.Polyline({
        path,
        map: mapInstance.current,
        strokeColor: "#0757ee",
        strokeOpacity: 0.95,
        strokeWeight: compact ? 5 : 7,
      });
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      mapInstance.current.fitBounds(bounds, compact ? 48 : 84);
    };
    if (routeUnavailable || isDelivered) {
      directionRenderer.current.setDirections({ routes: [] });
      clearFallbackRoute();
      setRouteTravelTime(null);
      return;
    }
    const service = new google.maps.DirectionsService();
    service.route({
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
      drivingOptions: { departureTime: new Date(), trafficModel: google.maps.TrafficModel.BEST_GUESS },
      provideRouteAlternatives: false,
    }, (result: any, routeStatus: string) => {
      if (routeStatus === "OK" && result) {
        clearFallbackRoute();
        directionRenderer.current.setDirections(result);
        setRouteTravelTime(result.routes?.[0]?.legs?.[0]?.duration?.text || null);
        setError("");
      } else {
        directionRenderer.current.setDirections({ routes: [] });
        customFetch<any>(`/api/maps/directions?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`, { responseType: "json" })
          .then((data) => {
            const fallbackPath = data?.routes?.[0]?.path;
            if (Array.isArray(fallbackPath) && fallbackPath.length) {
              drawFallbackRoute(fallbackPath.map((point: LatLng) => ({ lat: Number(point.lat), lng: Number(point.lng) })).filter((point: LatLng) => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
              setRouteTravelTime(data?.routes?.[0]?.legs?.[0]?.duration?.text || null);
              setError("");
              return;
            }
            clearFallbackRoute();
            setError(`Google Directions unavailable: ${routeStatus}. No road route was returned.`);
          })
          .catch(() => {
            clearFallbackRoute();
            setError(`Google Directions unavailable: ${routeStatus}. No fake route is shown.`);
          });
      }
    });
  }, [ready, origin?.lat, origin?.lng, destination?.lat, destination?.lng, status, routeUnavailable, isDelivered]);

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-[120] rounded-none border-0 bg-white shadow-none" : "overflow-hidden rounded-2xl border bg-white shadow-sm"} ${className}`}>
      <style>{`
        .cm-rider-marker { position:absolute; z-index:5; height:78px; width:68px; border:0; background:transparent; padding:0; cursor:pointer; }
        .cm-rider-photo { position:absolute; left:50%; top:0; display:block; height:48px; width:48px; transform:translateX(-50%); overflow:hidden; border:4px solid #22c55e; border-radius:999px; background:#fff; box-shadow:0 12px 24px rgba(15,23,42,.28); }
        .cm-rider-photo img { height:100%; width:100%; object-fit:cover; }
        .cm-rider-bike { position:absolute; left:50%; bottom:0; display:flex; height:34px; width:34px; align-items:center; justify-content:center; border-radius:999px; background:#0757ee; color:white; box-shadow:0 10px 20px rgba(7,87,238,.35); transform-origin:center; transition:transform .45s ease; }
        .cm-rider-bike svg { height:23px; width:23px; }
      `}</style>

      <div className={`relative min-w-0 overflow-hidden bg-slate-100 ${fullscreen ? "h-[100dvh] min-h-[100dvh]" : compact ? "h-[500px] min-h-[500px] sm:h-[430px] sm:min-h-[430px]" : "h-[76dvh] min-h-[560px] sm:h-[700px]"}`}>
        <div ref={mapRef} className="h-full w-full" />
        {shouldShowFallbackMap && (
          <FallbackRouteMap
            store={store}
            customer={customer}
            partner={partner}
            status={status}
            title={title}
          />
        )}

        {(error || routeUnavailable) && (
          <div className="absolute inset-x-3 top-3 z-20 rounded-2xl border border-amber-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur">
            <p className="font-bold text-amber-700">{error || "Waiting for real GPS coordinates"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Google map never shows fake route. Seller GPS, customer pin and rider live GPS are required.
            </p>
          </div>
        )}

        <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
          <Button size="icon" className="rounded-full bg-white text-slate-900 shadow-xl hover:bg-white" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? "Exit fullscreen map" : "Open fullscreen map"}>
            {fullscreen ? <X className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
          </Button>
        </div>

        <div className={`absolute left-3 right-3 z-10 max-h-[58%] overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur ${fullscreen ? "bottom-3 max-h-[38dvh]" : "bottom-3"}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-2 bg-blue-100 text-blue-700 hover:bg-blue-100">
                {role === "admin" ? "Admin live map" : role === "partner" ? "Partner navigation" : "Customer live tracking"}
              </Badge>
              <h2 className="text-lg font-black">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {lastUpdated ? `GPS updated ${new Date(lastUpdated).toLocaleTimeString("en-IN")}` : "Waiting for rider GPS"}
                {accuracy ? ` · accuracy ${Math.round(accuracy)}m` : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <MapStat icon={Clock} label="Travel time" value={isDelivered ? "Done" : routeTravelTime || `${etaMins} min`} />
              <MapStat icon={Navigation} label="Distance" value={distanceKm ? `${distanceKm.toFixed(1)} km` : "Live"} />
              <MapStat icon={Route} label="Speed" value={speed ? `${Math.round(speed)} km/h` : "GPS"} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setMapType((value) => value === "roadmap" ? "satellite" : "roadmap")}>
              <MapPin className="mr-2 h-4 w-4" /> {mapType === "roadmap" ? "Satellite" : "Road"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTrafficOn((value) => !value)}>
              <Navigation className="mr-2 h-4 w-4" /> {trafficOn ? "Hide traffic" : "Traffic"}
            </Button>
            <Button size="sm" variant={transitOn ? "default" : "outline"} onClick={() => setTransitOn((value) => !value)}>
              <Route className="mr-2 h-4 w-4" /> {transitOn ? "Hide transit" : "Transit view"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!mapInstance.current || !window.google?.maps || !boundsPoints.length) return;
              const bounds = new window.google.maps.LatLngBounds();
              boundsPoints.forEach((point) => bounds.extend(point));
              mapInstance.current.fitBounds(bounds, compact ? 48 : 84);
            }}>
              <Crosshair className="mr-2 h-4 w-4" /> Recenter
            </Button>
            {origin && destination && (
              <a href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`} target="_blank" rel="noreferrer">
                <Button size="sm" className="bg-[#0757ee] hover:bg-[#0648c7]">
                  <Navigation className="mr-2 h-4 w-4" /> Directions
                </Button>
              </a>
            )}
          </div>
        </div>

        {riderCardOpen && !isDelivered && (
          <RiderCard
            partnerInfo={partnerInfo}
            status={riderStatus}
            etaMins={etaMins}
            onClose={() => setRiderCardOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function MapStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="min-w-[72px] rounded-2xl bg-slate-50 px-3 py-2">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <p className="font-black">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function RiderCard({ partnerInfo, status, etaMins, onClose }: { partnerInfo: any; status: string; etaMins: number; onClose: () => void }) {
  const phone = partnerInfo?.phone;
  const photoUrl = partnerInfo?.publicProfilePhotoUrl || partnerInfo?.photoUrl || partnerInfo?.profilePhotoUrl || fallbackAvatar();
  return (
    <div className="absolute right-3 top-3 z-30 w-[min(330px,calc(100%-24px))] rounded-3xl border bg-white p-4 shadow-2xl">
      <button type="button" className="absolute right-3 top-2 text-sm text-muted-foreground" onClick={onClose}>Close</button>
      <div className="flex gap-3 pr-10">
        <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-100 ring-4" style={{ ["--tw-ring-color" as string]: STATUS_RING[status] ?? STATUS_RING.waiting }}>
          <img src={photoUrl} alt={partnerInfo?.name ?? "Delivery partner"} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = fallbackAvatar(); }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black">{partnerInfo?.name ?? "Delivery partner"}</p>
          <p className="text-xs text-muted-foreground">ID: DP-{partnerInfo?.id ?? "ASSIGNED"}</p>
          <p className="mt-1 text-sm capitalize">{status.replace(/_/g, " ")} · ETA {etaMins} min</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <InfoTile label="Rating" value={partnerInfo?.rating ? `${Number(partnerInfo.rating).toFixed(1)} ★` : "Verified"} />
        <InfoTile label="Vehicle" value={partnerInfo?.vehicleType ?? "Bike"} />
        <InfoTile label="Number" value={maskVehicle(partnerInfo?.vehicleNumber)} />
        <InfoTile label="Status" value={status.replace(/_/g, " ")} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={phone ? `tel:${phone}` : undefined}>
          <Button className="w-full" disabled={!phone}><Phone className="mr-2 h-4 w-4" /> Call</Button>
        </a>
        <Button variant="outline"><MessageCircle className="mr-2 h-4 w-4" /> Chat</Button>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-bold capitalize">{value}</p>
    </div>
  );
}

function FallbackRouteMap({
  store,
  customer,
  partner,
  status,
  title,
}: {
  store: LatLng | null;
  customer: LatLng | null;
  partner: LatLng | null;
  status: string;
  title: string;
}) {
  const points = [store, partner, customer].filter(Boolean) as LatLng[];
  const bounds = points.length
    ? points.reduce((acc, point) => ({
      minLat: Math.min(acc.minLat, point.lat),
      maxLat: Math.max(acc.maxLat, point.lat),
      minLng: Math.min(acc.minLng, point.lng),
      maxLng: Math.max(acc.maxLng, point.lng),
    }), { minLat: points[0].lat, maxLat: points[0].lat, minLng: points[0].lng, maxLng: points[0].lng })
    : { minLat: 22.606, maxLat: 22.61, minLng: 88.468, maxLng: 88.472 };
  const latSpan = Math.max(0.001, bounds.maxLat - bounds.minLat);
  const lngSpan = Math.max(0.001, bounds.maxLng - bounds.minLng);
  const toXY = (point: LatLng | null) => {
    if (!point) return null;
    const x = 12 + ((point.lng - bounds.minLng) / lngSpan) * 76;
    const y = 82 - ((point.lat - bounds.minLat) / latSpan) * 64;
    return { x, y };
  };
  const storePos = toXY(store);
  const partnerPos = toXY(partner);
  const customerPos = toXY(customer);
  const pathPoints = [storePos, partnerPos, customerPos].filter(Boolean) as Array<{ x: number; y: number }>;
  const line = pathPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#eaf3ef]">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: "linear-gradient(31deg, transparent 0 42%, rgba(255,255,255,.95) 42% 47%, transparent 47% 100%), linear-gradient(124deg, transparent 0 43%, rgba(255,255,255,.88) 43% 49%, transparent 49% 100%), linear-gradient(rgba(15,23,42,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.08) 1px, transparent 1px)",
          backgroundSize: "230px 230px, 290px 290px, 44px 44px, 44px 44px",
        }}
      />
      <div className="absolute left-[8%] top-[12%] h-28 w-44 rounded-full bg-emerald-200/70 blur-sm" />
      <div className="absolute right-[8%] top-[22%] h-32 w-48 rounded-3xl bg-blue-100/80" />
      <div className="absolute bottom-[16%] left-[18%] h-24 w-56 rounded-3xl bg-amber-100/80" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {line && (
          <>
            <polyline points={line} fill="none" stroke="rgba(15,23,42,.18)" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={line} fill="none" stroke="#0757ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />
          </>
        )}
      </svg>
      {storePos && <FallbackPin x={storePos.x} y={storePos.y} label="Store" tone="store" icon={<Store className="h-4 w-4" />} />}
      {customerPos && <FallbackPin x={customerPos.x} y={customerPos.y} label="Customer" tone="customer" icon={<Home className="h-4 w-4" />} />}
      {partnerPos && status !== "delivered" && <FallbackPin x={partnerPos.x} y={partnerPos.y} label="Rider" tone="rider" icon={<Bike className="h-4 w-4" />} />}
      <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-2xl bg-white/95 px-4 py-3 shadow-xl">
        <p className="text-xs font-black uppercase text-primary">Live route map</p>
        <p className="mt-1 text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-600">Fallback map active. Real GPS points are still used.</p>
      </div>
    </div>
  );
}

function FallbackPin({
  x,
  y,
  label,
  tone,
  icon,
}: {
  x: number;
  y: number;
  label: string;
  tone: "store" | "customer" | "rider";
  icon: ReactNode;
}) {
  const toneClass = tone === "store" ? "bg-emerald-600" : tone === "customer" ? "bg-red-500" : "bg-[#0757ee]";
  return (
    <div className="absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full border-4 border-white text-white shadow-2xl ${toneClass}`}>
        {icon}
      </div>
      <div className="mt-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-900 shadow-lg">{label}</div>
    </div>
  );
}

function svgIcon(svg: string, width: number, height: number) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(width, height),
    anchor: new window.google.maps.Point(width / 2, height),
  };
}

function storeMarkerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity=".28"/></filter><g filter="url(#s)"><path fill="#16a34a" d="M24 3c8.3 0 15 6.4 15 14.4 0 11.2-15 27.6-15 27.6S9 28.6 9 17.4C9 9.4 15.7 3 24 3Z"/><circle cx="24" cy="18" r="10" fill="#fff"/><path fill="#16a34a" d="M18 17h12v9H18zM20 13h8l3 4H17z"/></g></svg>`;
}

function customerMarkerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity=".28"/></filter><g filter="url(#s)"><path fill="#ef4444" d="M24 3c8.3 0 15 6.4 15 14.4 0 11.2-15 27.6-15 27.6S9 28.6 9 17.4C9 9.4 15.7 3 24 3Z"/><circle cx="24" cy="18" r="10" fill="#fff"/><path fill="#ef4444" d="m16 20 8-7 8 7h-2v8h-5v-5h-2v5h-5v-8z"/></g></svg>`;
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
  { featureType: "road", elementType: "geometry", stylers: [{ saturation: -20 }, { lightness: 20 }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape", stylers: [{ color: "#f8fafc" }] },
];
