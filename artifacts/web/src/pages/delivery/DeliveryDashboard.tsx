import {
  useListDeliveryOrders,
  useToggleDeliveryOnline,
  useUpdateDeliveryLocation,
  useUpdateOrderStatus,
  getListDeliveryOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, CheckCircle, Clock, LocateFixed, MapPin, Navigation, Package, Power, Route } from "lucide-react";

const NEXT_STATUS: Record<string, string> = {
  packed: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "delivered",
};

const ACTION_LABEL: Record<string, string> = {
  packed: "Pick up order",
  picked_up: "Start delivery",
  on_the_way: "Mark delivered",
};

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: orders, isLoading } = useListDeliveryOrders({
    query: { enabled: !!user, queryKey: getListDeliveryOrdersQueryKey(), refetchInterval: 12000 },
  });
  const toggleOnline = useToggleDeliveryOnline();
  const updateLocation = useUpdateDeliveryLocation();
  const updateStatus = useUpdateOrderStatus();

  const activeOrders = (orders ?? []).filter((order: any) => ["packed", "picked_up", "on_the_way"].includes(order.status));
  const waitingOrders = (orders ?? []).filter((order: any) => !["packed", "picked_up", "on_the_way"].includes(order.status));

  const refresh = () => qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });

  const handleLocation = () => {
    const lat = 22.5726 + Math.random() / 100;
    const lng = 88.3639 + Math.random() / 100;
    updateLocation.mutate(
      { data: { lat, lng } },
      { onSuccess: () => toast({ title: "Location updated", description: "Live location moved on active orders." }) },
    );
  };

  const handleNext = (order: any) => {
    const status = NEXT_STATUS[order.status] ?? "picked_up";
    updateStatus.mutate(
      { orderId: order.id, data: { status } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: "Delivery updated", description: `Order ${order.orderNumber} is now ${status.replace(/_/g, " ")}.` });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-primary">Chowdhary Mart</Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleOnline.mutate(undefined, { onSuccess: () => toast({ title: "Status changed" }) })}>
              <Power className="mr-2 h-4 w-4" /> Online
            </Button>
            <Button size="sm" onClick={handleLocation} disabled={updateLocation.isPending}>
              <LocateFixed className="mr-2 h-4 w-4" /> Update location
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
              <p className="mt-1 text-sm text-white/70">Pickup, route and delivery actions in one panel.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-white/10 px-4 py-3">
                <p className="text-2xl font-bold">{activeOrders.length}</p>
                <p className="text-xs text-white/60">Active</p>
              </div>
              <div className="rounded-lg bg-white/10 px-4 py-3">
                <p className="text-2xl font-bold">{waitingOrders.length}</p>
                <p className="text-xs text-white/60">Waiting</p>
              </div>
              <div className="rounded-lg bg-white/10 px-4 py-3">
                <p className="text-2xl font-bold">4.8</p>
                <p className="text-xs text-white/60">Rating</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Assigned orders</h2>
              <Badge variant="outline">{orders?.length ?? 0} total</Badge>
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
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
                      <span className="font-bold">Rs {Number(order.total).toFixed(0)}</span>
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
                      {NEXT_STATUS[order.status] && (
                        <Button size="sm" onClick={() => handleNext(order)} disabled={updateStatus.isPending}>
                          <CheckCircle className="mr-2 h-4 w-4" /> {ACTION_LABEL[order.status]}
                        </Button>
                      )}
                      {!NEXT_STATUS[order.status] && (
                        <Button variant="secondary" size="sm" disabled>
                          <Clock className="mr-2 h-4 w-4" /> Waiting for seller packing
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
              <h2 className="mb-3 font-bold">Live route preview</h2>
              <div className="relative h-72 overflow-hidden rounded-lg bg-emerald-50">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,185,129,.18)_1px,transparent_1px),linear-gradient(rgba(16,185,129,.18)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute left-8 top-8 rounded-full bg-white p-2 shadow"><Bike className="h-5 w-5 text-primary" /></div>
                <div className="absolute bottom-8 right-8 rounded-full bg-white p-2 shadow"><MapPin className="h-5 w-5 text-red-500" /></div>
                <div className="absolute left-16 top-16 h-40 w-52 rounded-full border-4 border-dashed border-primary/60" />
                <div className="absolute bottom-4 left-4 rounded-lg bg-white/95 p-3 text-xs shadow">
                  <p className="font-semibold">Mock GPS active</p>
                  <p className="text-muted-foreground">Use Update location to move the live tracking point.</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Route className="h-4 w-4" /> Delivery checklist</h2>
              {["Verify pickup code", "Check package count", "Update live location", "Collect payment if COD", "Mark delivered after handoff"].map((item) => (
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
