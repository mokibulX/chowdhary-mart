import { Badge } from "@/components/ui/badge";
import { Bike, CheckCircle2, Clock, Crosshair, Home, MapPin, MessageCircle, Navigation, Package, Phone, ShieldCheck, Store, UserRound, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STEP_LABELS: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Seller accepted",
  preparing: "Preparing",
  packed: "Partner assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  arriving: "Arriving",
  delivered: "Delivered",
};

type Point = { lat: number; lng: number; label?: string; address?: string };
const SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const STANDARD_TILE_URL = "https://tile.openstreetmap.org";
const DELIVERY_BOY_BIKE_IMAGE = "/delivery-partner-bike.png";
const routeCache = new Map<string, Point[]>();

type LiveDeliveryMapProps = {
  tracking?: any;
  compact?: boolean;
  role?: "customer" | "partner" | "admin";
  className?: string;
};

export function LiveDeliveryMap({ tracking, compact = false, role = "customer", className = "" }: LiveDeliveryMapProps) {
  const status = tracking?.status ?? "confirmed";
  const isDelivered = status === "delivered";
  const beforePickup = ["pending", "confirmed", "preparing", "packed"].includes(status);
  const afterPickup = ["picked_up", "on_the_way", "arriving", "delivered"].includes(status);
  const etaMins = isDelivered ? 0 : Math.min(40, Math.max(3, Number(tracking?.estimatedMins ?? 40)));
  const distanceKm = Number(tracking?.distanceKm ?? 3.2);
  const store: Point = tracking?.storeLocation ?? { lat: 22.5726, lng: 88.3639, label: "Pickup store", address: "Seller pickup point" };
  const customer: Point = tracking?.customerLocation ?? { lat: 22.6006, lng: 88.3949, label: "Customer", address: "Delivery address" };
  const rawPartner = tracking?.partnerLocation ?? tracking?.deliveryPartner?.location ?? { lat: 22.579, lng: 88.369 };
  const partnerInfo = tracking?.deliveryPartner ?? {};
  const lastLocationUpdatedAt = tracking?.lastLocationUpdatedAt ?? rawPartner?.updatedAt ?? partnerInfo?.location?.updatedAt;
  const lastUpdatedMs = lastLocationUpdatedAt ? Date.now() - new Date(lastLocationUpdatedAt).getTime() : null;
  const isStale = !isDelivered && lastUpdatedMs !== null && lastUpdatedMs > 30000;
  const lowAccuracy = !isDelivered && Number(tracking?.locationAccuracy ?? rawPartner?.accuracy ?? 0) > 80;
  const locationNote = isDelivered
    ? "Tracking stopped after delivery"
    : isStale
      ? "Rider location temporarily unavailable"
      : lastUpdatedMs !== null
        ? `Location updated ${Math.max(0, Math.round(lastUpdatedMs / 1000))} seconds ago`
        : "Waiting for rider GPS";
  const [animatedPartner, setAnimatedPartner] = useState({ lat: Number(rawPartner.lat), lng: Number(rawPartner.lng) });
  const [roadRoute, setRoadRoute] = useState<Point[]>([]);
  const [routeMode, setRouteMode] = useState<"road" | "fallback" | "loading">("loading");
  const [zoomLevel, setZoomLevel] = useState(compact ? 14 : 15);
  const [mapMode, setMapMode] = useState<"standard" | "satellite">("standard");
  const [riderCardOpen, setRiderCardOpen] = useState(false);

  const partner = animatedPartner;
  const destination = beforePickup ? store : customer;
  const nextAction = isDelivered
    ? "Completed"
    : beforePickup
      ? "Go to pickup store"
      : status === "picked_up"
        ? "Start customer delivery"
        : status === "arriving"
          ? "Collect customer OTP"
          : "Ride to customer";
  const title = isDelivered ? "Order delivered" : beforePickup ? "Partner is heading to seller" : `Arriving in ${etaMins} mins`;
  const heightClass = compact ? "h-[310px] sm:h-[340px]" : "h-[76dvh] min-h-[560px] sm:h-[700px]";
  const mapHeight = compact ? 340 : 720;
  const mapWidth = 820;
  const zoom = zoomLevel;

  useEffect(() => {
    const target = { lat: Number(rawPartner.lat), lng: Number(rawPartner.lng) };
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;
    let frame = 0;
    const start = animatedPartner;
    const steps = 20;
    const timer = window.setInterval(() => {
      frame += 1;
      const ease = 1 - Math.pow(1 - frame / steps, 3);
      setAnimatedPartner({
        lat: start.lat + (target.lat - start.lat) * ease,
        lng: start.lng + (target.lng - start.lng) * ease,
      });
      if (frame >= steps) window.clearInterval(timer);
    }, 42);
    return () => window.clearInterval(timer);
  }, [rawPartner.lat, rawPartner.lng]);

  const activeWaypoints = useMemo(() => {
    const start = isDelivered ? customer : { lat: Number(rawPartner.lat), lng: Number(rawPartner.lng) };
    const end = isDelivered ? customer : destination;
    return [start, end].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }, [customer, destination, isDelivered, rawPartner.lat, rawPartner.lng]);

  useEffect(() => {
    if (activeWaypoints.length < 2) {
      setRoadRoute(activeWaypoints);
      setRouteMode("fallback");
      return;
    }
    const controller = new AbortController();
    const coords = activeWaypoints.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
    const cacheKey = `${status}:${coords}`;
    const cachedRoute = routeCache.get(cacheKey);
    if (cachedRoute?.length) {
      setRoadRoute(cachedRoute);
      setRouteMode("road");
      return;
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    setRouteMode("loading");
    window.fetch(url, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Route unavailable")))
      .then((data) => {
        const coordinates = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || !coordinates.length) throw new Error("Route unavailable");
        const nextRoute = coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
        routeCache.set(cacheKey, nextRoute);
        setRoadRoute(nextRoute);
        setRouteMode("road");
      })
      .catch(() => {
        setRoadRoute(activeWaypoints);
        setRouteMode("fallback");
      });
    return () => controller.abort();
  }, [activeWaypoints, status]);

  const map = useMemo(() => {
    const points = [
      ...roadRoute,
      store,
      customer,
      { lat: partner.lat, lng: partner.lng },
    ];
    return buildRealMap({ points, mapWidth, mapHeight, zoom });
  }, [customer, mapHeight, partner.lat, partner.lng, roadRoute, store, zoom]);

  const storePoint = map.point(Number(store.lat), Number(store.lng));
  const customerPoint = map.point(Number(customer.lat), Number(customer.lng));
  const partnerPoint = map.point(Number(partner.lat), Number(partner.lng));
  const destinationPoint = map.point(Number(destination.lat), Number(destination.lng));
  const partnerBearing = Number.isFinite(Number(tracking?.riderHeading ?? rawPartner?.heading))
    ? Number(tracking?.riderHeading ?? rawPartner?.heading)
    : bearingDegrees(partner, destination);
  const riderStatus = isDelivered
    ? "delivered"
    : status === "arriving"
      ? "arriving"
      : ["picked_up", "on_the_way"].includes(status)
        ? "delivering"
        : partnerInfo?.status ?? "waiting";
  const routePoints = (roadRoute.length ? roadRoute : activeWaypoints).map((point) => map.point(point.lat, point.lng)).map((point) => `${point.x},${point.y}`).join(" ");
  const ghostRoutePoints = [store, customer].map((point) => map.point(point.lat, point.lng)).map((point) => `${point.x},${point.y}`).join(" ");
  const pickupDirectionUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${Number(partner.lat).toFixed(6)}%2C${Number(partner.lng).toFixed(6)}%3B${Number(store.lat).toFixed(6)}%2C${Number(store.lng).toFixed(6)}`;
  const dropDirectionUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${Number(partner.lat).toFixed(6)}%2C${Number(partner.lng).toFixed(6)}%3B${Number(customer.lat).toFixed(6)}%2C${Number(customer.lng).toFixed(6)}`;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${className}`}>
      <style>{`
        @keyframes cm-pulse { 0% { transform: scale(.72); opacity: .5; } 100% { transform: scale(2.25); opacity: 0; } }
        @keyframes cm-bike { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-3px) rotate(4deg); } }
        @keyframes cm-flow { to { stroke-dashoffset: -56; } }
        .cm-pulse { animation: cm-pulse 2s ease-out infinite; transform-origin: center; }
        .cm-bike { animation: cm-bike 1.8s ease-in-out infinite; }
        .cm-flow { animation: cm-flow 1.25s linear infinite; }
      `}</style>

      <div className={`relative overflow-hidden bg-[#17251d] ${heightClass}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_20%,rgba(34,197,94,.25),transparent_28%),linear-gradient(180deg,rgba(2,6,23,.25),rgba(2,6,23,.72))]" />
        <div
          className="absolute left-1/2 top-[-5%] h-[112%] overflow-hidden rounded-[28px] shadow-2xl"
          style={{
            width: mapWidth,
            transform: `translateX(-50%) perspective(1000px) rotateX(${compact ? 11 : 15}deg) scale(${compact ? 1.06 : 1.12})`,
            transformOrigin: "center center",
          }}
        >
          {map.tiles.map((tile) => (
            <img
              key={`${tile.x}-${tile.y}`}
              src={mapMode === "satellite" ? `${SATELLITE_TILE_URL}/${zoom}/${tile.y}/${tile.x}` : `${STANDARD_TILE_URL}/${zoom}/${tile.x}/${tile.y}.png`}
              alt=""
              className="absolute h-64 w-64 select-none"
              draggable={false}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <div className={`absolute inset-0 ${mapMode === "satellite" ? "bg-[linear-gradient(180deg,rgba(15,23,42,.08),rgba(15,23,42,.38)),radial-gradient(circle_at_center,transparent,rgba(2,6,23,.4))]" : "bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(15,23,42,.12))]"}`} />

          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${mapWidth} ${mapHeight}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={ghostRoutePoints} fill="none" stroke="#111827" strokeWidth={compact ? 3 : 4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 14" opacity="0.18" />
            <polyline points={routePoints} fill="none" stroke="#0f172a" strokeWidth={compact ? 22 : 30} strokeLinecap="round" strokeLinejoin="round" opacity="0.34" />
            <polyline points={routePoints} fill="none" stroke="#ffffff" strokeWidth={compact ? 16 : 22} strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
            <polyline className="cm-flow" points={routePoints} fill="none" stroke={beforePickup ? "#16a34a" : "#2563eb"} strokeWidth={compact ? 6 : 8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="18 10" />
          </svg>

          <DestinationHalo x={destinationPoint.x} y={destinationPoint.y} />
          <MapMarker x={storePoint.x} y={storePoint.y} icon="store" active={beforePickup} label="Pickup" compact={compact} />
          <MapMarker x={customerPoint.x} y={customerPoint.y} icon="home" active={afterPickup} label="Drop" compact={compact} />
          {!isDelivered && (
            <PartnerMarker
              x={partnerPoint.x}
              y={partnerPoint.y}
              compact={compact}
              bearing={partnerBearing}
              partnerInfo={partnerInfo}
              status={riderStatus}
              onClick={() => setRiderCardOpen((open) => !open)}
            />
          )}
          {!isDelivered && riderCardOpen && (
            <RiderPopup
              x={partnerPoint.x}
              y={partnerPoint.y}
              partnerInfo={partnerInfo}
              status={riderStatus}
              etaMins={etaMins}
              compact={compact}
              onClose={() => setRiderCardOpen(false)}
            />
          )}

          <div className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white shadow">{mapMode === "satellite" ? "Satellite" : "OpenStreetMap roads"}</div>
        </div>

        <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-2">
          <div className="max-w-[72%] rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{role === "admin" ? "Admin live monitor" : role === "partner" ? "Partner navigation" : "Live delivery"}</p>
            <h2 className="mt-0.5 text-base font-bold leading-tight">{title}</h2>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{destination.address ?? destination.label ?? "Destination"}</p>
          </div>
          <Badge className={routeMode === "road" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : routeMode === "loading" ? "bg-gray-100 text-gray-700 hover:bg-gray-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
            {routeMode === "road" ? "Road route" : routeMode === "loading" ? "Routing" : "Fallback"}
          </Badge>
        </div>

        <div className="absolute right-3 top-20 z-10 flex flex-col gap-2">
          <MapButton icon={ZoomIn} label="Zoom in" onClick={() => setZoomLevel((value) => Math.min(17, value + 1))} />
          <MapButton icon={ZoomOut} label="Zoom out" onClick={() => setZoomLevel((value) => Math.max(12, value - 1))} />
          <MapButton icon={Crosshair} label="Recenter" active onClick={() => setZoomLevel(compact ? 14 : 15)} />
        </div>
        <div className="absolute left-3 top-24 z-10 flex overflow-hidden rounded-full border bg-white/95 p-1 text-xs font-semibold shadow-lg backdrop-blur">
          <button type="button" className={`rounded-full px-3 py-1 ${mapMode === "standard" ? "bg-primary text-white" : "text-gray-700"}`} onClick={() => setMapMode("standard")}>Road</button>
          <button type="button" className={`rounded-full px-3 py-1 ${mapMode === "satellite" ? "bg-primary text-white" : "text-gray-700"}`} onClick={() => setMapMode("satellite")}>Satellite</button>
        </div>

        {!compact && (
          <div className="absolute bottom-3 left-3 right-3 z-10 rounded-3xl bg-white p-4 shadow-2xl">
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              <FlowStep active={beforePickup} done={afterPickup || isDelivered} label="Pickup" />
              <FlowStep active={afterPickup && !isDelivered} done={isDelivered} label="On trip" />
              <FlowStep active={status === "arriving"} done={isDelivered} label="OTP handover" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                {partnerInfo.photoUrl ? <img src={partnerInfo.photoUrl} alt={partnerInfo.name} className="h-full w-full object-cover" /> : <Bike className="h-7 w-7 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{partnerInfo.name ?? "Delivery partner assigning"}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">{partnerInfo.vehicleType ?? "bike"} {partnerInfo.vehicleNumber ? `- ${partnerInfo.vehicleNumber}` : ""}</p>
                <p className="mt-1 text-xs font-semibold text-primary">{nextAction}</p>
              </div>
              {partnerInfo.phone && (
                <a href={`tel:${partnerInfo.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full border bg-white text-primary shadow-sm">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <MapStat icon={Clock} label="ETA" value={isDelivered ? "Done" : `${etaMins} min`} />
              <MapStat icon={Navigation} label="Distance" value={`${distanceKm.toFixed(1)} km`} />
              <MapStat icon={ShieldCheck} label={isDelivered ? "OTP" : "OTP"} value={isDelivered ? "Cleared" : tracking?.deliveryOtp ?? "----"} />
            </div>
            <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${isStale || lowAccuracy ? "border-amber-200 bg-amber-50 text-amber-700" : "bg-gray-50 text-muted-foreground"}`}>
              {locationNote}{lowAccuracy ? " · low GPS accuracy" : ""}
            </div>
          </div>
        )}
      </div>

      {compact ? (
        <div className="grid grid-cols-3 gap-2 border-t bg-white p-3">
          <MapStat icon={Clock} label="ETA" value={isDelivered ? "Done" : `${etaMins} min`} />
          <MapStat icon={Package} label="Status" value={STEP_LABELS[status] ?? status} />
          <MapStat icon={Navigation} label="Left" value={`${distanceKm.toFixed(1)} km`} />
          <div className={`col-span-3 rounded-xl border px-3 py-2 text-xs ${isStale || lowAccuracy ? "border-amber-200 bg-amber-50 text-amber-700" : "bg-gray-50 text-muted-foreground"}`}>
            {locationNote}{lowAccuracy ? " · low GPS accuracy" : ""}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <a href={pickupDirectionUrl} target="_blank" rel="noreferrer" className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold text-primary hover:bg-blue-50">
            Pickup directions
          </a>
          <a href={dropDirectionUrl} target="_blank" rel="noreferrer" className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold text-primary hover:bg-blue-50">
            Drop directions
          </a>
        </div>
      )}
    </div>
  );
}

function MapButton({ icon: Icon, label, active = false, onClick }: { icon: any; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur ${active ? "border-primary bg-white text-primary" : "border-white/40 bg-white/90 text-gray-700"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function project(lat: number, lng: number, zoom: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function buildRealMap({ points, mapWidth, mapHeight, zoom }: { points: Point[]; mapWidth: number; mapHeight: number; zoom: number }) {
  const validPoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const centerLat = validPoints.reduce((sum, point) => sum + point.lat, 0) / Math.max(1, validPoints.length);
  const centerLng = validPoints.reduce((sum, point) => sum + point.lng, 0) / Math.max(1, validPoints.length);
  const center = project(centerLat || 22.5726, centerLng || 88.3639, zoom);
  const topLeft = { x: center.x - mapWidth / 2, y: center.y - mapHeight / 2 };
  const startX = Math.floor(topLeft.x / 256) - 1;
  const endX = Math.floor((topLeft.x + mapWidth) / 256) + 1;
  const startY = Math.floor(topLeft.y / 256) - 1;
  const endY = Math.floor((topLeft.y + mapHeight) / 256) + 1;
  const maxTile = 2 ** zoom;
  const tiles = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= maxTile) continue;
      const wrappedX = ((x % maxTile) + maxTile) % maxTile;
      tiles.push({ x: wrappedX, y, left: x * 256 - topLeft.x, top: y * 256 - topLeft.y });
    }
  }

  return {
    tiles,
    point: (lat: number, lng: number) => {
      const pixel = project(lat, lng, zoom);
      return { x: pixel.x - topLeft.x, y: pixel.y - topLeft.y };
    },
  };
}

function DestinationHalo({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute h-20 w-20 rounded-full border-2 border-primary/40 bg-primary/10" style={{ left: x - 40, top: y - 40 }}>
      <div className="cm-pulse absolute inset-0 rounded-full bg-primary/30" />
    </div>
  );
}

function PartnerMarker({
  x,
  y,
  compact,
  bearing,
  partnerInfo,
  status,
  onClick,
}: {
  x: number;
  y: number;
  compact: boolean;
  bearing: number;
  partnerInfo: any;
  status: string;
  onClick: () => void;
}) {
  const size = compact ? 58 : 74;
  const avatarSize = compact ? 34 : 42;
  const ring = riderRingClass(status);
  return (
    <button
      type="button"
      aria-label="Open delivery partner card"
      className="absolute rounded-full text-left transition-[left,top] duration-500 ease-out"
      style={{ left: x - size / 2, top: y - size / 2 - (compact ? 10 : 16) }}
      onClick={onClick}
    >
      <div className="cm-pulse absolute inset-0 rounded-full bg-primary/45" />
      <div className="relative" style={{ width: size, height: size + avatarSize / 2 }}>
        <div
          className={`absolute left-1/2 z-10 -translate-x-1/2 overflow-hidden rounded-full bg-white shadow-xl ring-4 ${ring}`}
          style={{ width: avatarSize, height: avatarSize, top: 0 }}
        >
          <RiderPhoto src={partnerInfo?.photoUrl} name={partnerInfo?.name} />
        </div>
        <div
          className="absolute bottom-0 left-1/2 overflow-hidden rounded-full bg-white/95 shadow-2xl ring-4 ring-white/90"
          style={{ width: size, height: size, transform: "translateX(-50%)" }}
        >
          <div className="h-full w-full" style={{ transform: `rotate(${bearing}deg)` }}>
            <img src={DELIVERY_BOY_BIKE_IMAGE} alt="Delivery bike" className="cm-bike h-full w-full scale-125 object-cover" />
          </div>
        </div>
      </div>
      {!compact && <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-bold capitalize shadow">{status}</div>}
    </button>
  );
}

function RiderPopup({
  x,
  y,
  partnerInfo,
  status,
  etaMins,
  compact,
  onClose,
}: {
  x: number;
  y: number;
  partnerInfo: any;
  status: string;
  etaMins: number;
  compact: boolean;
  onClose: () => void;
}) {
  const left = Math.min(Math.max(12, x - 132), 820 - 276);
  const top = Math.max(12, y - (compact ? 180 : 220));
  const vehicleNumber = maskVehicleNumber(partnerInfo?.vehicleNumber);
  return (
    <div className="absolute z-20 w-[264px] rounded-2xl border bg-white p-3 shadow-2xl" style={{ left, top }}>
      <button type="button" className="absolute right-2 top-2 rounded-full px-2 text-sm text-muted-foreground hover:bg-gray-100" onClick={onClose} aria-label="Close rider card">x</button>
      <div className="flex items-center gap-3 pr-6">
        <div className={`h-14 w-14 overflow-hidden rounded-full bg-gray-100 ring-4 ${riderRingClass(status)}`}>
          <RiderPhoto src={partnerInfo?.photoUrl} name={partnerInfo?.name} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{partnerInfo?.name ?? "Delivery partner"}</p>
          <p className="text-xs text-muted-foreground">{partnerInfo?.partnerId ?? (partnerInfo?.id ? `CM-DP-${String(partnerInfo.id).padStart(5, "0")}` : "Verified rider")}</p>
          <p className="text-xs font-semibold capitalize text-primary">{status}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <InfoPill label="Rating" value={partnerInfo?.rating ? `${Number(partnerInfo.rating).toFixed(1)} star` : "4.8 star"} />
        <InfoPill label="ETA" value={`${etaMins} min`} />
        <InfoPill label="Vehicle" value={partnerInfo?.vehicleType ?? "Bike"} />
        <InfoPill label="Number" value={vehicleNumber} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={partnerInfo?.phone ? `tel:${partnerInfo.phone}` : undefined} className="flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-primary">
          <Phone className="mr-2 h-4 w-4" /> Call
        </a>
        <a href={partnerInfo?.phone ? `sms:${partnerInfo.phone}` : undefined} className="flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-primary">
          <MessageCircle className="mr-2 h-4 w-4" /> Chat
        </a>
      </div>
    </div>
  );
}

function RiderPhoto({ src, name }: { src?: string | null; name?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt={name ? `${name} verified profile` : "Verified rider profile"} className="h-full w-full object-cover" onError={() => setBroken(true)} />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
      <UserRound className="h-5 w-5" />
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-bold">{value}</p>
    </div>
  );
}

function riderRingClass(status: string) {
  if (status === "offline") return "ring-gray-300";
  if (status === "arriving") return "ring-amber-400";
  if (status === "waiting" || status === "packed") return "ring-blue-400";
  if (status === "delivering" || status === "picked_up" || status === "on_the_way") return "ring-green-500";
  return "ring-primary";
}

function maskVehicleNumber(value?: string) {
  const clean = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "Hidden";
  return `${clean.slice(0, 2)}••••${clean.slice(-4)}`;
}

function MapMarker({ x, y, icon, active, label, compact }: { x: number; y: number; icon: "store" | "home"; active: boolean; label: string; compact: boolean }) {
  const Icon = icon === "store" ? Store : Home;
  const tone = icon === "store" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white";
  return (
    <div className="absolute" style={{ left: x - 18, top: y - 18 }}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-full shadow-lg ring-4 ${active ? "ring-yellow-300" : "ring-white"} ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      {!compact && <div className="absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-bold shadow">{label}</div>}
    </div>
  );
}

function FlowStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`rounded-xl border px-2 py-2 ${done ? "border-green-200 bg-green-50 text-green-700" : active ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white text-gray-500"}`}>
      <div className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-current/10">
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
      </div>
      {label}
    </div>
  );
}

function MapStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white/95 p-2 shadow-sm">
      <Icon className="mb-1 h-4 w-4 text-primary" />
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function bearingDegrees(from: Point, to: Point) {
  const lat1 = Number(from.lat) * Math.PI / 180;
  const lat2 = Number(to.lat) * Math.PI / 180;
  const deltaLng = (Number(to.lng) - Number(from.lng)) * Math.PI / 180;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
