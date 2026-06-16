import { useParams } from "wouter";
import { useGetStore, useListProducts, getGetStoreQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Star, Truck, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Store() {
  const { storeId } = useParams<{ storeId: string }>();
  const id = Number(storeId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();

  const { data: store, isLoading: loadingStore } = useGetStore(id, {
    query: { enabled: !!id, queryKey: getGetStoreQueryKey(id) },
  });

  const params = { storeId: id, categoryId: selectedCategoryId, limit: 60 };
  const { data: productsData, isLoading: loadingProducts } = useListProducts(params, {
    query: { enabled: !!id, queryKey: getListProductsQueryKey(params) },
  });

  const products = productsData?.items ?? [];

  // Group by category
  const categoryMap = new Map<string, typeof products>();
  products.forEach(p => {
    const catName = (p as any).categoryName || "Other";
    const existing = categoryMap.get(catName) ?? [];
    existing.push(p);
    categoryMap.set(catName, existing);
  });
  const grouped = Array.from(categoryMap.entries());

  if (loadingStore) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-20" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!store) {
    return <div className="text-center py-16 text-muted-foreground">Store not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Store banner */}
      <div className="relative h-44 md:h-56 rounded-2xl overflow-hidden bg-gray-100">
        {store.bannerUrl && (
          <img src={store.bannerUrl} alt={store.name} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-4">
          {store.logoUrl && (
            <img src={store.logoUrl} alt={store.name} className="w-16 h-16 rounded-xl border-2 border-white shadow-lg flex-shrink-0 bg-white" />
          )}
          <div className="text-white">
            <h1 className="text-xl md:text-2xl font-bold">{store.name}</h1>
            {store.address && <p className="text-sm opacity-90">{store.address}, {store.city}</p>}
          </div>
        </div>
      </div>

      {/* Store meta */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-amber-600 font-medium">
          <Star className="w-4 h-4 fill-amber-400 stroke-amber-500" />
          {store.rating || "New"} ({store.ratingCount || 0} ratings)
        </div>
        {store.estimatedDeliveryMins && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4" />
            {store.estimatedDeliveryMins} mins delivery
          </div>
        )}
        {store.deliveryFee && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Truck className="w-4 h-4" />
            ₹{store.deliveryFee} delivery fee
            {store.freeDeliveryAbove && <span className="text-green-600 font-medium ml-1">(Free above ₹{store.freeDeliveryAbove})</span>}
          </div>
        )}
        <Badge variant={store.isOpen ? "default" : "secondary"} className={store.isOpen ? "bg-green-500" : ""}>
          {store.isOpen ? "Open now" : "Closed"}
        </Badge>
      </div>

      {/* Products */}
      {loadingProducts ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No products available</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.length > 1 ? (
            grouped.map(([catName, items]) => (
              <section key={catName}>
                <h2 className="text-lg font-bold mb-3 pb-1 border-b">{catName}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {items.map(product => <ProductCard key={product.id} product={product} />)}
                </div>
              </section>
            ))
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {products.map(product => <ProductCard key={product.id} product={product} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
