import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getListDeliveryOrdersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bike, MapPin, Package, Store, XCircle, Zap } from "lucide-react";

type AlertRole = "seller" | "rider";
type IncomingAlert = {
  key: string;
  role: AlertRole;
  order: any;
};

const SELLER_REASONS = ["Product out of stock", "Shop closed", "Unable to prepare", "Wrong product price", "Too many active orders", "Product unavailable", "Shop temporarily unavailable", "Delivery service unavailable", "Other"];
const RIDER_REASONS = ["Pickup too far", "Delivery distance too far", "Low earning", "Vehicle problem", "Personal reason", "Going offline", "Area not preferred", "Other"];

export function GlobalIncomingOrderAlerts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<IncomingAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // Keep deduplication in memory only. A pending order must be eligible to
  // alert again after a refresh if the previous action did not succeed.
  const seenRef = useRef<Set<string>>(new Set());
  const active = queue[0] ?? null;
  const isDeliveryPartner = user?.role === "delivery_partner";
  const { data: deliveryStatus } = useQuery({
    queryKey: ["/api/delivery/dashboard-summary", "incoming-alert-status", user?.id],
    queryFn: () => customFetch<any>("/api/delivery/dashboard-summary", { responseType: "json" }),
    enabled: isDeliveryPartner,
    refetchInterval: isDeliveryPartner ? 2000 : false,
    staleTime: 2000,
  });

  useEffect(() => {
    if (!user || !["vendor", "delivery_partner"].includes(user.role)) {
      setQueue([]);
      return;
    }
    let stopped = false;
    const poll = async () => {
      try {
        if (user.role === "vendor") {
          const orders = await customFetch<any[]>("/api/vendor/orders?status=pending", { responseType: "json" });
          const alerts = (orders ?? []).map((order) => ({ key: `seller-${user.id}-${order.id}-pending`, role: "seller" as const, order }));
          pushAlerts(alerts);
          const currentKeys = new Set(alerts.map((alert) => alert.key));
          setQueue((current) => current.filter((item) => item.role !== "seller" || currentKeys.has(item.key)));
        }
        const partnerIsOnline = deliveryStatus
          ? deliveryStatus.currentStatus !== "offline"
          : (user as any).isOnline === true;
        if (user.role === "delivery_partner" && partnerIsOnline) {
          const orders = await customFetch<any[]>("/api/delivery/available-orders", { responseType: "json" });
          const eligible = (orders ?? []).filter((order) => order.status === "confirmed" && order.deliveryOffer);
          const alerts = eligible.map((order) => ({ key: `rider-${user.id}-${order.id}-${order.deliveryOffer.id}`, role: "rider" as const, order }));
          pushAlerts(alerts);
          const currentKeys = new Set(alerts.map((alert) => alert.key));
          setQueue((current) => current.filter((item) => item.role !== "rider" || currentKeys.has(item.key)));
        }
      } catch {
        // Listener failures are intentionally quiet; existing pages still show their own errors.
      }
    };
    const pushAlerts = (alerts: IncomingAlert[]) => {
      if (stopped || !alerts.length) return;
      const fresh = alerts.filter((alert) => !seenRef.current.has(alert.key));
      if (!fresh.length) return;
      fresh.forEach((alert) => seenRef.current.add(alert.key));
      setQueue((current) => {
        const keys = new Set(current.map((item) => item.key));
        return [...current, ...fresh.filter((item) => !keys.has(item.key))];
      });
    };
    if (user.role === "delivery_partner" && deliveryStatus?.currentStatus === "offline") {
      setQueue([]);
      setRejecting(false);
      setReason("");
    } else {
      poll();
    }
    const timer = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [user?.id, user?.role, (user as any)?.isOnline, deliveryStatus?.currentStatus]);

  useAlertEffects(Boolean(active));

  const closeActive = () => {
    setQueue((current) => current.slice(1));
    setRejecting(false);
    setReason("");
  };

  const accept = async () => {
    if (!active) return;
    const incoming = active;
    setBusy(true);
    try {
      if (incoming.role === "seller") {
        await customFetch(`/api/vendor/orders/${incoming.order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "confirmed", preparationMins: 12 }),
          responseType: "json",
        });
        toast({ title: "Order accepted", description: "Delivery partner matching started." });
        closeActive();
        setLocation("/vendor/orders");
        return;
      }
      const accepted = await customFetch<any>(`/api/delivery/orders/${incoming.order.id}/accept`, { method: "POST", responseType: "json" });
      // Put the accepted task in the delivery page cache immediately. The
      // polling request still refreshes it, but the route should not wait for
      // a navigation or the next 5-second interval to become visible.
      queryClient.setQueryData<any[]>(getListDeliveryOrdersQueryKey(), (current = []) => {
        const acceptedOrder = {
          ...incoming.order,
          ...accepted,
          store: accepted?.store ?? incoming.order.store,
          liveTracking: {
            ...(incoming.order.liveTracking ?? {}),
            ...(accepted?.liveTracking ?? {}),
            status: accepted?.status ?? incoming.order.status,
            lifecycle: {
              ...(incoming.order.liveTracking?.lifecycle ?? {}),
              ...(accepted?.liveTracking?.lifecycle ?? {}),
              assignedDeliveryPartnerId: accepted?.assignedDeliveryPartnerId,
            },
          },
        };
        return [acceptedOrder, ...current.filter((order) => Number(order.id) !== Number(incoming.order.id))];
      });
      toast({ title: "Delivery accepted", description: "Pickup navigation is ready." });
      closeActive();
      if (location !== "/delivery") setLocation("/delivery");
    } catch (error) {
      const message = (error as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Action failed. Please try again.";
      toast({ title: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!active) return;
    if (!reason.trim() && active.role === "seller") {
      toast({ title: "Reject reason required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (active.role === "seller") {
        await customFetch(`/api/vendor/orders/${active.order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled", reason }),
          responseType: "json",
        });
        toast({ title: "Order rejected", description: reason });
      } else {
        await customFetch(`/api/delivery/orders/${active.order.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: reason || "Rejected by rider" }),
          responseType: "json",
        });
        toast({ title: "Delivery request rejected" });
      }
      closeActive();
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error ?? "Reject failed";
      toast({ title: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const viewFull = () => {
    if (!active) return;
    setLocation(active.role === "seller" ? "/vendor/orders" : "/rider/home");
  };

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[1000] isolate flex h-[100dvh] items-stretch justify-center overflow-y-auto bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="relative flex h-[100dvh] min-h-0 w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[24px]">
        <div className="relative overflow-hidden bg-gray-950 px-4 pb-5 pt-5 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(249,115,22,.55),transparent_30%),radial-gradient(circle_at_80%_15%,rgba(34,197,94,.3),transparent_25%)]" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg">
                {active.role === "seller" ? <Store className="h-7 w-7" /> : <Bike className="h-7 w-7" />}
              </div>
              <h2 className="text-2xl font-black">{active.role === "seller" ? "New Order Received" : "New Delivery Request"}</h2>
              <p className="mt-1 text-sm text-white/70">ChowdharyMart urgent request</p>
            </div>
            <div className="text-right">
              <Countdown createdAt={active.role === "rider" ? active.order.deliveryOffer?.offeredAt : active.order.createdAt} seconds={active.role === "seller" ? 60 : 10} />
              {queue.length > 1 && <Badge className="mt-2 bg-white text-gray-950">{queue.length - 1} queued</Badge>}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {active.role === "seller" ? <SellerAlertBody order={active.order} /> : <RiderAlertBody order={active.order} />}

          {rejecting && (
            <div className="mt-4 rounded-2xl border bg-gray-50 p-3">
              <p className="mb-2 text-sm font-bold">Reject reason</p>
              <div className="grid gap-2">
                {(active.role === "seller" ? SELLER_REASONS : RIDER_REASONS).map((item) => (
                  <button key={item} type="button" className={`rounded-xl border px-3 py-2 text-left text-sm ${reason === item ? "border-primary bg-primary/10 text-primary" : "bg-white"}`} onClick={() => setReason(item)}>
                    {item}
                  </button>
                ))}
                {reason === "Other" && <Input className="h-12 rounded-xl" placeholder="Write reason" onChange={(event) => setReason(event.target.value)} />}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 grid shrink-0 gap-2 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,.08)] sm:p-4">
          {rejecting ? (
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12 rounded-2xl" variant="outline" onClick={() => setRejecting(false)} disabled={busy}>Back</Button>
              <Button className="h-12 rounded-2xl" variant="destructive" onClick={reject} disabled={busy}>{busy ? "Rejecting..." : "Confirm reject"}</Button>
            </div>
          ) : (
            <>
              <Button className="h-14 rounded-2xl text-base font-black" onClick={accept} disabled={busy}>
                <Zap className="mr-2 h-5 w-5" /> {busy ? (active.role === "seller" ? "Accepting order..." : "Accepting delivery...") : active.role === "seller" ? "Accept Order" : "Accept Delivery"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-12 rounded-2xl" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button className="h-12 rounded-2xl" variant="outline" onClick={viewFull} disabled={busy}>View Full Order</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SellerAlertBody({ order }: { order: any }) {
  const created = new Date(order.createdAt);
  const items = order.items ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Order ID" value={`#${order.orderNumber}`} />
        <Metric label="Received" value={created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} />
        <Metric label="Area" value={order.addressSnapshot?.city ?? "Customer area"} />
        <Metric label="Deadline" value="40 min" />
        <Metric label="Payment" value={`${order.paymentMethod} / ${order.paymentStatus}`} />
        <Metric label="Total" value={`Rs.${Number(order.total ?? 0).toFixed(0)}`} strong />
      </div>
      <div className="rounded-2xl border bg-white p-3">
        <p className="mb-3 flex items-center gap-2 font-bold"><Package className="h-4 w-4" /> {items.length} product{items.length === 1 ? "" : "s"}</p>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((item: any) => <AlertItem key={item.orderItemId ?? item.id ?? item.productId} item={item} />)}
        </div>
      </div>
      <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
        <b>Customer instruction:</b> {order.notes || order.deliveryInstruction || "No special instruction"}
      </div>
    </div>
  );
}

function RiderAlertBody({ order }: { order: any }) {
  const tracking = order.liveTracking ?? order.tracking ?? {};
  const earning = order.deliveryPartnerEarning ?? tracking.payout?.delivery ?? order.deliveryFee ?? 0;
  const cod = order.paymentMethod === "cod" ? Number(order.total ?? 0) : 0;
  const pickupDistance = tracking.pickupDistanceKm ?? tracking.distanceKm;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pickup</p>
        <p className="mt-1 font-black">{order.store?.name ?? tracking.storeLocation?.label ?? "Pickup shop"}</p>
        <p className="text-sm text-muted-foreground">{order.store?.address ?? tracking.storeLocation?.address ?? "Shop area"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Pickup ETA" value={pickupDistance == null ? "GPS unavailable" : `${Math.max(1, Math.ceil(Number(pickupDistance) * 4))} min`} />
        <Metric label="Delivery ETA" value={`${tracking.estimatedMins ?? 40} min`} />
        <Metric label="Distance to shop" value={pickupDistance == null ? "GPS unavailable" : `${Number(pickupDistance).toFixed(2)} km`} />
        <Metric label="Earning" value={`Rs.${Number(earning).toFixed(0)}`} strong />
        <Metric label="Packages" value={`${order.items?.length ?? 1}`} />
        <Metric label="COD" value={cod ? `Rs.${cod.toFixed(0)}` : "No"} />
      </div>
      <div className="rounded-2xl bg-blue-50 p-3 text-sm text-blue-800">
        <MapPin className="mb-1 h-4 w-4" />
        Customer area: {order.addressSnapshot?.city ?? tracking.customerLocation?.address ?? "Approximate area shown before accept"}
      </div>
    </div>
  );
}

function AlertItem({ item }: { item: any }) {
  const variant = [item.variantName, item.size && `Size ${item.size}`, (item.colour || item.color) && `Color ${item.colour ?? item.color}`, item.weight && `${item.weight} ${item.unit ?? ""}`].filter(Boolean).join(" · ") || "Standard";
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 rounded-xl border bg-gray-50 p-2">
      <div className="h-14 w-14 overflow-hidden rounded-lg bg-white">
        {item.productImage || item.imageUrl ? <img src={item.productImage ?? item.imageUrl} alt={item.productName ?? item.name} className="h-full w-full object-cover" /> : <Package className="m-4 h-6 w-6 text-gray-300" />}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-1 text-sm font-bold">{item.productName ?? item.name}</p>
        <p className="text-xs text-muted-foreground">{variant}</p>
      </div>
      <div className="text-right text-sm font-black">x{item.quantity ?? item.qty ?? 1}</div>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate ${strong ? "text-lg font-black text-primary" : "text-sm font-bold"}`}>{value}</p>
    </div>
  );
}

function Countdown({ createdAt, seconds }: { createdAt?: string; seconds: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = createdAt ? Math.floor((now - new Date(createdAt).getTime()) / 1000) : 0;
  const left = Math.max(0, seconds - elapsed);
  const pct = Math.max(0, Math.min(100, (left / seconds) * 100));
  return (
    <div className="min-w-20">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/30 bg-white/10 text-lg font-black">{left}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-yellow-300" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function useAlertEffects(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let audioContext: AudioContext | null = null;
    let timer = 0;
    const playTone = () => {
      try {
        const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = audioContext ?? new AudioCtor();
        if (audioContext.state === "suspended") void audioContext.resume();

        // A short two-tone chime is easier to notice than a harsh single beep,
        // while keeping the volume safe for a phone or laptop speaker.
        const start = audioContext.currentTime;
        [[660, 0], [880, 0.18], [660, 0.36]].forEach(([frequency, offset]) => {
          const osc = audioContext!.createOscillator();
          const gain = audioContext!.createGain();
          const at = start + offset;
          osc.type = "sine";
          osc.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.14, at + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
          osc.connect(gain);
          gain.connect(audioContext!.destination);
          osc.start(at);
          osc.stop(at + 0.17);
        });
      } catch {
        // Browser audio policy may block sound until user interaction.
      }
    };
    playTone();
    if ("vibrate" in navigator) navigator.vibrate([240, 120, 240, 120, 420]);
    timer = window.setInterval(playTone, 1800);
    const originalTitle = document.title;
    document.title = "New order · ChowdharyMart";
    return () => {
      window.clearInterval(timer);
      if (audioContext) void audioContext.close().catch(() => undefined);
      if ("vibrate" in navigator) navigator.vibrate(0);
      document.title = originalTitle;
    };
  }, [active]);
}
