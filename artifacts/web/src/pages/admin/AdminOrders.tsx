import { useState } from "react";
import { customFetch, useListAdminOrders, getListAdminOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Clock, MapPin, Navigation, Phone, Search, ShoppingBag, Store, Trash2, Truck, UserRound, X } from "lucide-react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/error-message";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", arriving: "bg-teal-100 text-teal-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700", picked_up: "bg-indigo-100 text-indigo-700",
  returned: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", packed: "Packed",
  picked_up: "Picked Up", on_the_way: "On the Way", arriving: "Arriving", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned",
};
const ORDER_STATUSES = ["pending", "confirmed", "preparing", "packed", "picked_up", "on_the_way", "arriving", "delivered", "cancelled", "returned"];

export default function AdminOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const params = { status: filter || undefined, limit: 100 };
  const { data: orders, isLoading } = useListAdminOrders(params, {
    query: { enabled: !!user, queryKey: getListAdminOrdersQueryKey(params), refetchInterval: 2000 },
  });
  const liveOrders = (orders as any[] | undefined)?.filter((order) => !["delivered", "cancelled"].includes(order.status)) ?? [];
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const visibleOrders = (orders as any[] | undefined)?.filter((order) => {
    if (!normalizedOrderSearch) return true;
    const numericQuery = normalizedOrderSearch.replace(/\D/g, "");
    const orderNumber = String(order.orderNumber ?? "").toLowerCase();
    const orderId = String(order.id);
    return orderNumber.endsWith(normalizedOrderSearch)
      || orderId.endsWith(normalizedOrderSearch)
      || (numericQuery.length > 0 && orderNumber.replace(/\D/g, "").endsWith(numericQuery));
  }) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: getListAdminOrdersQueryKey(params) });
  const updateOrder = async (id: number, status: string) => {
    try {
      await customFetch(`/api/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: "Order updated" });
      refresh();
      return true;
    } catch (error) {
      toast({ title: "Order update failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
      return false;
    }
  };
  const deleteOrder = async (id: number) => {
    if (!confirm("Delete this order permanently?")) return;
    try {
      await customFetch(`/api/admin/orders/${id}`, { method: "DELETE" });
      toast({ title: "Order permanently deleted" });
      refresh();
      if (selectedOrder?.id === id) setSelectedOrder(null);
    } catch (error) {
      toast({ title: "Order delete failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    }
  };
  const openOrder = async (order: any) => {
    setDetailLoading(true);
    try {
      const detail = await customFetch<any>(`/api/admin/orders/${order.id}`, { responseType: "json" });
      setSelectedOrder(detail);
    } catch (error) {
      // Keep the order usable if a related optional record is unavailable.
      // The detail modal can still show the list snapshot and its actions remain available.
      setSelectedOrder(order);
      toast({ title: "Order opened", description: "Some related details could not be loaded." });
    } finally {
      setDetailLoading(false);
    }
  };
  const runDetailAction = async (action: "cancel" | "return" | "handover") => {
    if (!selectedOrder) return;
    const prompt = {
      cancel: "Cancel this order?",
      return: "Mark this order as returned?",
      handover: "Hand this delivery over to another partner?",
    }[action];
    if (!confirm(prompt)) return;
    setActionBusy(action);
    try {
      const ok = action === "handover"
        ? await customFetch(`/api/admin/orders/${selectedOrder.id}`, { method: "PATCH", body: JSON.stringify({ action }) }).then(() => true)
        : await updateOrder(selectedOrder.id, action === "return" ? "returned" : "cancelled");
      if (ok) {
        const nextStatus = action === "return" ? "returned" : action === "cancel" ? "cancelled" : "confirmed";
        setSelectedOrder((current: any) => current ? { ...current, status: nextStatus } : current);
        if (action === "handover") toast({ title: "Handover started" });
      }
    } catch (error) {
      toast({ title: "Order action failed", description: getFriendlyErrorMessage(error, "Please try again."), variant: "destructive" });
    } finally {
      setActionBusy(null);
    }
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
            {liveOrders.map((order) => (
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
                <OrderAdminControls order={order} onStatusChange={updateOrder} onDelete={deleteOrder} compact />
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

      <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value.slice(0, 4))}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="off"
            placeholder="Search by last 4 digits of order ID"
            aria-label="Search by last 4 digits of order ID"
            className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {normalizedOrderSearch ? `${visibleOrders.length} matching order${visibleOrders.length === 1 ? "" : "s"}` : "Enter the last 4 digits to find an order"}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !visibleOrders.length ? (
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
            {visibleOrders.map((order: any) => (
                <tr key={order.id} className="cursor-pointer transition-colors hover:bg-gray-50" data-testid={`order-${order.id}`} onClick={() => openOrder(order)}>
                  <td className="px-4 py-3 font-medium">
                    <button type="button" className="text-left hover:text-primary hover:underline" onClick={(event) => { event.stopPropagation(); openOrder(order); }}>
                      #{order.orderNumber}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{order.store?.name ?? `Store #${order.storeId}`}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                    <div className="max-w-[220px] truncate">{order.pickupAddress ?? order.addressSnapshot?.line1 ?? "Not set"}</div>
                    {order.pickupLatitude && order.pickupLongitude && (
                      <a className="font-semibold text-primary" href={`https://www.google.com/maps/search/?api=1&query=${order.pickupLatitude},${order.pickupLongitude}`} target="_blank" rel="noreferrer">
                        Open map
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <Badge variant="outline" className="text-xs capitalize">{order.paymentMethod}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">₹{Number(order.total).toFixed(0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <OrderAdminControls order={order} onStatusChange={updateOrder} onDelete={deleteOrder} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailLoading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="rounded-xl bg-white px-6 py-5 text-sm font-medium shadow-xl">Loading order details...</div>
        </div>
      )}
      {selectedOrder && (
        <AdminOrderDetail
          order={selectedOrder}
          actionBusy={actionBusy}
          onAction={runDetailAction}
          onDelete={deleteOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={async (id, status) => {
            const ok = await updateOrder(id, status);
            if (ok) setSelectedOrder((current: any) => current ? { ...current, status } : current);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function AdminOrderDetail({
  order,
  actionBusy,
  onAction,
  onDelete,
  onClose,
  onStatusChange,
}: {
  order: any;
  actionBusy: string | null;
  onAction: (action: "cancel" | "return" | "handover") => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => Promise<boolean>;
}) {
  const customer = order.customer;
  const seller = order.seller ?? order.store;
  const partner = order.deliveryPartner;
  const partnerUser = partner?.user;
  const location = order.address ?? {};
  const terminal = ["delivered", "cancelled", "returned"].includes(order.status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div className="mx-auto my-4 max-w-4xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order details</p>
            <h2 className="mt-1 text-xl font-bold">#{order.orderNumber}</h2>
            <Badge className={`mt-2 border-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close order details"><X className="h-5 w-5" /></Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={order.status} onValueChange={(status) => onStatusChange(order.id, status)}>
            <SelectTrigger className="h-10 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{ORDER_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status] ?? status}</SelectItem>)}</SelectContent>
          </Select>
          {!terminal && <>
            <Button variant="outline" disabled={!!actionBusy} onClick={() => onAction("cancel")}>Cancel</Button>
            <Button variant="outline" disabled={!!actionBusy} onClick={() => onAction("return")}>Return</Button>
            <Button variant="outline" disabled={!!actionBusy || !partner} onClick={() => onAction("handover")} title={!partner ? "No delivery partner is assigned" : "Reassign this delivery"}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Handover
            </Button>
          </>}
          <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(order.id)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <DetailPerson icon={<UserRound className="h-4 w-4" />} label="Customer" name={customer?.name} phone={customer?.phone} email={customer?.email} />
          <DetailPerson icon={<Store className="h-4 w-4" />} label="Seller / store" name={seller?.name} phone={seller?.phone} email={seller?.email} />
          <DetailPerson icon={<Truck className="h-4 w-4" />} label="Delivery partner" name={partnerUser?.name ?? partner?.name} phone={partnerUser?.phone} email={partnerUser?.email} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4">
            <section className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> Delivery address</h3>
              <p className="mt-2 text-sm text-muted-foreground">{location.address ?? location.line1 ?? "Address not available"}</p>
              {(location.city || location.state || location.pincode || location.postalCode) && <p className="mt-1 text-sm text-muted-foreground">{[location.city, location.state, location.pincode ?? location.postalCode].filter(Boolean).join(", ")}</p>}
              {location.latitude != null && location.longitude != null && <a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary" href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Open map</a>}
            </section>
            <section className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-primary" /> Order timeline</h3>
              <div className="mt-3 space-y-2 text-sm">{(order.tracking ?? []).length ? order.tracking.map((event: any, index: number) => <div key={`${event.id ?? index}-${event.updatedAt}`} className="border-l-2 border-primary/30 pl-3"><p className="font-medium">{STATUS_LABEL[event.status] ?? event.status}</p><p className="text-xs text-muted-foreground">{event.message ?? "Status updated"} · {event.updatedAt ? new Date(event.updatedAt).toLocaleString("en-IN") : ""}</p></div>) : <p className="text-muted-foreground">No tracking events yet.</p>}</div>
            </section>
          </div>
          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4 text-primary" /> Products</h3>
            <div className="mt-3 space-y-2">{(order.items ?? []).map((item: any) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-2"><img src={item.imageUrl} alt={item.name ?? "Product"} className="h-14 w-14 rounded-md object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /><div className="min-w-0 flex-1"><p className="font-medium">{item.name ?? item.productName ?? "Product"}</p><p className="text-xs text-muted-foreground">Qty {item.quantity ?? 1}</p></div><p className="font-semibold">₹{Number(item.totalPrice ?? item.unitPrice ?? 0).toFixed(0)}</p></div>)}</div>
            <div className="mt-4 flex justify-between border-t pt-3 font-bold"><span>Total</span><span>₹{Number(order.total ?? 0).toFixed(0)}</span></div>
          </section>
        </div>

        {order.liveTracking && (order.liveTracking.storeLocation || order.liveTracking.customerLocation || order.liveTracking.partnerLocation) && <section className="mt-4 rounded-xl border p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Navigation className="h-4 w-4 text-primary" /> Live delivery tracking</h3><LiveDeliveryMap tracking={order.liveTracking} role="admin" /></section>}
      </div>
    </div>
  );
}

function DetailPerson({ icon, label, name, phone, email }: { icon: any; label: string; name?: string | null; phone?: string | null; email?: string | null }) {
  return <section className="rounded-xl border p-4"><h3 className="flex items-center gap-2 text-sm font-semibold">{icon} {label}</h3><p className="mt-2 font-medium">{name ?? "Not assigned"}</p>{phone && <a className="mt-1 flex items-center gap-1 text-sm text-primary" href={`tel:${phone}`}><Phone className="h-3.5 w-3.5" /> {phone}</a>}{email && <p className="mt-1 truncate text-xs text-muted-foreground">{email}</p>}</section>;
}

function OrderAdminControls({
  order,
  onStatusChange,
  onDelete,
  compact = false,
}: {
  order: any;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3 flex flex-wrap items-center gap-2" : "flex flex-wrap justify-end gap-2"}>
      <Select value={order.status} onValueChange={(status) => onStatusChange(order.id, status)}>
        <SelectTrigger className={compact ? "h-9 min-w-36 flex-1 bg-white" : "h-8 w-36"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>{STATUS_LABEL[status] ?? status}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        className={`${compact ? "h-9 w-9" : "h-8 w-8"} shrink-0 text-red-600 hover:bg-red-50`}
        onClick={() => onDelete(order.id)}
        title="Delete order"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
