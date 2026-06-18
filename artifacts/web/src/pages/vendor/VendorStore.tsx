import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useGetVendorStore, useUpdateVendorStore, getGetVendorStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Clock, Star } from "lucide-react";
import { useEffect } from "react";

const schema = z.object({
  name: z.string().min(2, "Store name required"),
  description: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  deliveryFee: z.coerce.number().min(0),
  freeDeliveryAbove: z.coerce.number().min(0),
  minOrderValue: z.coerce.number().min(0),
  estimatedDeliveryMins: z.coerce.number().min(5).max(120),
  isOpen: z.boolean(),
});
type FormData = z.infer<typeof schema>;

export default function VendorStore() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: store, isLoading } = useGetVendorStore({
    query: { enabled: !!user, queryKey: getGetVendorStoreQueryKey() },
  });
  const update = useUpdateVendorStore();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { isOpen: true, deliveryFee: 49, freeDeliveryAbove: 299, minOrderValue: 99, estimatedDeliveryMins: 30 },
  });
  const isOpen = watch("isOpen");

  useEffect(() => {
    if (store) {
      reset({
        name: store.name,
        description: store.description ?? "",
        phone: store.phone ?? "",
        logoUrl: store.logoUrl ?? "",
        bannerUrl: store.bannerUrl ?? "",
        deliveryFee: Number(store.deliveryFee ?? 49),
        freeDeliveryAbove: Number(store.freeDeliveryAbove ?? 299),
        minOrderValue: Number(store.minOrderValue ?? 99),
        estimatedDeliveryMins: store.estimatedDeliveryMins ?? 30,
        isOpen: !!store.isOpen,
      });
    }
  }, [store, reset]);

  const onSubmit = (data: FormData) => {
    update.mutate(
      {
        data: {
          ...data,
          deliveryFee: String(data.deliveryFee),
          freeDeliveryAbove: String(data.freeDeliveryAbove),
          minOrderValue: String(data.minOrderValue),
        } as any
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetVendorStoreQueryKey() });
          toast({ title: "Store settings saved" });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Store Settings</h1>
        {store && (
          <div className="flex items-center gap-2">
            <Badge className={store.isOpen ? "bg-green-500" : "bg-gray-400"}>
              {store.isOpen ? "Open" : "Closed"}
            </Badge>
            {store.rating && (
              <div className="flex items-center gap-1 text-sm text-amber-600">
                <Star className="w-4 h-4 fill-amber-400" />
                {Number(store.rating).toFixed(1)} ({store.ratingCount})
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Basic info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4" />Store Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Store Name *</Label>
              <Input {...register("name")} data-testid="input-name" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea {...register("description")} rows={3} data-testid="input-description" />
            </div>
            <div className="space-y-1">
              <Label>Contact Phone</Label>
              <Input {...register("phone")} data-testid="input-phone" />
            </div>
            <div className="space-y-1">
              <Label>Logo URL</Label>
              <Input type="url" {...register("logoUrl")} placeholder="https://..." data-testid="input-logo" />
            </div>
            <div className="space-y-1">
              <Label>Banner URL</Label>
              <Input type="url" {...register("bannerUrl")} placeholder="https://..." data-testid="input-banner" />
            </div>
          </CardContent>
        </Card>

        {/* Delivery settings */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Delivery Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Delivery Fee (â‚¹)</Label>
                <Input type="number" {...register("deliveryFee")} data-testid="input-delivery-fee" />
              </div>
              <div className="space-y-1">
                <Label>Free Delivery Above (â‚¹)</Label>
                <Input type="number" {...register("freeDeliveryAbove")} data-testid="input-free-delivery" />
              </div>
              <div className="space-y-1">
                <Label>Min Order Value (â‚¹)</Label>
                <Input type="number" {...register("minOrderValue")} data-testid="input-min-order" />
              </div>
              <div className="space-y-1">
                <Label>Estimated Delivery (mins)</Label>
                <Input type="number" min={5} max={120} {...register("estimatedDeliveryMins")} data-testid="input-eta" />
                {errors.estimatedDeliveryMins && <p className="text-xs text-red-500">{errors.estimatedDeliveryMins.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open/close toggle */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Store Status</p>
                <p className="text-sm text-muted-foreground">Toggle to open or close your store</p>
              </div>
              <Switch checked={isOpen} onCheckedChange={v => setValue("isOpen", v)} data-testid="switch-open" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={update.isPending} data-testid="btn-save">
          {update.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </div>
  );
}
