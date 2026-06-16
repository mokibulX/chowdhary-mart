import { useListAdminStores, getListAdminStoresQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Star } from "lucide-react";

export default function AdminStores() {
  const { user } = useAuth();
  const { data: stores, isLoading } = useListAdminStores({
    query: { enabled: !!user, queryKey: getListAdminStoresQueryKey() },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Stores ({stores?.length ?? 0})</h1>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !stores?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No stores registered yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(stores as any[]).map((store: any) => (
            <div key={store.id} className="bg-white border rounded-xl p-4 flex gap-4" data-testid={`store-${store.id}`}>
              <div className="w-16 h-16 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Store className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h3 className="font-semibold line-clamp-1">{store.name}</h3>
                  <Badge variant={store.isOpen ? "default" : "secondary"} className={`text-xs ${store.isOpen ? "bg-green-500" : ""}`}>
                    {store.isOpen ? "Open" : "Closed"}
                  </Badge>
                  {store.isVerified && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Verified</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{store.address}, {store.city}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {store.rating && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {Number(store.rating).toFixed(1)} ({store.ratingCount})
                    </div>
                  )}
                  {store.estimatedDeliveryMins && <span>{store.estimatedDeliveryMins} min delivery</span>}
                  {store.deliveryFee !== null && <span>₹{store.deliveryFee} fee</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
