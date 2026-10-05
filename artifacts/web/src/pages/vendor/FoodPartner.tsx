import { useState } from "react";
import { Link } from "wouter";
import { customFetch, getListVendorOrdersQueryKey, useGetVendorDashboard, useListVendorOrders } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, ClipboardList, CookingPot, Store, Wallet, Clock3, ArrowRight, CircleCheckBig, IndianRupee, Printer, Power } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { WalletSummaryCard } from "@/components/WalletSummaryCard";
import { useToast } from "@/hooks/use-toast";

const actions = [
  { href: "/food-partner/menu", title: "Add food", detail: "Add dishes, price, photos and availability.", icon: CookingPot, action: "Add menu item" },
  { href: "/food-partner/orders", title: "Receive orders", detail: "Accept, prepare and mark orders ready for pickup.", icon: ClipboardList, action: "Open orders" },
  { href: "/food-partner/wallet", title: "Restaurant wallet", detail: "View food sales, settlements and wallet balance.", icon: Wallet, action: "View wallet" },
];

const statusStyle: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  packed: "bg-emerald-100 text-emerald-800",
};

export default function FoodPartner() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const { data: dashboard, isLoading: dashboardLoading } = useGetVendorDashboard();
  const { data: orders, isLoading: ordersLoading } = useListVendorOrders({}, { query: { queryKey: getListVendorOrdersQueryKey({}), refetchInterval: 15000, placeholderData: (previousData) => previousData } });
  const { data: store } = useQuery({ queryKey: ["/api/vendor/store"], queryFn: () => customFetch<any>("/api/vendor/store"), refetchInterval: 20000 });
  const activeOrders = ((orders as any[]) ?? []).filter((order) => ["pending", "confirmed", "preparing", "packed"].includes(order.status));
  const waitingOrders = activeOrders.filter((order) => order.status === "pending");
  const preparingOrders = activeOrders.filter((order) => ["confirmed", "preparing"].includes(order.status));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/vendor/store"] });
    qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey({}) });
  };
  const updateRestaurant = async (payload: Record<string, boolean>) => {
    setSaving(true);
    try {
      await customFetch("/api/vendor/store", { method: "PATCH", body: JSON.stringify(payload) });
      refresh();
      toast({ title: payload.isOpen === false ? "Restaurant is offline" : payload.isOpen ? "Restaurant is online" : payload.autoAcceptOrders ? "Auto-receive is on" : "Auto-receive is off" });
    } catch (error) {
      toast({ title: "Restaurant setting could not be saved", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const acceptOrder = async (orderId: number) => {
    try {
      await customFetch(`/api/vendor/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
      qc.invalidateQueries({ queryKey: getListVendorOrdersQueryKey({}) });
      toast({ title: "Order accepted", description: "Kitchen preparation can begin." });
    } catch (error) {
      toast({ title: "Order could not be accepted", description: (error as Error).message, variant: "destructive" });
    }
  };
  const printSlip = (order: any) => {
    const popup = window.open("", "_blank", "width=420,height=640");
    if (!popup) { toast({ title: "Popup blocked", description: "Allow popups to print the kitchen slip.", variant: "destructive" }); return; }
    const items = (order.items ?? []).map((item: any) => `<li>${item.quantity ?? item.qty} x ${String(item.productName ?? item.name ?? "Item").replace(/[<>&]/g, "")}</li>`).join("");
    popup.document.write(`<html><head><title>Kitchen slip ${order.orderNumber}</title><style>body{font:14px Arial;padding:18px}h1{font-size:20px;margin:0 0 8px}ul{padding-left:20px}hr{border:0;border-top:1px dashed #555;margin:14px 0}</style></head><body><h1>KITCHEN SLIP</h1><b>Order #${order.orderNumber}</b><p>${new Date(order.createdAt).toLocaleString("en-IN")}</p><hr><ul>${items}</ul><hr><b>Total: Rs.${Number(order.total ?? 0).toFixed(0)}</b></body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 200);
  };

  return <div className="mx-auto max-w-6xl space-y-5">
    <section className="flex flex-col gap-4 rounded-lg border border-orange-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><ChefHat className="h-4 w-4" /> FOOD PARTNER</div>
        <h1 className="mt-1 text-2xl font-bold">Restaurant dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your menu, incoming orders and restaurant earnings.</p>
      </div>
      <Link href="/food-partner/orders" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90">Open incoming orders</Link>
    </section>

    <section className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
      <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${store?.isOpen ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center gap-3"><Power className={`h-5 w-5 ${store?.isOpen ? "text-emerald-600" : "text-slate-500"}`} /><div><p className="font-semibold">Restaurant is {store?.isOpen ? "online" : "offline"}</p><p className="text-xs text-muted-foreground">Only online restaurants receive customer orders.</p></div></div>
        <Switch checked={Boolean(store?.isOpen)} disabled={saving || !store} onCheckedChange={(checked) => void updateRestaurant({ isOpen: checked })} aria-label="Restaurant online status" />
      </div>
      <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${store?.autoAcceptOrders ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center gap-3"><ChefHat className={`h-5 w-5 ${store?.autoAcceptOrders ? "text-orange-600" : "text-slate-500"}`} /><div><p className="font-semibold">Auto-receive orders</p><p className="text-xs text-muted-foreground">New orders are accepted automatically when you are online.</p></div></div>
        <Switch checked={Boolean(store?.autoAcceptOrders)} disabled={saving || !store?.isOpen} onCheckedChange={(checked) => void updateRestaurant({ autoAcceptOrders: checked })} aria-label="Auto-receive food orders" />
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <Card className="border-amber-200 bg-amber-50"><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-8 w-8 text-amber-600" /><div><p className="text-sm text-amber-800">New orders</p><p className="text-2xl font-bold">{ordersLoading ? "-" : waitingOrders.length}</p></div></CardContent></Card>
      <Card className="border-orange-200 bg-orange-50"><CardContent className="flex items-center gap-3 p-4"><CookingPot className="h-8 w-8 text-orange-600" /><div><p className="text-sm text-orange-800">In kitchen</p><p className="text-2xl font-bold">{ordersLoading ? "-" : preparingOrders.length}</p></div></CardContent></Card>
      <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex items-center gap-3 p-4"><IndianRupee className="h-8 w-8 text-emerald-600" /><div><p className="text-sm text-emerald-800">Today&apos;s earnings</p><p className="text-2xl font-bold">Rs.{dashboardLoading ? "-" : Number((dashboard as any)?.dayRevenue ?? 0).toFixed(0)}</p></div></CardContent></Card>
    </section>

    <WalletSummaryCard href="/food-partner/wallet" title="Restaurant wallet" tone="dark" />

    <section className="grid gap-4 md:grid-cols-3">
      {actions.map(({ href, title, detail, icon: Icon, action }) => <Link key={href} href={href}>
        <Card className="h-full border transition-shadow hover:shadow-md"><CardContent className="p-5"><Icon className="h-7 w-7 text-primary" /><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p><span className="mt-4 inline-flex items-center text-sm font-semibold text-primary">{action}<ArrowRight className="ml-1 h-4 w-4" /></span></CardContent></Card>
      </Link>)}
    </section>

    <section className="rounded-lg border bg-white">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-bold">Live order queue</h2><p className="mt-0.5 text-sm text-muted-foreground">Accept new orders quickly and keep the kitchen moving.</p></div><Link href="/food-partner/orders" className="text-sm font-semibold text-primary hover:underline">See all</Link></div>
      <div className="divide-y">
        {ordersLoading ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}</div> : activeOrders.length === 0 ? <div className="p-8 text-center"><CircleCheckBig className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-3 font-semibold">No active food orders</p><p className="mt-1 text-sm text-muted-foreground">New restaurant orders will appear here immediately.</p></div> : activeOrders.slice(0, 5).map((order: any) => <div key={order.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold">#{order.orderNumber}</p><Badge className={`border-0 capitalize ${statusStyle[order.status] ?? "bg-slate-100 text-slate-700"}`}>{String(order.status).replace(/_/g, " ")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{(order.items ?? []).map((item: any) => `${item.quantity ?? item.qty}x ${item.productName ?? item.name}`).join(", ") || "Order items"}</p></div><span className="font-bold">Rs.{Number(order.total ?? 0).toFixed(0)}</span></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => printSlip(order)}><Printer className="mr-2 h-4 w-4" />Print slip</Button>{order.status === "pending" && <Button size="sm" onClick={() => void acceptOrder(order.id)}>Accept order</Button>}<Link href="/food-partner/orders"><Button size="sm" variant="ghost">Order details</Button></Link></div></div>)}
      </div>
    </section>
  </div>;
}
