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
import { Store, Clock, Star, Camera, ImagePlus, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { getBrowserLocation } from "@/lib/live-location";
import { PickupLocationPicker, type PickupLocation } from "@/components/PickupLocationPicker";
import { uploadImageFile } from "@/lib/image-upload";
import { getFirstFormError, getFriendlyErrorMessage } from "@/lib/error-message";

const schema = z.object({
  name: z.string().min(2, "Store name required"),
  description: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  logoUrl: z.string().optional().or(z.literal("")),
  bannerUrl: z.string().min(1, "Shop front photo is required"),
  deliveryFee: z.coerce.number().min(0),
  freeDeliveryAbove: z.coerce.number().min(0),
  minOrderValue: z.coerce.number().min(0),
  estimatedDeliveryMins: z.coerce.number().min(5).max(120),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  pickupAddress: z.string().optional().or(z.literal("")),
  isOpen: z.boolean(),
});
type FormData = z.infer<typeof schema>;

export default function VendorStore() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [locatingGps, setLocatingGps] = useState(false);

  const { data: store, isLoading } = useGetVendorStore({
    query: { enabled: !!user, queryKey: getGetVendorStoreQueryKey() },
  });
  const update = useUpdateVendorStore();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema as any),
    defaultValues: { isOpen: true, deliveryFee: 49, freeDeliveryAbove: 299, minOrderValue: 99, estimatedDeliveryMins: 40 },
  });
  const isOpen = watch("isOpen");
  const watchedLat = Number(watch("lat") ?? 0);
  const watchedLng = Number(watch("lng") ?? 0);
  const currentPickupLocation: PickupLocation | null = Number.isFinite(watchedLat) && Number.isFinite(watchedLng) && watchedLat !== 0 && watchedLng !== 0
    ? {
        lat: watchedLat,
        lng: watchedLng,
        address: watch("pickupAddress") || `${watchedLat.toFixed(6)}, ${watchedLng.toFixed(6)}`,
        distanceKm: null,
        available: true,
      }
    : null;

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
        estimatedDeliveryMins: store.estimatedDeliveryMins ?? 40,
        lat: Number(store.lat ?? 0),
        lng: Number(store.lng ?? 0),
        pickupAddress: (store as any).pickupAddress ?? store.address ?? "",
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
          lat: data.lat,
          lng: data.lng,
          pickupAddress: data.pickupAddress,
        } as any
      },
      {
        onSuccess: (savedStore: any) => {
          reset({
            name: savedStore.name,
            description: savedStore.description ?? "",
            phone: savedStore.phone ?? "",
            logoUrl: savedStore.logoUrl ?? "",
            bannerUrl: savedStore.bannerUrl ?? "",
            deliveryFee: Number(savedStore.deliveryFee ?? 49),
            freeDeliveryAbove: Number(savedStore.freeDeliveryAbove ?? 299),
            minOrderValue: Number(savedStore.minOrderValue ?? 99),
            estimatedDeliveryMins: Number(savedStore.estimatedDeliveryMins ?? 40),
            lat: Number(savedStore.lat ?? 0),
            lng: Number(savedStore.lng ?? 0),
            pickupAddress: savedStore.pickupAddress ?? savedStore.address ?? "",
            isOpen: savedStore.isOpen !== false,
          });
          qc.invalidateQueries({ queryKey: getGetVendorStoreQueryKey() });
          toast({ title: "Store settings saved" });
        },
        onError: (err: unknown) => {
          toast({ title: "Failed to save", description: getFriendlyErrorMessage(err, "Please check store details and try again."), variant: "destructive" });
        },
      }
    );
  };

  const onInvalid = (formErrors: unknown) => {
    toast({ title: "Complete store details", description: getFirstFormError(formErrors, "Store name and delivery settings are required."), variant: "destructive" });
  };

  const handleImageUpload = (field: "logoUrl" | "bannerUrl", event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    uploadImageFile(file, field === "logoUrl" ? "seller-store/logos" : "seller-store/banners").then((uploaded) => {
      setValue(field, uploaded.imageUrl, { shouldDirty: true });
      toast({ title: field === "logoUrl" ? "Store logo uploaded" : "Shop front photo uploaded" });
    }).catch((error) => {
      toast({ title: "Image upload failed", description: getFriendlyErrorMessage(error, "Please choose another image."), variant: "destructive" });
    });
  };

  const usePickupGps = async () => {
    setLocatingGps(true);
    try {
      const gps = await getBrowserLocation();
      setValue("lat", Number(gps.lat.toFixed(6)), { shouldDirty: true });
      setValue("lng", Number(gps.lng.toFixed(6)), { shouldDirty: true });
      toast({ title: "Pickup GPS saved", description: "Delivery partners can identify your store pickup point." });
    } catch (error) {
      toast({ title: "GPS failed", description: getFriendlyErrorMessage(error, "Please allow location permission and try again."), variant: "destructive" });
    } finally {
      setLocatingGps(false);
    }
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Store Settings</h1>
        {store && (
          <div className="flex flex-wrap items-center gap-2">
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

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5" noValidate>
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input {...register("logoUrl")} placeholder="https://... or uploaded image" data-testid="input-logo" />
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted sm:w-auto">
                  <ImagePlus className="mr-1 h-4 w-4" /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload("logoUrl", event)} />
                </label>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-700 hover:bg-orange-100 sm:w-auto">
                  <Camera className="mr-1 h-4 w-4" /> Camera
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleImageUpload("logoUrl", event)} />
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Shop Front Photo *</Label>
              <p className="text-xs text-muted-foreground">Take a clear photo from outside so the delivery partner can identify the pickup shop.</p>
              {watch("bannerUrl") ? <img src={watch("bannerUrl")} alt="Shop front" className="h-40 w-full rounded-lg border object-cover" /> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input {...register("bannerUrl")} placeholder="Upload or take a shop front photo" data-testid="input-banner" />
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted sm:w-auto">
                  <ImagePlus className="mr-1 h-4 w-4" /> Gallery
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload("bannerUrl", event)} />
                </label>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-700 hover:bg-orange-100 sm:w-auto">
                  <Camera className="mr-1 h-4 w-4" /> Take Photo
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleImageUpload("bannerUrl", event)} />
                </label>
              </div>
              {errors.bannerUrl && <p className="text-xs font-medium text-red-500">{errors.bannerUrl.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" />Pickup GPS for delivery partner</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Pickup address</Label>
              <Textarea {...register("pickupAddress")} rows={2} placeholder="Exact shop pickup point, floor, landmark" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Latitude</Label>
                <Input type="number" step="0.000001" {...register("lat")} data-testid="input-lat" />
              </div>
              <div className="space-y-1">
                <Label>Longitude</Label>
                <Input type="number" step="0.000001" {...register("lng")} data-testid="input-lng" />
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={usePickupGps} disabled={locatingGps}>
              <LocateFixed className="mr-2 h-4 w-4" /> {locatingGps ? "Getting GPS..." : "Use live GPS as pickup point"}
            </Button>
            <PickupLocationPicker
              mode="inline"
              initial={currentPickupLocation}
              locateFirst={!currentPickupLocation}
              title="Set exact store pickup point"
              subtitle="Use GPS, search, tap or move the map. Delivery partner will come to this pin."
              confirmLabel="Use This Store Pickup Point"
              onClose={() => undefined}
              onConfirm={(location) => {
                setValue("lat", location.lat, { shouldDirty: true });
                setValue("lng", location.lng, { shouldDirty: true });
                setValue("pickupAddress", location.address, { shouldDirty: true });
                toast({ title: "Store pickup point selected", description: location.address });
              }}
            />
            <p className="text-xs text-muted-foreground">Rapido-style pickup point: delivery partner and admin will see this store location on live tracking.</p>
          </CardContent>
        </Card>

        {/* Delivery settings */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Delivery Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-800">
              Discount style: customer will see delivery fee as FREE when cart reaches the free-delivery amount. Admin can also control this from Store panel.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Delivery Fee (₹)</Label>
                <Input type="number" {...register("deliveryFee")} data-testid="input-delivery-fee" />
              </div>
              <div className="space-y-1">
                <Label>Free Delivery Above (₹)</Label>
                <Input type="number" {...register("freeDeliveryAbove")} data-testid="input-free-delivery" />
              </div>
              <div className="space-y-1">
                <Label>Min Order Value (₹)</Label>
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
