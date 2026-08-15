import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  preparing: "bg-orange-100 text-orange-700 border-orange-200",
  packed: "bg-purple-100 text-purple-700 border-purple-200",
  picked_up: "bg-indigo-100 text-indigo-700 border-indigo-200",
  on_the_way: "bg-cyan-100 text-cyan-700 border-cyan-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", packed: "Packed",
  picked_up: "Picked Up", on_the_way: "On the Way", delivered: "Delivered", cancelled: "Cancelled",
};

const FILTERS = ["all", "confirmed", "preparing", "on_the_way", "delivered", "cancelled"];

export default function Orders() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");

  const params = filter !== "all" ? { status: filter } : {};
  const { data: orders, isLoading } = useListOrders(params, {
    query: { enabled: !!user, queryKey: getListOrdersQueryKey(params), refetchInterval: 5000 },
  });

  if (!user) {
    return (
      <div className="text-center py-16">
        <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p>Please <Link href="/login" className="text-primary underline">sign in</Link> to view orders</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden pb-6 sm:space-y-5">
      <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">My Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track current orders, delivery progress and past purchases.</p>
      </div>

      {/* Filter tabs */}
      <div className="-mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          {FILTERS.map(f => {
            const active = filter === f;
            return (
              <Button
                key={f}
                variant={active ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilter(f)}
                className={`h-10 flex-none whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all ${
                  active ? "bg-primary text-white shadow-sm hover:bg-primary/90" : "text-gray-700 hover:bg-orange-50 hover:text-primary"
                }`}
                data-testid={`filter-${f}`}
              >
                {f === "all" ? "All Orders" : STATUS_LABELS[f] ?? f}
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : !orders?.length ? (
        <div className="rounded-2xl border bg-white px-4 py-16 text-center shadow-sm">
          <Package className="w-14 h-14 mx-auto text-muted-foreground opacity-40" />
          <p className="mt-3 font-medium text-muted-foreground">No orders yet</p>
          <Link href="/search"><Button className="mt-3 rounded-xl">Start Shopping</Button></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5" data-testid={`order-${order.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">#{order.orderNumber}</span>
                      <Badge className={`text-xs border ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`} variant="outline">
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{order.store?.name ?? "Chowdhary Mart"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold">Rs.{Number(order.total).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{order.paymentMethod?.toUpperCase()}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
