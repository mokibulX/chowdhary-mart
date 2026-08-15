import { customFetch, getListAdminStoresQueryKey, useListAdminStores } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgePercent, MapPin, Power, Save, Star, Store, Trash2 } from "lucide-react";

export default function AdminStores() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stores, isLoading } = useListAdminStores({
    query: { enabled: !!user, queryKey: getListAdminStoresQueryKey() },
  });

  const saveFees = async (store: any) => {
    const row = document.querySelector(`[data-store-fees="${store.id}"]`) as HTMLDivElement | null;
    const deliveryFee = row?.querySelector<HTMLInputElement>('[name="deliveryFee"]')?.value ?? store.deliveryFee ?? "0";
    const freeDeliveryAbove = row?.querySelector<HTMLInputElement>('[name="freeDeliveryAbove"]')?.value ?? store.freeDeliveryAbove ?? "0";
    const minOrderValue = row?.querySelector<HTMLInputElement>('[name="minOrderValue"]')?.value ?? store.minOrderValue ?? "0";
    try {
      await customFetch(`/api/admin/stores/${store.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deliveryFee, freeDeliveryAbove, minOrderValue }),
      });
      qc.invalidateQueries({ queryKey: getListAdminStoresQueryKey() });
      toast({ title: "Store fees updated", description: "Delivery fee and free-delivery discount rule saved." });
    } catch (error) {
      toast({ title: "Fee update failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  const toggleStore = async (store: any) => {
    try {
      await customFetch(`/api/admin/stores/${store.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isOpen: !store.isOpen }),
      });
      qc.invalidateQueries({ queryKey: getListAdminStoresQueryKey() });
      toast({
        title: !store.isOpen ? "Store activated" : "Store deactivated",
        description: !store.isOpen ? "Customers can order from this seller now." : "Customers will see: Seller is not active.",
      });
    } catch (error) {
      toast({ title: "Status update failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  const deleteStore = async (store: any) => {
    if (!confirm(`Delete ${store.name}? Ei store-er products and related orders database theke remove hoye jabe.`)) return;
    try {
      await customFetch(`/api/admin/stores/${store.id}`, { method: "DELETE" });
      qc.setQueryData(getListAdminStoresQueryKey(), (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.filter((item) => Number(item.id) !== Number(store.id));
      });
      qc.invalidateQueries({ queryKey: getListAdminStoresQueryKey(), exact: false });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Store and seller deleted", description: "Vendor account, store, products and related order data removed." });
    } catch (error) {
      toast({ title: "Store delete failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stores ({stores?.length ?? 0})</h1>
        <p className="text-sm text-muted-foreground">Admin controls delivery fees, free-delivery discount rules and pickup GPS visibility.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : !stores?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Store className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>No stores registered yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(stores as any[]).map((store: any) => (
            <div key={store.id} className="rounded-xl border bg-white p-4" data-testid={`store-${store.id}`}>
              <div className="flex gap-4">
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {store.logoUrl ? (
                    <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-6 w-6 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <h3 className="line-clamp-1 font-semibold">{store.name}</h3>
                    <Badge variant={store.isOpen ? "default" : "secondary"} className={`text-xs ${store.isOpen ? "bg-green-500" : ""}`}>
                      {store.isOpen ? "Open" : "Closed"}
                    </Badge>
                    {store.isVerified && <Badge variant="outline" className="border-blue-200 text-xs text-blue-600">Verified</Badge>}
                  </div>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{store.address}, {store.city}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {store.rating && (
                      <div className="flex items-center gap-1 text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400" />
                        {Number(store.rating).toFixed(1)} ({store.ratingCount ?? 0})
                      </div>
                    )}
                    {store.estimatedDeliveryMins && <span>{store.estimatedDeliveryMins} min delivery</span>}
                    <span>Rs.{Number(store.deliveryFee ?? 0).toFixed(0)} fee</span>
                  </div>
                  {(store.lat || store.lng) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> Pickup GPS: {Number(store.lat).toFixed(4)}, {Number(store.lng).toFixed(4)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Seller order status</p>
                  <p className="text-xs text-muted-foreground">
                    {store.isOpen ? "Active sellers can receive product orders." : "Inactive sellers are blocked from checkout."}
                  </p>
                </div>
                <Button size="sm" variant={store.isOpen ? "destructive" : "default"} onClick={() => toggleStore(store)}>
                  <Power className="mr-2 h-4 w-4" /> {store.isOpen ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteStore(store)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>

              <div data-store-fees={store.id} className="mt-4 rounded-xl border border-green-100 bg-green-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-green-800">
                  <BadgePercent className="h-4 w-4" /> Delivery fee discount control
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input name="deliveryFee" type="number" defaultValue={Number(store.deliveryFee ?? 0)} placeholder="Delivery fee" />
                  <Input name="freeDeliveryAbove" type="number" defaultValue={Number(store.freeDeliveryAbove ?? 0)} placeholder="Free above" />
                  <Input name="minOrderValue" type="number" defaultValue={Number(store.minOrderValue ?? 0)} placeholder="Min order" />
                </div>
                <p className="mt-2 text-xs text-green-700">Customer cart will show delivery fee as FREE after the free-above amount.</p>
                <Button size="sm" className="mt-3" onClick={() => saveFees(store)}>
                  <Save className="mr-2 h-4 w-4" /> Save fee rule
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
