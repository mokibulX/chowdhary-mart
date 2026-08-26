import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListVendorProductsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Package, RefreshCw, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function VendorStock() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const { data: products = [], isLoading, isFetching, refetch } = useQuery<any[]>({
    queryKey: ["/api/vendor/products", "stock"],
    queryFn: () => customFetch<any[]>("/api/vendor/products", { responseType: "json" }),
    enabled: !!user,
  });

  const valueFor = (product: any) => drafts[product.id] ?? String(Math.max(0, Number(product.stock ?? 0)));
  const saveStock = async (product: any) => {
    const stock = Number(valueFor(product));
    if (!Number.isInteger(stock) || stock < 0) {
      toast({ title: "Enter a valid stock quantity", variant: "destructive" });
      return;
    }
    setSavingId(product.id);
    try {
      await customFetch(`/api/vendor/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock }),
        responseType: "json",
      });
      setDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/products", "stock"] }),
        queryClient.invalidateQueries({ queryKey: getListVendorProductsQueryKey() }),
      ]);
      toast({ title: "Stock updated", description: `${product.name} now has ${stock} in stock.` });
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error ?? "Could not update stock. Please try again.";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-600">Inventory</p>
          <h1 className="text-2xl font-black">Stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">See and update the quantity available for every product.</p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh stock">
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StockSummary label="All products" value={products.length} />
        <StockSummary label="In stock" value={products.filter((product) => Number(product.stock) > 0).length} tone="good" />
        <StockSummary label="Out of stock" value={products.filter((product) => Number(product.stock) <= 0).length} tone="empty" />
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Product inventory</div>
        {isLoading ? (
          <div className="space-y-3 p-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div>
        ) : !products.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No products in your store yet. <Link href="/vendor/products" className="font-bold text-orange-600">Add a product</Link></div>
        ) : (
          <div className="divide-y">
            {products.map((product) => {
              const stock = Number(product.stock ?? 0);
              const changed = valueFor(product) !== String(stock);
              return (
                <div key={product.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
                      {product.images?.[0] ? <img src={product.images[0]} alt="" className="h-full w-full object-contain" /> : <Package className="h-6 w-6 text-slate-400" />}
                    </div>
                    <div className="min-w-0"><p className="truncate font-bold">{product.name}</p><p className="text-xs text-muted-foreground">{product.unit ? `${product.weight ?? ""} ${product.unit}` : "Product"}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge className={stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {stock > 0 ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
                      {stock > 0 ? "Available" : "Out of stock"}
                    </Badge>
                    <Input type="number" min="0" step="1" inputMode="numeric" className="h-10 w-28" aria-label={`Stock for ${product.name}`} value={valueFor(product)} onChange={(event) => setDrafts((current) => ({ ...current, [product.id]: event.target.value }))} />
                    <Button size="sm" onClick={() => void saveStock(product)} disabled={savingId === product.id || !changed}>
                      <Save className="mr-2 h-4 w-4" /> {savingId === product.id ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">Products with zero stock are automatically hidden from customer browsing and search. They will appear again when you add stock.</p>
    </div>
  );
}

function StockSummary({ label, value, tone }: { label: string; value: number; tone?: "good" | "empty" }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-black ${tone === "good" ? "text-emerald-700" : tone === "empty" ? "text-red-600" : ""}`}>{value}</p></div>;
}
