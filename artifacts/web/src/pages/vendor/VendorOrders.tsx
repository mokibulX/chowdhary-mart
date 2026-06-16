import { useState } from "react";
import { useListVendorOrders, useUpdateOrderStatus, getListVendorOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package } from "lucide-react";

const ALL_STATUSES = ["pending", "confirmed", "preparing", "packed", "picked_up", "on_the_way", "delivered", "cancelled"];
const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed", confirmed: "preparing", preparing: "packed",
  packed: "picked_up", picked_up: "on_the_way", on_the_way: "delivered",
};
const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700", picked_up: "bg-indigo-100 text-indigo-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", packed: "Packed",
  picked_up: "Picked Up", on_the_way: "On the Way", delivered: "Delivered", cancelled: "Cancelled",
};
const NEXT_LABEL: Record<string, string> = {
  pending: "Confirm", confirmed: "Start Preparing", preparing: "Mark Packed",
  packed: "Mark Picked Up", picked_up: "On the Way", on_the_way: "Mark Delivered",
};

export default function VendorOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const params = filter !== "all" ? { status: filter } : {};
  const { data: orders, isLoading } = useListVendorOrders(params, {
    query: { enabled: !!user, queryKey: getListVendorOrdersQueryKey(params) },
  });
  const updateStatus = useUpdateOrderStatus();

  const handleUpdate = (orderId: number, status: string) => {
    updateStatus.mutate(
      { orderId, data: { status } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey({}) });
          qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey(params) });
          toast({ title: `Order updated to ${STATUS_LABEL[status] ?? status}` });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex gap-2 overflow-x-auto">
          {["all", "pending", "confirmed", "preparing", "delivered", "cancelled"].map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="whitespace-nowrap"
              data-testid={`filter-${f}`}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !orders?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No orders {filter !== "all" ? `with status "${STATUS_LABEL[filter]}"` : "yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(orders as any[]).map((order: any) => {
            const nextStatus = NEXT_STATUS[order.status];
            return (
              <div key={order.id} className="bg-white border rounded-xl p-4" data-testid={`order-${order.id}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">#{order.orderNumber}</span>
                      <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="font-bold text-lg">₹{Number(order.total).toFixed(0)}</span>
                </div>
                {order.addressSnapshot && (
                  <p className="text-xs text-muted-foreground mb-3 bg-gray-50 rounded px-2 py-1">
                    Deliver to: {(order.addressSnapshot as any).name} · {(order.addressSnapshot as any).line1}, {(order.addressSnapshot as any).city}
                  </p>
                )}
                {nextStatus && !["delivered", "cancelled"].includes(order.status) && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(order.id, nextStatus)}
                    disabled={updateStatus.isPending}
                    className="w-full"
                    data-testid={`btn-next-${order.id}`}
                  >
                    {NEXT_LABEL[order.status] ?? `Mark ${STATUS_LABEL[nextStatus]}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
