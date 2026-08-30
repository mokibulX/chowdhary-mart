import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRuntimeWebsocketUrl } from "@/lib/mobile-runtime";
import { customFetch } from "@workspace/api-client-react";

type Point = { lat: number; lng: number; label?: string; address?: string; speed?: number | string | null };
type LiveDeliveryMapProps = { tracking?: any; compact?: boolean; role?: "customer" | "partner" | "admin"; className?: string };
let sharedSocket: Socket | null = null;

function pointFrom(value: any): Point | null {
  if (!value) return null;
  const lat = Number(Array.isArray(value) ? value[0] : value.lat ?? value.latitude ?? value.centreLatitude ?? value.center_latitude);
  const lng = Number(Array.isArray(value) ? value[1] : value.lng ?? value.longitude ?? value.centreLongitude ?? value.center_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: value.label ?? value.name, address: value.address, speed: value.speed };
}

function markerIcon(kind: "partner" | "store" | "customer") {
  const color = kind === "partner" ? "#2563eb" : kind === "store" ? "#f97316" : "#16a34a";
  const symbol = kind === "partner" ? "◆" : kind === "store" ? "S" : "C";
  return L.divIcon({
    className: "cm-live-map-marker",
    html: `<span style="display:grid;place-items:center;width:32px;height:32px;border:3px solid #fff;border-radius:50%;background:${color};box-shadow:0 2px 8px rgba(15,23,42,.35);color:#fff;font-weight:800;font-size:13px">${symbol}</span>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

function extractRoute(data: any): [number, number][] {
  const route = data?.routes?.[0] ?? data;
  const raw = route?.path ?? route?.route ?? route?.coordinates ?? route?.polyline;
  if (!Array.isArray(raw)) return [];
  return raw.map(pointFrom).filter((p): p is Point => Boolean(p)).map((p) => [p.lat, p.lng]);
}

export function LiveDeliveryMap({ tracking, compact = false, className = "" }: LiveDeliveryMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({ partner: null, store: null, customer: null });
  const routeRef = useRef<L.Polyline | null>(null);
  const fitOrderRef = useRef<string | number | null>(null);
  const [ready, setReady] = useState(false);
  const [livePartner, setLivePartner] = useState<Point | null>(null);

  const store = useMemo(() => pointFrom(tracking?.storeLocation ?? tracking?.sellerLocation), [tracking?.storeLocation, tracking?.sellerLocation]);
  const customer = useMemo(() => pointFrom(tracking?.customerLocation ?? tracking?.customer?.location), [tracking?.customerLocation, tracking?.customer?.location]);
  const initialPartner = useMemo(() => pointFrom(tracking?.partnerLocation ?? tracking?.deliveryPartner?.location), [tracking?.partnerLocation, tracking?.deliveryPartner?.location]);
  const partner = livePartner ?? initialPartner;
  const status = String(tracking?.status ?? "pending").toLowerCase();
  const isCancelled = status === "cancelled";
  const isDelivered = status === "delivered";
  const beforePickup = ["pending", "confirmed", "preparing", "packed"].includes(status);
  const destination = isCancelled || beforePickup ? store : customer;
  const orderId = tracking?.orderId ?? tracking?.id;

  useEffect(() => {
    setLivePartner(null);
    fitOrderRef.current = null;
  }, [orderId]);

  useEffect(() => {
    if (!orderId || isDelivered) return;
    const socket = sharedSocket ?? (sharedSocket = io(getRuntimeWebsocketUrl(), { transports: ["websocket", "polling"], autoConnect: true }));
    socket.emit("join:order", orderId);
    const onTracking = (payload: any) => {
      if (String(payload?.orderId) !== String(orderId)) return;
      const next = pointFrom(payload?.location ?? payload?.partnerLocation ?? payload?.riderLocation ?? payload);
      if (next) setLivePartner(next);
    };
    socket.on("delivery:tracking", onTracking);
    return () => {
      socket.off("delivery:tracking", onTracking);
    };
  }, [orderId, isDelivered]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    const map = L.map(mapElementRef.current, {
      zoomControl: false, scrollWheelZoom: true, wheelDebounceTime: 80, wheelPxPerZoomLevel: 100,
      zoomAnimation: true, markerZoomAnimation: true, attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20, minZoom: 3, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapRef.current = map;
    setReady(true);
    const resize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(resize);
    observer.observe(mapElementRef.current);
    requestAnimationFrame(resize);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const points: [number, number][] = [];
    const putMarker = (key: "partner" | "store" | "customer", point: Point | null, label: string, kind: "partner" | "store" | "customer") => {
      const existing = markerRefs.current[key];
      if (!point) {
        if (existing) existing.remove();
        markerRefs.current[key] = null;
        return;
      }
      points.push([point.lat, point.lng]);
      if (existing) existing.setLatLng([point.lat, point.lng]);
      else markerRefs.current[key] = L.marker([point.lat, point.lng], { icon: markerIcon(kind), keyboard: false }).addTo(map).bindTooltip(label, { direction: "top", offset: [0, -14] });
    };
    putMarker("store", store, "Seller shop", "store");
    putMarker("customer", customer, "Customer location", "customer");
    putMarker("partner", partner, "Delivery partner live location", "partner");
    const fitKey = String(orderId ?? "") + ":" + (store ? `${store.lat},${store.lng}` : "") + ":" + (customer ? `${customer.lat},${customer.lng}` : "");
    if (points.length && fitOrderRef.current !== fitKey) {
      map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: compact ? 15 : 16, animate: false });
      fitOrderRef.current = fitKey;
    }
  }, [ready, compact, orderId, store, customer, partner]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !partner || !destination) return;
    let active = true;
    const url = `/api/maps/directions?origin=${encodeURIComponent(`${partner.lat},${partner.lng}`)}&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}`;
    customFetch<any>(url, { responseType: "json" }).then((data) => {
      if (!active) return;
      const path = extractRoute(data);
      routeRef.current?.remove();
      routeRef.current = path.length > 1 ? L.polyline(path, { color: "#2563eb", weight: 5, opacity: 0.9, lineCap: "round" }).addTo(map) : null;
    }).catch(() => {
      if (active) routeRef.current?.remove();
      routeRef.current = null;
    });
    return () => { active = false; };
  }, [ready, partner?.lat, partner?.lng, destination?.lat, destination?.lng]);

  return (
    <section className={className} style={{ display: "block" }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, border: "1px solid #dbe3ec", background: "#e8eef2" }}>
        <div ref={mapElementRef} style={{ width: "100%", height: compact ? 250 : 360, minHeight: compact ? 250 : 360 }} />
        {!ready && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(248,250,252,.75)" }}>Loading map...</div>}
      </div>
    </section>
  );
}
