import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListVendorProductsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Package, RefreshCw, Save, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const LOW_STOCK_THRESHOLD = 5;

export default function VendorStock() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading, isFetching, refetch } = useQuery<any[]>({
    queryKey: ["/api/vendor/products", "stock"],
    queryFn: () => customFetch<any[]>("/api/vendor/products", { responseType: "json" }),
    enabled: !!user,
  });

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => {
        if (!query) return true;
        const barcode = product.sku ?? product.specifications?.Barcode ?? product.specifications?.EAN ?? "";
        return [product.name, barcode, product.brand?.name, product.specifications?.Brand]
          .some((value) => String(value ?? "").toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftStock = Number(left.stock ?? 0);
        const rightStock = Number(right.stock ?? 0);
        const leftPriority = leftStock <= LOW_STOCK_THRESHOLD ? 0 : 1;
        const rightPriority = rightStock <= LOW_STOCK_THRESHOLD ? 0 : 1;
        return leftPriority - rightPriority || leftStock - rightStock || String(left.name).localeCompare(String(right.name));
      });
  }, [products, search]);

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
        <StockSummary label="Low stock" value={products.filter((product) => Number(product.stock) <= LOW_STOCK_THRESHOLD).length} tone="empty" />
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Product inventory</p>
            <p className="text-xs text-muted-foreground">Low-stock items are shown first.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product or barcode"
              className="h-10 bg-white pl-9 pr-9"
              aria-label="Search product or barcode"
            />
            {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Clear product search"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div>
        ) : !products.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No products in your store yet. <Link href="/vendor/products" className="font-bold text-orange-600">Add a product</Link></div>
        ) : !visibleProducts.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No product or barcode matched “{search}”.</div>
        ) : (
          <div className="divide-y">
            {visibleProducts.map((product) => {
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
                    <Badge className={stock > LOW_STOCK_THRESHOLD ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {stock > LOW_STOCK_THRESHOLD ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
                      {stock === 0 ? "Out of stock" : stock <= LOW_STOCK_THRESHOLD ? `Low stock · ${stock}` : "Available"}
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
      <p className="text-xs text-muted-foreground">Customer listings hide products when stock reaches zero. Stock is reserved atomically when an order is placed and restored if the order is cancelled.</p>
    </div>
  );
}

function StockSummary({ label, value, tone }: { label: string; value: number; tone?: "good" | "empty" }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-black ${tone === "good" ? "text-emerald-700" : tone === "empty" ? "text-red-600" : ""}`}>{value}</p></div>;
}
