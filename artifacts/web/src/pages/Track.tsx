import { Link, useParams } from "wouter";
import { useGetOrderTracking, getGetOrderTrackingQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, CheckCircle2, Headphones, Navigation, Phone } from "lucide-react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { testMode } from "@/lib/test-mode";

const STEP_LABELS: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Shop confirmed",
  preparing: "Preparing order",
  packed: "Delivery partner assigned",
  picked_up: "Picked up",
  on_the_way: "Rider on the way",
  arriving: "Rider arrived",
  delivered: "Delivered",
};

const ALL_STEPS = ["pending", "confirmed", "packed", "picked_up", "on_the_way", "arriving", "delivered"];

export default function Track() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const { user } = useAuth();

  const { data: tracking, isLoading } = useGetOrderTracking(id, {
    query: { enabled: !!id && !!user, queryKey: getGetOrderTrackingQueryKey(id), refetchInterval: 5000 },
  });

  const t = tracking as any;
  const currentStep = Math.max(0, ALL_STEPS.indexOf(t?.status ?? "confirmed"));
  const isDelivered = t?.status === "delivered";
  const etaMins = isDelivered ? 0 : Math.min(40, Math.max(3, Number(t?.estimatedMins ?? 40)));
  const distanceKm = Number(t?.distanceKm ?? 3.2);
  const dp = t?.deliveryPartner;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[560px] rounded-lg" />
      </div>
    );
  }

  if (!tracking) return <div className="py-16 text-center text-muted-foreground">Order not found.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-lg border bg-gray-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge className="mb-3 bg-green-100 text-green-700 hover:bg-green-100">{isDelivered ? "Delivered" : "Live tracking"}</Badge>
            <h1 className="text-2xl font-bold">{isDelivered ? "Your order is delivered" : `Your order is arriving in ${etaMins} mins`}</h1>
            <p className="mt-1 text-sm text-white/70">Order #{id} updates from delivery partner GPS when the rider is online.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <p className="text-xl font-bold">{etaMins}</p>
              <p className="text-[11px] text-white/60">mins</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <p className="text-xl font-bold">{distanceKm}</p>
              <p className="text-[11px] text-white/60">km</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <p className="text-xl font-bold">{isDelivered ? "Done" : testMode.demoOtpCode || "123456"}</p>
              <p className="text-[11px] text-white/60">{isDelivered ? "OTP cleared" : "OTP"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
        <LiveDeliveryMap tracking={t} role="customer" />

        <aside className="space-y-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold">Delivery partner</h3>
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-full bg-primary/10">
                {dp?.photoUrl ? <img src={dp.photoUrl} alt={dp.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Bike className="h-7 w-7 text-primary" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{dp?.name ?? "Partner assigning"}</p>
                <p className="text-sm capitalize text-muted-foreground">{dp?.vehicleType ?? "bike"} {dp?.vehicleNumber ? `- ${dp.vehicleNumber}` : ""}</p>
                <p className="text-xs text-amber-600">{dp?.rating ? `${Number(dp.rating).toFixed(1)} rating` : "Verified delivery partner"}</p>
              </div>
              {dp?.phone && (
                <a href={`tel:${dp.phone}`}>
                  <Button variant="outline" size="icon" className="rounded-full" data-testid="btn-call-dp">
                    <Phone className="h-4 w-4 text-primary" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-4 font-semibold">Order progress</h3>
            <div className="relative">
              <div className="absolute bottom-4 left-4 top-4 w-0.5 bg-gray-100" />
              {ALL_STEPS.map((step, index) => {
                const done = index <= currentStep;
                const current = index === currentStep;
                const event = t.timeline?.find((item: any) => item.status === step);
                return (
                  <div key={step} className="relative flex items-start gap-4 pb-5 last:pb-0">
                    <div className={`z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs ${done ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-300"}`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className={`${current ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                      <p className="text-sm">{STEP_LABELS[step]}</p>
                      {event?.updatedAt && <p className="text-xs text-muted-foreground">{new Date(event.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link href="/help"><Button variant="outline" className="w-full"><Headphones className="mr-2 h-4 w-4" />Help</Button></Link>
            <Link href={`/orders/${id}`}><Button variant="outline" className="w-full">Cancel</Button></Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
