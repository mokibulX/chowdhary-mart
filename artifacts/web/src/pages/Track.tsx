import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { useGetOrderTracking, getGetOrderTrackingQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, CheckCircle2, Clock, Headphones, Home, MapPin, Navigation, Package, Phone, ShieldCheck, Store } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  packed: "Packed",
  picked_up: "Picked up",
  on_the_way: "Out for delivery",
  arriving: "Arriving",
  delivered: "Delivered",
};

const ALL_STEPS = ["pending", "confirmed", "packed", "picked_up", "on_the_way", "delivered"];

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
  const store = t?.storeLocation ?? { lat: 22.5726, lng: 88.3639, label: "Store hub" };
  const customer = t?.customerLocation ?? { lat: 22.6006, lng: 88.3949, label: "Your location" };
  const partner = t?.partnerLocation ?? dp?.location ?? { lat: 22.579, lng: 88.369 };
  const routeProgress = useMemo(() => {
    if (isDelivered) return 92;
    if (["pending", "confirmed", "packed"].includes(t?.status)) return 16 + currentStep * 8;
    return Math.min(86, Math.max(34, 86 - distanceKm * 12));
  }, [currentStep, distanceKm, isDelivered, t?.status]);

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
      <style>{`
        @keyframes live-pulse { 0%, 100% { transform: scale(1); opacity: .62; } 50% { transform: scale(1.45); opacity: .14; } }
        @keyframes live-bike { 0%, 100% { transform: translate(0, 0) rotate(-7deg); } 50% { transform: translate(7px, -5px) rotate(6deg); } }
        @keyframes route-dash { to { stroke-dashoffset: -36; } }
        .live-pulse { animation: live-pulse 1.8s ease-in-out infinite; transform-origin: center; }
        .live-bike { animation: live-bike 2.3s ease-in-out infinite; }
        .route-dash { stroke-dasharray: 12 10; animation: route-dash 1.3s linear infinite; }
      `}</style>

      <section className="rounded-lg border bg-gray-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge className="mb-3 bg-green-100 text-green-700 hover:bg-green-100">{isDelivered ? "Delivered" : "Live tracking"}</Badge>
            <h1 className="text-2xl font-bold">{isDelivered ? "Your order is delivered" : `Your order is arriving in ${etaMins} mins`}</h1>
            <p className="mt-1 text-sm text-white/70">Order #{id} updates every few seconds in mock realtime mode.</p>
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
              <p className="text-xl font-bold">{t?.deliveryOtp ?? "----"}</p>
              <p className="text-[11px] text-white/60">OTP</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="text-sm text-muted-foreground">Live map</p>
              <h2 className="text-lg font-bold">{STEP_LABELS[t.status] ?? t.status}</h2>
            </div>
            <Badge variant="outline">Mock map mode</Badge>
          </div>

          <div className="relative h-[470px] overflow-hidden bg-[#eef7f1] sm:h-[560px]">
            <div className="absolute inset-0 opacity-90 [background-image:linear-gradient(90deg,rgba(20,83,45,.13)_1px,transparent_1px),linear-gradient(rgba(20,83,45,.13)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="absolute left-12 top-16 h-24 w-52 rounded-full border border-emerald-300/60 bg-emerald-100/50" />
            <div className="absolute bottom-20 right-8 h-32 w-64 rounded-full border border-blue-300/60 bg-blue-100/50" />
            <div className="absolute left-[19%] top-[31%] h-14 w-32 rounded-sm bg-white/80 shadow-sm" />
            <div className="absolute right-[18%] top-[20%] h-20 w-28 rounded-sm bg-white/80 shadow-sm" />
            <div className="absolute bottom-[20%] left-[28%] h-16 w-44 rounded-sm bg-white/80 shadow-sm" />

            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 560" preserveAspectRatio="none" aria-hidden="true">
              <path d="M92 126 C194 140 186 270 304 270 C452 270 416 404 632 428" fill="none" stroke="#d1d5db" strokeWidth="24" strokeLinecap="round" />
              <path d="M92 126 C194 140 186 270 304 270 C452 270 416 404 632 428" fill="none" stroke="#ffffff" strokeWidth="15" strokeLinecap="round" />
              <path d="M92 126 C194 140 186 270 304 270 C452 270 416 404 632 428" fill="none" stroke="#f97316" strokeWidth="5" strokeLinecap="round" className="route-dash" />
              <path d="M92 126 C194 140 186 270 304 270 C452 270 416 404 632 428" fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${routeProgress * 6} 900`} />
            </svg>

            <div className="absolute left-[9%] top-[18%] rounded-lg border bg-white p-3 shadow-md">
              <Store className="mb-1 h-5 w-5 text-primary" />
              <p className="text-xs font-semibold">Pickup</p>
              <p className="max-w-[120px] truncate text-[11px] text-muted-foreground">{store.label}</p>
            </div>

            <div className="absolute bottom-[17%] right-[8%] rounded-lg border bg-white p-3 shadow-md">
              <Home className="mb-1 h-5 w-5 text-emerald-600" />
              <p className="text-xs font-semibold">Drop</p>
              <p className="max-w-[120px] truncate text-[11px] text-muted-foreground">{customer.label}</p>
            </div>

            <div className="absolute rounded-full" style={{ left: `${Math.min(78, 13 + routeProgress * 0.7)}%`, top: `${Math.max(21, 52 - routeProgress * 0.24)}%` }}>
              <div className="live-pulse absolute inset-0 rounded-full bg-primary/60" />
              <div className="live-bike relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl ring-4 ring-white">
                <Bike className="h-7 w-7" />
              </div>
            </div>

            <div className="absolute left-4 right-4 top-4 flex items-center justify-between rounded-lg border bg-white/95 p-3 shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Navigation className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{isDelivered ? "Delivered at your location" : "Partner is moving toward you"}</p>
                  <p className="text-xs text-muted-foreground">{Number(partner.lat).toFixed(4)}, {Number(partner.lng).toFixed(4)}</p>
                </div>
              </div>
              <Badge variant="outline">{distanceKm} km</Badge>
            </div>

            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
              <MapStat icon={Clock} label="ETA" value={isDelivered ? "Done" : `${etaMins} min`} />
              <MapStat icon={ShieldCheck} label="OTP" value={t?.deliveryOtp ?? "----"} />
              <MapStat icon={Package} label="Status" value={STEP_LABELS[t.status] ?? t.status} />
            </div>
          </div>
        </div>

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

function MapStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white/95 p-3 shadow-sm">
      <Icon className="mb-1 h-4 w-4 text-primary" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}
