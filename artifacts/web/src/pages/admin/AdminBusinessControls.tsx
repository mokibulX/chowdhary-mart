import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Bus, ChefHat, Eye, EyeOff, ShoppingBag, Store } from "lucide-react";

type Surface = "shopping" | "food" | "travel";

const SECTIONS: Record<Surface, { label: string; role: string; icon: typeof ShoppingBag; copy: string; itemLabel: string }> = {
  shopping: { label: "Shopping", role: "vendor", icon: ShoppingBag, copy: "Local shops and their shopping products.", itemLabel: "Products" },
  food: { label: "Food", role: "food_partner", icon: ChefHat, copy: "Restaurants, cafes and their food menus.", itemLabel: "Menu items" },
  travel: { label: "Travel", role: "travel_agency", icon: Bus, copy: "Travel agencies and their bus, cab and tour services.", itemLabel: "Services" },
};

export default function AdminBusinessControls() {
  const [surface, setSurface] = useState<Surface>("shopping");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stores = [], isLoading: storesLoading } = useQuery({ queryKey: ["/api/admin/stores"], queryFn: () => customFetch<any[]>("/api/admin/stores", { responseType: "json" }) });
  const { data: products = [], isLoading: productsLoading } = useQuery({ queryKey: ["/api/admin/products"], queryFn: () => customFetch<any[]>("/api/admin/products", { responseType: "json" }) });
  const config = SECTIONS[surface];
  const selectedStores = useMemo(() => stores.filter((store) => String(store.partnerRole) === config.role), [config.role, stores]);
  const storeIds = useMemo(() => new Set(selectedStores.map((store) => Number(store.id))), [selectedStores]);
  const selectedProducts = useMemo(() => products.filter((product) => storeIds.has(Number(product.storeId))), [products, storeIds]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
    qc.invalidateQueries({ queryKey: ["/api/products"] });
  };
  const toggleStore = async (store: any) => {
    try {
      await customFetch(`/api/admin/stores/${store.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !store.isActive, isOpen: !store.isOpen }), responseType: "json" });
      refresh();
      toast({ title: store.isActive ? `${config.label} partner hidden` : `${config.label} partner live` });
    } catch (error: any) { toast({ title: "Update failed", description: error?.data?.error ?? "Please try again.", variant: "destructive" }); }
  };
  const saveOrder = async (store: any) => {
    const field = document.querySelector<HTMLInputElement>(`[data-display-order="${store.id}"]`);
    try {
      await customFetch(`/api/admin/stores/${store.id}`, { method: "PATCH", body: JSON.stringify({ displayOrder: Number(field?.value ?? store.displayOrder ?? 0) }), responseType: "json" });
      refresh();
      toast({ title: "Display order saved" });
    } catch (error: any) { toast({ title: "Could not save order", description: error?.data?.error ?? "Please try again.", variant: "destructive" }); }
  };
  const toggleItem = async (product: any) => {
    try {
      await customFetch(`/api/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !product.isAvailable }), responseType: "json" });
      refresh();
      toast({ title: product.isAvailable ? `${config.itemLabel.slice(0, -1)} hidden` : `${config.itemLabel.slice(0, -1)} visible` });
    } catch (error: any) { toast({ title: "Update failed", description: error?.data?.error ?? "Please try again.", variant: "destructive" }); }
  };

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Business Controls</h1><p className="text-sm text-muted-foreground">Manage Shopping, Food and Travel independently. Visibility and order apply only to the selected section.</p></div>
    <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(SECTIONS) as Surface[]).map((key) => { const item = SECTIONS[key]; const Icon = item.icon; return <button key={key} type="button" onClick={() => setSurface(key)} className={`flex items-center gap-3 rounded-lg border p-4 text-left ${surface === key ? "border-primary bg-primary text-white" : "bg-white hover:border-primary/40"}`}><Icon className="h-5 w-5" /><span><span className="block font-bold">{item.label}</span><span className={`block text-xs ${surface === key ? "text-white/80" : "text-muted-foreground"}`}>{item.copy}</span></span></button>; })}</div>
    <section className="grid gap-3 sm:grid-cols-3"><Metric label={`${config.label} partners`} value={selectedStores.length} /><Metric label={config.itemLabel} value={selectedProducts.length} /><Metric label="Live items" value={selectedProducts.filter((item) => item.isAvailable).length} /></section>
    {storesLoading || productsLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-44" />)}</div> : <>
      <section><h2 className="mb-3 text-lg font-bold">{config.label} partners</h2>{selectedStores.length ? <div className="grid gap-4 md:grid-cols-2">{selectedStores.map((store) => <div key={store.id} className="rounded-lg border bg-white p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100"><Store className="h-5 w-5 text-slate-500" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{store.name}</h3><Badge className={store.isActive && store.isOpen ? "bg-emerald-600" : "bg-slate-500"}>{store.isActive && store.isOpen ? "Live" : "Hidden"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{store.address || store.city || "Location not added"}</p></div></div><div className="mt-4 flex items-center gap-2"><Input data-display-order={store.id} type="number" min="0" defaultValue={Number(store.displayOrder ?? 0)} placeholder="Display order" /><Button size="sm" variant="outline" onClick={() => void saveOrder(store)}>Save order</Button><Button size="sm" variant={store.isActive ? "outline" : "default"} onClick={() => void toggleStore(store)}>{store.isActive ? <><EyeOff className="mr-1 h-4 w-4" />Hide</> : <><Eye className="mr-1 h-4 w-4" />Show</>}</Button></div></div>)}</div> : <Empty label={`No ${config.label.toLowerCase()} partner yet.`} />}</section>
      <section><h2 className="mb-3 text-lg font-bold">{config.itemLabel}</h2>{selectedProducts.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selectedProducts.map((product) => <div key={product.id} className="flex gap-3 rounded-lg border bg-white p-3"><div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">{product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="line-clamp-1 font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.store?.name ?? "Partner"} · Rs.{Number(product.price).toFixed(0)}</p><Button size="sm" variant="ghost" className={product.isAvailable ? "mt-1 h-7 px-1 text-red-600" : "mt-1 h-7 px-1 text-emerald-700"} onClick={() => void toggleItem(product)}>{product.isAvailable ? "Hide item" : "Show item"}</Button></div></div>)}</div> : <Empty label={`No ${config.itemLabel.toLowerCase()} in this section.`} />}</section>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-white p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
function Empty({ label }: { label: string }) { return <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">{label}</div>; }
