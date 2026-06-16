import { useParams, Link } from "wouter";
import { useGetOrderTracking, getGetOrderTrackingQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MapPin, Clock, CheckCircle, Circle, Navigation, Package } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const STEP_ICONS: Record<string, string> = {
  confirmed: "✓", preparing: "🍳", packed: "📦", picked_up: "🏍️", on_the_way: "🚴", delivered: "🏠",
};

const STEP_LABELS: Record<string, string> = {
  confirmed: "Order Confirmed", preparing: "Preparing Order", packed: "Order Packed",
  picked_up: "Picked Up", on_the_way: "On the Way", delivered: "Delivered",
};

const ALL_STEPS = ["confirmed", "preparing", "packed", "picked_up", "on_the_way", "delivered"];

export default function Track() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: tracking, isLoading } = useGetOrderTracking(id, {
    query: { enabled: !!id && !!user, queryKey: getGetOrderTrackingQueryKey(id), refetchInterval: 15000 },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!tracking) {
    return <div className="text-center py-16 text-muted-foreground">Order not found.</div>;
  }

  const currentStep = ALL_STEPS.indexOf(tracking.status);
  const isDelivered = tracking.status === "delivered";
  const dp = (tracking as any).deliveryPartner;

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Live Tracking</h1>
        <Link href={`/orders/${id}`}>
          <Button variant="ghost" size="sm" data-testid="btn-order-detail">View Details</Button>
        </Link>
      </div>

      {/* Status banner */}
      <div className={`rounded-2xl p-5 text-center ${isDelivered ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
        <div className="text-4xl mb-2">{STEP_ICONS[tracking.status] ?? "📦"}</div>
        <h2 className="text-xl font-bold">{STEP_LABELS[tracking.status] ?? tracking.status}</h2>
        {!isDelivered && (tracking as any).estimatedMins && (
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Clock className="w-4 h-4" />Estimated delivery in ~{(tracking as any).estimatedMins} minutes
          </p>
        )}
        {isDelivered && <p className="text-green-600 font-medium mt-1">Your order has been delivered!</p>}
      </div>

      {/* Delivery partner */}
      {dp && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3 text-sm">Your Delivery Partner</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Navigation className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{dp.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{dp.vehicleType} · {dp.vehicleNumber}</p>
              {dp.rating && <p className="text-xs text-amber-600">★ {Number(dp.rating).toFixed(1)} rating</p>}
            </div>
            {dp.phone && (
              <a href={`tel:${dp.phone}`}>
                <Button variant="outline" size="icon" className="rounded-full" data-testid="btn-call-dp">
                  <Phone className="w-4 h-4 text-primary" />
                </Button>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Progress steps */}
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold mb-4">Order Progress</h3>
        <div className="relative">
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100" />
          {ALL_STEPS.map((step, i) => {
            const done = i <= currentStep;
            const current = i === currentStep;
            const tEvent = (tracking as any).timeline?.find((t: any) => t.status === step);
            return (
              <div key={step} className="relative flex items-start gap-4 pb-5 last:pb-0">
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 text-xs ${done ? "bg-primary border-primary text-white" : "bg-white border-gray-200 text-gray-300"}`}>
                  {done ? STEP_ICONS[step] ?? "✓" : i + 1}
                </div>
                <div className={`${current ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  <p className="text-sm">{STEP_LABELS[step]}</p>
                  {tEvent?.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(tEvent.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
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
