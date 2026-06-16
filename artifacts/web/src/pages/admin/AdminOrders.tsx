import { useState } from "react";
import { useListAdminOrders, getListAdminOrdersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag } from "lucide-react";

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

export default function AdminOrders() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("");

  const params = { status: filter || undefined, limit: 100 };
  const { data: orders, isLoading } = useListAdminOrders(params, {
    query: { enabled: !!user, queryKey: getListAdminOrdersQueryKey(params) },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">All Orders ({orders?.length ?? 0})</h1>

      <div className="flex gap-2 flex-wrap">
        {["", "pending", "confirmed", "preparing", "on_the_way", "delivered", "cancelled"].map(f => (
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
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Order</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Store</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Payment</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Date</th>
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
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">₹{Number(order.total).toFixed(0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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
