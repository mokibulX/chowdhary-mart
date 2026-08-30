import { useState } from "react";
import { customFetch, getGetVendorStoreQueryKey, getListDeliveryOrdersQueryKey, getListProductsQueryKey, getListVendorOrdersQueryKey, useGetVendorStore, useListDeliveryOrders, useListProducts, useListVendorOrders, useUpdateOrderStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Clock3, MapPin, PackageSearch, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const statusLabel = (status: unknown) => String(status ?? "pending").replace(/_/g, " ");

export default function FindOrder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [finderActive, setFinderActive] = useState(() => new URLSearchParams(window.location.search).get("active") === "1");
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const role = String(user?.role ?? "").toLowerCase();
  const isVendor = role === "vendor" || role === "seller";
  const { data: vendorStore } = useGetVendorStore({
    query: { enabled: !!user && isVendor, queryKey: getGetVendorStoreQueryKey() },
  });
  const isFinderActive = isVendor && vendorStore ? vendorStore.isOpen !== false : finderActive;
  const productParams = { limit: 8, sort: "newest" as const };

  const { data: vendorOrders, isLoading: vendorLoading } = useListVendorOrders({}, { query: { enabled: !!user && isVendor && isFinderActive, queryKey: getListVendorOrdersQueryKey({}), refetchInterval: isFinderActive ? 2000 : false } });
  const { data: deliveryOrders, isLoading: deliveryLoading } = useListDeliveryOrders({ query: { enabled: !!user && !isVendor && isFinderActive, queryKey: getListDeliveryOrdersQueryKey(), refetchInterval: isFinderActive ? 2000 : false } });
  const { data: products, isLoading: productsLoading } = useListProducts(productParams, { query: { queryKey: getListProductsQueryKey(productParams) } });
  const orders = (isVendor ? vendorOrders : deliveryOrders) as any[] | undefined;
  const ordersLoading = isVendor ? vendorLoading : deliveryLoading;
  const updateStatus = useUpdateOrderStatus();

  const acceptOrder = async (order: any) => {
    const orderId = Number(order.id);
    if (!Number.isFinite(orderId) || busyOrderId !== null) return;
    setBusyOrderId(orderId);
    try {
      if (isVendor) {
        await updateStatus.mutateAsync({ orderId, data: { status: "confirmed" } });
        await queryClient.invalidateQueries({ queryKey: getListVendorOrdersQueryKey({}) });
      } else {
        const accepted = await customFetch<any>(`/api/delivery/orders/${orderId}/accept`, { method: "POST", responseType: "json" });
        queryClient.setQueryData<any[]>(getListDeliveryOrdersQueryKey(), (current = []) => current.map((item) => Number(item.id) === orderId ? { ...item, ...accepted, status: accepted?.status ?? "confirmed" } : item));
        await queryClient.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });
      }
      toast({ title: "Order accepted", description: `Order #${order.orderNumber ?? orderId} is now assigned to you.` });
    } catch (error: any) {
      toast({ title: "Order could not be accepted", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const toggleFinder = async () => {
    const nextActive = !isFinderActive;
    if (isVendor) {
      try {
        await customFetch("/api/vendor/store", {
          method: "PATCH",
          body: JSON.stringify({ isOpen: nextActive }),
        });
        setFinderActive(nextActive);
        await queryClient.invalidateQueries({ queryKey: getGetVendorStoreQueryKey() });
        toast({ title: nextActive ? "Store activated" : "Store deactivated", description: nextActive ? "You can now receive seller orders." : "Seller orders are paused." });
      } catch (error: any) {
        toast({ title: "Status update failed", description: error?.message || "Please try again.", variant: "destructive" });
      }
      return;
    }
    setFinderActive(nextActive);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-2xl border bg-slate-950 px-5 py-8 text-white shadow-sm sm:px-8 sm:py-10">
        <div className="relative flex flex-col items-center text-center">
          <div className={`relative mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-orange-300/30 bg-white/5 ${isFinderActive ? "" : "opacity-70"}`}>
            <span className={`absolute inset-1 rounded-full border-2 border-transparent border-r-orange-400 border-t-orange-300 ${isFinderActive ? "motion-safe:animate-spin [animation-duration:2.8s]" : ""}`} />
            <span className={`absolute inset-4 rounded-full border-2 border-transparent border-b-emerald-300 border-l-emerald-200 ${isFinderActive ? "motion-safe:animate-spin [animation-direction:reverse] [animation-duration:2s]" : ""}`} />
            <span className={`absolute h-3 w-3 rounded-full bg-orange-400 ${isFinderActive ? "animate-pulse shadow-[0_0_24px_8px_rgba(251,146,60,0.35)]" : ""}`} />
            <PackageSearch className="relative h-8 w-8 text-white" />
          </div>
          <Badge className={`mb-3 border-emerald-300/30 ${isFinderActive ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/70"}`}><span className={`mr-2 h-2 w-2 rounded-full ${isFinderActive ? "animate-pulse bg-emerald-300" : "bg-slate-400"}`} />{isFinderActive ? "Live order find" : "Order finder paused"}</Badge>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Live order finder</h1>
          <p className="mt-2 max-w-md text-sm text-white/65">Stay active to receive and accept {isVendor ? "seller" : "delivery partner"} orders instantly.</p>
          <Button type="button" onClick={() => void toggleFinder()} className={`mt-6 h-12 px-8 font-bold text-white ${isFinderActive ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}`}><Zap className="mr-2 h-4 w-4" />{isFinderActive ? "Deactivate" : "Activate"}</Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><PackageSearch className="h-5 w-5 text-orange-500" /><h2 className="text-lg font-bold">Incoming orders</h2></div><p className="mt-1 text-sm text-muted-foreground">{isFinderActive ? "Listening for new orders now." : "Activate the finder to receive orders."}</p></div><Badge variant="outline">{isFinderActive ? `${orders?.length ?? 0} found` : "Inactive"}</Badge></div>
        {!isFinderActive ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Zap className="mx-auto mb-2 h-6 w-6" />Activate order finder to start receiving orders.</div> : ordersLoading ? <Skeleton className="h-28 w-full rounded-xl" /> : orders?.length ? <div className="space-y-3">{orders.map((order) => { const canAccept = isVendor ? order.status === "pending" : ["pending", "confirmed"].includes(order.status) && !order.liveTracking?.lifecycle?.assignedDeliveryPartnerId; return <div key={order.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600"><PackageSearch className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">#{order.orderNumber ?? order.id}</p><Badge variant="outline" className="capitalize">{statusLabel(order.status)}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{order.store?.name ?? "Chowdhary Mart"} · Rs.{Number(order.total ?? 0).toFixed(0)}</p></div>{canAccept ? <Button size="sm" onClick={() => void acceptOrder(order)} disabled={busyOrderId !== null}>{busyOrderId === Number(order.id) ? "Accepting..." : "Accept order"}</Button> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}</div>; })}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-2 h-6 w-6 opacity-50" />Waiting for the next order.</div>}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-end justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-500" /><h2 className="text-lg font-bold">Latest products</h2></div><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Fresh stock near the marketplace</p></div><Link href="/search" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="h-4 w-4" /></Link></div>
        {productsLoading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-xl" />)}</div> : products?.items?.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">{products.items.map((product: any) => <ProductCard key={product.id} product={product} compact />)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">New products will appear here as sellers add stock.</div>}
      </section>
    </div>
  );
}
