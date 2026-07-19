import { useState } from "react";
import { customFetch, useListAdminOrders, getListAdminOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Navigation, ShoppingBag, Trash2 } from "lucide-react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", arriving: "bg-teal-100 text-teal-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700", picked_up: "bg-indigo-100 text-indigo-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", packed: "Packed",
  picked_up: "Picked Up", on_the_way: "On the Way", arriving: "Arriving", delivered: "Delivered", cancelled: "Cancelled",
};

export default function AdminOrders() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");

  const params = { status: filter || undefined, limit: 100 };
  const { data: orders, isLoading } = useListAdminOrders(params, {
    query: { enabled: !!user, queryKey: getListAdminOrdersQueryKey(params), refetchInterval: 5000 },
  });
  const liveOrders = (orders as any[] | undefined)?.filter((order) => !["delivered", "cancelled"].includes(order.status)) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: getListAdminOrdersQueryKey(params) });
  const updateOrder = async (id: number, status: string) => {
    await customFetch(`/api/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    refresh();
  };
  const deleteOrder = async (id: number) => {
    if (!confirm("Delete this order?")) return;
    await customFetch(`/api/admin/orders/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">All Orders ({orders?.length ?? 0})</h1>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Navigation className="h-5 w-5 text-primary" /> Live delivery monitor</h2>
            <p className="text-sm text-muted-foreground">Track customer location, pickup hub and delivery partner movement.</p>
          </div>
          <Badge variant="outline">{liveOrders.length} live</Badge>
        </div>
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : liveOrders.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {liveOrders.slice(0, 4).map((order) => (
              <div key={order.id} className="rounded-xl border bg-gray-50 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">#{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{order.store?.name ?? `Store #${order.storeId}`}</p>
                  </div>
                  <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                </div>
                <LiveDeliveryMap tracking={order.liveTracking ?? order.tracking} compact role="admin" />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> ETA {order.liveTracking?.estimatedMins ?? order.estimatedDeliveryMins ?? 40} min</span>
                  <span>{order.liveTracking?.distanceKm ?? "3.2"} km away</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No active deliveries right now.
          </div>
        )}
      </section>

      <div className="flex gap-2 flex-wrap">
        {["", "pending", "confirmed", "packed", "picked_up", "on_the_way", "delivered", "cancelled"].map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="whitespace-nowrap"
            data-testid={`filter-${f || "all"}`}
          >
            {f ? STATUS_LABEL[f] : "All"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !orders?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No orders found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Order</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Store</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Pickup Location</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Payment</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(orders as any[]).map((order: any) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors" data-testid={`order-${order.id}`}>
                  <td className="px-4 py-3 font-medium">#{order.orderNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{order.store?.name ?? `Store #${order.storeId}`}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="max-w-[220px] truncate">{order.pickupAddress ?? order.addressSnapshot?.line1 ?? "Not set"}</div>
                    {order.pickupLatitude && order.pickupLongitude && (
                      <a className="font-semibold text-primary" href={`https://www.google.com/maps/search/?api=1&query=${order.pickupLatitude},${order.pickupLongitude}`} target="_blank" rel="noreferrer">
                        Open map
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">₹{Number(order.total).toFixed(0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => updateOrder(order.id, order.status === "cancelled" ? "pending" : "cancelled")}>
                        {order.status === "cancelled" ? "Reopen" : "Cancel"}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => deleteOrder(order.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
