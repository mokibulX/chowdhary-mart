import { useParams, Link } from "wouter";
import { useGetOrderTracking, getGetOrderTrackingQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Navigation, Package, Phone } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  pending: "Order Placed",
  confirmed: "Order Confirmed",
  preparing: "Preparing Order",
  packed: "Order Packed",
  picked_up: "Picked Up",
  on_the_way: "On the Way",
  delivered: "Delivered",
};

const ALL_STEPS = ["pending", "confirmed", "preparing", "packed", "picked_up", "on_the_way", "delivered"];

export default function Track() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const { user } = useAuth();

  const { data: tracking, isLoading } = useGetOrderTracking(id, {
    query: { enabled: !!id && !!user, queryKey: getGetOrderTrackingQueryKey(id), refetchInterval: 15000 },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!tracking) {
    return <div className="py-16 text-center text-muted-foreground">Order not found.</div>;
  }

  const currentStep = Math.max(0, ALL_STEPS.indexOf(tracking.status));
  const isDelivered = tracking.status === "delivered";
  const dp = (tracking as any).deliveryPartner;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Live Tracking</h1>
        <Link href={`/orders/${id}`}>
          <Button variant="ghost" size="sm" data-testid="btn-order-detail">View Details</Button>
        </Link>
      </div>

      <div className={`rounded-xl border p-5 text-center ${isDelivered ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
        <Package className="mx-auto mb-2 h-10 w-10 text-primary" />
        <h2 className="text-xl font-bold">{STEP_LABELS[tracking.status] ?? tracking.status}</h2>
        {!isDelivered && (tracking as any).estimatedMins && (
          <p className="mt-1 flex items-center justify-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" /> Estimated delivery in ~{(tracking as any).estimatedMins} minutes
          </p>
        )}
        {isDelivered && <p className="mt-1 font-medium text-green-600">Your order has been delivered.</p>}
      </div>

      {dp && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">Delivery Partner</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Navigation className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{dp.name}</p>
              <p className="text-sm capitalize text-muted-foreground">{dp.vehicleType} - {dp.vehicleNumber}</p>
              {dp.rating && <p className="text-xs text-amber-600">Star {Number(dp.rating).toFixed(1)} rating</p>}
            </div>
            {dp.phone && (
              <a href={`tel:${dp.phone}`}>
                <Button variant="outline" size="icon" className="rounded-full" data-testid="btn-call-dp">
                  <Phone className="h-4 w-4 text-primary" />
                </Button>
              </a>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Live map preview</h3>
          <Badge variant="outline">GPS mock</Badge>
        </div>
        <div className="relative h-64 overflow-hidden rounded-xl bg-emerald-50">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,185,129,.18)_1px,transparent_1px),linear-gradient(rgba(16,185,129,.18)_1px,transparent_1px)] bg-[size:26px_26px]" />
          <div className="absolute left-8 top-8 rounded-full bg-white p-2 shadow">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="absolute bottom-8 right-8 rounded-full bg-white p-2 shadow">
            <MapPin className="h-5 w-5 text-red-500" />
          </div>
          <div className="absolute left-14 top-14 h-36 w-48 rounded-full border-4 border-dashed border-primary/60" />
          <div className="absolute left-1/2 top-1/2 rounded-full bg-primary p-3 text-white shadow-lg">
            <Navigation className="h-5 w-5" />
          </div>
          <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 p-2 text-xs shadow">
            <p className="font-semibold">{tracking.status.replace(/_/g, " ")}</p>
            <p className="text-muted-foreground">
              {dp?.location ? `${Number(dp.location.lat).toFixed(4)}, ${Number(dp.location.lng).toFixed(4)}` : "Partner location updates live"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-4 font-semibold">Order Progress</h3>
        <div className="relative">
          <div className="absolute bottom-4 left-4 top-4 w-0.5 bg-gray-100" />
          {ALL_STEPS.map((step, index) => {
            const done = index <= currentStep;
            const current = index === currentStep;
            const event = (tracking as any).timeline?.find((item: any) => item.status === step);
            return (
              <div key={step} className="relative flex items-start gap-4 pb-5 last:pb-0">
                <div className={`z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs ${done ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-300"}`}>
                  {done ? "OK" : index + 1}
                </div>
                <div className={`${current ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  <p className="text-sm">{STEP_LABELS[step]}</p>
                  {event?.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
