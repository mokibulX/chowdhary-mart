import { useEffect, useMemo, useState } from "react";
import { customFetch, getListDeliveryOrdersQueryKey, useListDeliveryOrders, useToggleDeliveryOnline, useUpdateDeliveryLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, CheckCircle, Clock, LocateFixed, MapPin, Navigation, Package, Power, Route, X } from "lucide-react";

const NEXT_STATUS: Record<string, string> = {
  packed: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "delivered",
};

const ACTION_LABEL: Record<string, string> = {
  packed: "Picked up",
  picked_up: "Start delivery",
  on_the_way: "Mark delivered",
};

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [autoGps, setAutoGps] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);

  const { data: orders, isLoading } = useListDeliveryOrders({
    query: { enabled: !!user, queryKey: getListDeliveryOrdersQueryKey(), refetchInterval: 5000 },
  });
  const toggleOnline = useToggleDeliveryOnline();
  const updateLocation = useUpdateDeliveryLocation();

  const refresh = () => qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });
  const activeOrders = (orders ?? []).filter((order: any) => ["packed", "picked_up", "on_the_way"].includes(order.status));
  const waitingOrders = (orders ?? []).filter((order: any) => ["confirmed", "preparing"].includes(order.status));
  const basePoint = useMemo(() => ({ lat: 22.5726, lng: 88.3639 }), []);

  useEffect(() => {
    if (!autoGps) return;
    const timer = window.setInterval(() => {
      const shift = Math.random() / 80;
      updateLocation.mutate({ data: { lat: basePoint.lat + shift, lng: basePoint.lng + shift, speed: 24, heading: 60 } });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [autoGps, basePoint.lat, basePoint.lng, updateLocation]);

  const updateGpsOnce = () => {
    const lat = basePoint.lat + Math.random() / 80;
    const lng = basePoint.lng + Math.random() / 80;
    updateLocation.mutate(
      { data: { lat, lng, speed: 22, heading: 45 } },
      { onSuccess: () => toast({ title: "Location updated", description: "Customers can see your latest GPS point." }) },
    );
  };

  const acceptOrder = async (orderId: number) => {
    setBusyOrderId(orderId);
    try {
      await customFetch(`/api/delivery/orders/${orderId}/accept`, { method: "POST", responseType: "json" });
      toast({ title: "Order accepted", description: "Pickup task added to your route." });
      refresh();
    } catch {
      toast({ title: "Could not accept order", variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const rejectOrder = async (orderId: number) => {
    setBusyOrderId(orderId);
    try {
      await customFetch(`/api/delivery/orders/${orderId}/reject`, { method: "POST", responseType: "json" });
      toast({ title: "Order rejected" });
      refresh();
    } catch {
      toast({ title: "Could not reject order", variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const markStatus = async (order: any) => {
    const status = NEXT_STATUS[order.status];
    if (!status) return;
    setBusyOrderId(order.id);
    try {
      await customFetch(`/api/delivery/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        responseType: "json",
      });
      updateGpsOnce();
      toast({ title: "Delivery updated", description: `Order #${order.orderNumber} is now ${status.replace(/_/g, " ")}.` });
      refresh();
    } catch {
      toast({ title: "Could not update delivery", variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-primary">Chowdhary Mart Partner</Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleOnline.mutate(undefined, { onSuccess: () => toast({ title: "Online status changed" }) })}>
              <Power className="mr-2 h-4 w-4" /> Online
            </Button>
            <Button variant={autoGps ? "default" : "outline"} size="sm" onClick={() => setAutoGps(value => !value)}>
              <LocateFixed className="mr-2 h-4 w-4" /> {autoGps ? "GPS live" : "Start GPS"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="rounded-lg bg-gray-950 p-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-white/60">Delivery partner</p>
              <h1 className="text-2xl font-bold">Welcome, {user?.name}</h1>
              <p className="mt-1 text-sm text-white/70">Accept orders, update pickup status and share live GPS.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat value={activeOrders.length} label="Active" />
              <Stat value={waitingOrders.length} label="Available" />
              <Stat value="4.8" label="Rating" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Orders</h2>
              <Badge variant="outline">{orders?.length ?? 0} total</Badge>
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div>
            ) : !orders?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
                No orders assigned yet
              </div>
            ) : (
              <div className="space-y-3">
                {(orders as any[]).map((order) => (
                  <div key={order.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">#{order.orderNumber}</span>
                          <Badge className="capitalize">{order.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{order.store?.name ?? "Seller store"}</p>
                      </div>
                      <span className="font-bold">Rs.{Number(order.total).toFixed(0)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded bg-gray-50 p-2">
                        <p className="flex items-center gap-1 font-medium"><Bike className="h-4 w-4" /> Pickup</p>
                        <p className="text-xs text-muted-foreground">{order.store?.address ?? "Seller location"}</p>
                      </div>
                      <div className="rounded bg-gray-50 p-2">
                        <p className="flex items-center gap-1 font-medium"><MapPin className="h-4 w-4" /> Drop</p>
                        <p className="text-xs text-muted-foreground">{order.addressSnapshot?.line1}, {order.addressSnapshot?.city}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/track/${order.id}`}>
                        <Button variant="outline" size="sm"><Navigation className="mr-2 h-4 w-4" /> Track map</Button>
                      </Link>
                      {["confirmed", "preparing"].includes(order.status) && (
                        <>
                          <Button size="sm" onClick={() => acceptOrder(order.id)} disabled={busyOrderId === order.id}>
                            <CheckCircle className="mr-2 h-4 w-4" /> Accept
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => rejectOrder(order.id)} disabled={busyOrderId === order.id}>
                            <X className="mr-2 h-4 w-4" /> Reject
                          </Button>
                        </>
                      )}
                      {NEXT_STATUS[order.status] && (
                        <Button size="sm" onClick={() => markStatus(order)} disabled={busyOrderId === order.id}>
                          <CheckCircle className="mr-2 h-4 w-4" /> {ACTION_LABEL[order.status]}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">Live route preview</h2>
                <Button variant="outline" size="sm" onClick={updateGpsOnce} disabled={updateLocation.isPending}>
                  <LocateFixed className="mr-2 h-4 w-4" /> Ping GPS
                </Button>
              </div>
              <div className="relative h-72 overflow-hidden rounded-lg bg-emerald-50">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,185,129,.18)_1px,transparent_1px),linear-gradient(rgba(16,185,129,.18)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute left-8 top-8 rounded-full bg-white p-2 shadow"><Bike className="h-5 w-5 text-primary" /></div>
                <div className="absolute bottom-8 right-8 rounded-full bg-white p-2 shadow"><MapPin className="h-5 w-5 text-red-500" /></div>
                <div className="absolute left-16 top-16 h-40 w-52 rounded-full border-4 border-dashed border-primary/60" />
                <div className="absolute bottom-4 left-4 rounded-lg bg-white/95 p-3 text-xs shadow">
                  <p className="font-semibold">{autoGps ? "Auto GPS sharing active" : "Mock GPS ready"}</p>
                  <p className="text-muted-foreground">Customers see this movement on live tracking.</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Route className="h-4 w-4" /> Delivery checklist</h2>
              {["Accept or reject quickly", "Mark picked up at seller", "Start delivery after pickup", "Share live GPS", "Ask customer OTP before delivered"].map((item) => (
                <div key={item} className="flex items-center gap-2 border-t py-2 text-sm first:border-t-0">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg bg-white/10 px-4 py-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-white/60">{label}</p>
    </div>
  );
}
