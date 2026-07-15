import { useEffect, useState } from "react";
import { customFetch, getGetMeQueryKey, getListDeliveryOrdersQueryKey, useListDeliveryOrders, useUpdateDeliveryLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Bike, Camera, CheckCircle, LocateFixed, LogOut, MapPin, Navigation, Package, Power, Route, Upload, X } from "lucide-react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { fileToDataUrl, getBrowserLocation, watchBrowserLocation } from "@/lib/live-location";
import { WalletSummaryCard } from "@/components/WalletSummaryCard";

const NEXT_STATUS: Record<string, string> = {
  packed: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "delivered",
};

const ACTION_LABEL: Record<string, string> = {
  packed: "Picked up",
  picked_up: "Start delivery",
  on_the_way: "Mark delivered",
};

export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [autoGps, setAutoGps] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [otpByOrder, setOtpByOrder] = useState<Record<number, string>>({});
  const [pickupOtpByOrder, setPickupOtpByOrder] = useState<Record<number, string>>({});
  const [gpsError, setGpsError] = useState("");
  const [lastGpsAt, setLastGpsAt] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | undefined>();
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [activationSelfie, setActivationSelfie] = useState("");
  const [activationChallenge, setActivationChallenge] = useState("Smile clearly");

  const { data: orders, isLoading } = useListDeliveryOrders({
    query: { enabled: !!user, queryKey: getListDeliveryOrdersQueryKey(), refetchInterval: 5000 },
  });
  const updateLocation = useUpdateDeliveryLocation();

  const refresh = () => qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });
  const activeOrders = (orders ?? []).filter((order: any) => ["packed", "picked_up", "on_the_way"].includes(order.status));
  const waitingOrders = (orders ?? []).filter((order: any) => ["confirmed", "preparing"].includes(order.status));
  const currentOrder = activeOrders[0] ?? waitingOrders[0];
  const visibleEarning = (orders ?? []).reduce((sum: number, order: any) => sum + Number(order.deliveryPartnerEarning ?? order.liveTracking?.payout?.delivery ?? 0), 0);
  const visibleKm = (orders ?? []).reduce((sum: number, order: any) => sum + Number(order.deliveryDistanceKm ?? order.liveTracking?.payout?.distanceKm ?? 0), 0);
  useEffect(() => {
    if (!autoGps) return;
    setGpsError("");
    const stop = watchBrowserLocation(
      (gps) => {
        setLastGpsAt(gps.capturedAt);
        setLastAccuracy(gps.accuracy);
        updateLocation.mutate({
          data: {
            lat: gps.lat,
            lng: gps.lng,
            accuracy: gps.accuracy,
            speed: gps.speed,
            heading: gps.heading,
            capturedAt: gps.capturedAt,
          },
        });
      },
      (error) => {
        setGpsError(error.message);
        setAutoGps(false);
        toast({ title: "Live GPS stopped", description: error.message, variant: "destructive" });
      },
    );
    return stop;
  }, [autoGps, toast, updateLocation]);

  const getPartnerLocation = async () => {
    const gps = await getBrowserLocation();
    setLastGpsAt(gps.capturedAt);
    setLastAccuracy(gps.accuracy);
    return { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, speed: gps.speed, heading: gps.heading, capturedAt: gps.capturedAt };
  };

  const updateGpsOnce = async () => {
    try {
      const location = await getPartnerLocation();
      updateLocation.mutate(
        { data: location },
        { onSuccess: () => toast({ title: "Location updated", description: "Customers can see your latest GPS point." }) },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not capture live GPS.";
      setGpsError(message);
      toast({ title: "GPS permission needed", description: message, variant: "destructive" });
    }
  };

  const toggleOnline = async () => {
    setOnlineBusy(true);
    try {
      const goingOnline = !user?.isOnline;
      let location = null;
      if (goingOnline) {
        if (!activationSelfie) {
          toast({ title: "Live selfie required", description: "Start duty-r age front camera selfie upload korun.", variant: "destructive" });
          return;
        }
        location = await getPartnerLocation();
      }
      await customFetch("/api/delivery/toggle-online", {
        method: "PATCH",
        body: JSON.stringify(goingOnline ? { activationSelfie, livenessChallenge: activationChallenge, location } : {}),
        responseType: "json",
      });
      if (location) await customFetch("/api/delivery/location", { method: "PATCH", body: JSON.stringify(location), responseType: "json" });
      setActivationSelfie("");
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: goingOnline ? "You are online" : "You are offline", description: goingOnline ? "Daily live selfie and GPS verified." : undefined });
    } catch (error) {
      toast({ title: "Online check failed", description: (error as { data?: { error?: string } })?.data?.error ?? "Please complete GPS and selfie verification.", variant: "destructive" });
    } finally {
      setOnlineBusy(false);
    }
  };

  const selectActivationSelfie = async (file?: File) => {
    if (!file) return;
    try {
      setActivationSelfie(await fileToDataUrl(file));
    } catch (error) {
      toast({ title: "Selfie failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const acceptOrder = async (orderId: number) => {
    setBusyOrderId(orderId);
    try {
      const location = await getPartnerLocation();
      await customFetch(`/api/delivery/orders/${orderId}/accept`, { method: "POST", responseType: "json" });
      await customFetch("/api/delivery/location", { method: "PATCH", body: JSON.stringify(location), responseType: "json" });
      toast({ title: "Order accepted", description: "Pickup task added to your route." });
      refresh();
    } catch (error) {
      const message = (error as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Could not accept order";
      toast({ title: message, variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const rejectOrder = async (orderId: number) => {
    setBusyOrderId(orderId);
    try {
      await customFetch(`/api/delivery/orders/${orderId}/reject`, { method: "POST", body: JSON.stringify({ reason: "Rejected from rider dashboard" }), responseType: "json" });
      toast({ title: "Order rejected" });
      refresh();
    } catch {
      toast({ title: "Could not reject order", variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const cancelAssignment = async (orderId: number) => {
    const reason = window.prompt("Why are you unable to continue this delivery?");
    if (!reason?.trim()) return;
    setBusyOrderId(orderId);
    try {
      await customFetch(`/api/delivery/orders/${orderId}/cancel-assignment`, {
        method: "POST",
        body: JSON.stringify({ reason }),
        responseType: "json",
      });
      toast({ title: "Assignment cancelled", description: "Order is back in rider matching." });
      refresh();
    } catch (error) {
      const message = (error as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Could not cancel assignment";
      toast({ title: message, variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const markStatus = async (order: any) => {
    const status = NEXT_STATUS[order.status];
    if (!status) return;
    const expectedOtp = String((order as any).liveTracking?.deliveryOtp ?? order.tracking?.deliveryOtp ?? 1000 + (order.id % 9000));
    const expectedPickupOtp = String((order as any).liveTracking?.pickupOtp ?? order.tracking?.pickupOtp ?? "");
    if (status === "picked_up" && pickupOtpByOrder[order.id] !== expectedPickupOtp) {
      toast({ title: "Pickup OTP required", description: "Seller-er kach theke pickup OTP niye enter korun.", variant: "destructive" });
      return;
    }
    if (status === "delivered" && otpByOrder[order.id] !== expectedOtp) {
      toast({ title: "Delivery OTP required", description: "Customer-er order tracking page-er OTP diye delivered mark korun.", variant: "destructive" });
      return;
    }
    setBusyOrderId(order.id);
    try {
      const location = await getPartnerLocation();
      await customFetch(`/api/delivery/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, otp: otpByOrder[order.id], pickupOtp: pickupOtpByOrder[order.id], location }),
        responseType: "json",
      });
      toast({ title: "Delivery updated", description: `Order #${order.orderNumber} is now ${status.replace(/_/g, " ")}.` });
      refresh();
    } catch (error) {
      const message = (error as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Could not update delivery";
      toast({ title: message, variant: "destructive" });
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div className="app-shell bg-gray-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link href="/" className="truncate font-bold text-primary">Chowdhary Mart Partner</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button className="w-full sm:w-auto" variant={user?.isOnline ? "default" : "outline"} size="sm" onClick={toggleOnline} disabled={onlineBusy}>
              <Power className="mr-2 h-4 w-4" /> {user?.isOnline ? "Go offline" : "Go online"}
            </Button>
            <Button className="w-full sm:w-auto" variant={autoGps ? "default" : "outline"} size="sm" onClick={() => setAutoGps(value => !value)}>
              <LocateFixed className="mr-2 h-4 w-4" /> {autoGps ? "GPS live" : "Start GPS"}
            </Button>
            <Button className="col-span-2 w-full sm:col-span-1 sm:w-auto" variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="app-content mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-6">
        <section className="rounded-lg bg-gray-950 p-4 text-white sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-white/60">Delivery partner</p>
              <h1 className="truncate text-xl font-bold sm:text-2xl">Welcome, {user?.name}</h1>
              <p className="mt-1 text-sm text-white/70">Accept orders, update pickup status and share live GPS.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <Stat value={activeOrders.length} label="Active" />
              <Stat value={waitingOrders.length} label="Available" />
              <Stat value={`Rs.${visibleEarning.toFixed(0)}`} label={`${visibleKm.toFixed(1)} km`} />
            </div>
          </div>
        </section>

        <WalletSummaryCard href="/delivery/wallet" title="Delivery partner wallet" tone="dark" />

        {!user?.isOnline && (
          <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-bold text-blue-950">Daily live activation check</h2>
                <p className="text-sm text-blue-700">Go Online korar age front-camera selfie and GPS verify hobe. Challenge: <b>{activationChallenge}</b></p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setActivationChallenge(["Smile clearly", "Blink your eyes", "Look left", "Look up"][Math.floor(Math.random() * 4)])}>
                Change challenge
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              {activationSelfie ? (
                <img src={activationSelfie} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-white text-blue-500"><Camera className="h-6 w-6" /></div>
              )}
              <label className="inline-flex cursor-pointer items-center rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                <Upload className="mr-2 h-4 w-4" /> Capture selfie
                <input className="hidden" type="file" accept="image/*" capture="user" onChange={(event) => selectActivationSelfie(event.target.files?.[0])} />
              </label>
              <Button type="button" onClick={toggleOnline} disabled={onlineBusy}>
                <Power className="mr-2 h-4 w-4" /> Verify and go online
              </Button>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0 rounded-lg border bg-white p-3 sm:p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Orders</h2>
              <Badge variant="outline">{orders?.length ?? 0} total</Badge>
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div>
            ) : !orders?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
                No orders assigned yet
              </div>
            ) : (
              <div className="space-y-3">
                {(orders as any[]).map((order) => (
                  <div key={order.id} className="rounded-lg border p-3 shadow-sm sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">#{order.orderNumber}</span>
                          <Badge className="capitalize">{order.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{order.store?.name ?? "Seller store"}</p>
                      </div>
                      <span className="font-bold sm:text-right">Rs.{Number(order.total).toFixed(0)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded bg-gray-50 p-2">
                        <p className="flex items-center gap-1 font-medium"><Bike className="h-4 w-4" /> Pickup</p>
                        <p className="text-xs text-muted-foreground">{order.store?.address ?? "Seller location"}</p>
                      </div>
                      <div className="rounded bg-gray-50 p-2">
                        <p className="flex items-center gap-1 font-medium"><MapPin className="h-4 w-4" /> Drop</p>
                        <p className="text-xs text-muted-foreground">{order.addressSnapshot?.line1}, {order.addressSnapshot?.city}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Link href={`/track/${order.id}`}>
                        <Button className="w-full sm:w-auto" variant="outline" size="sm"><Navigation className="mr-2 h-4 w-4" /> Track map</Button>
                      </Link>
                      {["confirmed", "preparing"].includes(order.status) && (
                        <>
                          <Button className="w-full sm:w-auto" size="sm" onClick={() => acceptOrder(order.id)} disabled={busyOrderId === order.id}>
                            <CheckCircle className="mr-2 h-4 w-4" /> Accept
                          </Button>
                          <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => rejectOrder(order.id)} disabled={busyOrderId === order.id}>
                            <X className="mr-2 h-4 w-4" /> Reject
                          </Button>
                        </>
                      )}
                      {NEXT_STATUS[order.status] && (
                        <>
                          {NEXT_STATUS[order.status] === "picked_up" && (
                            <Input
                              className="h-9 w-full sm:w-36"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="Pickup OTP"
                              value={pickupOtpByOrder[order.id] ?? ""}
                              onChange={(event) => setPickupOtpByOrder((current) => ({ ...current, [order.id]: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
                            />
                          )}
                          {NEXT_STATUS[order.status] === "delivered" && (
                            <Input
                              className="h-9 w-full sm:w-32"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="OTP"
                              value={otpByOrder[order.id] ?? ""}
                              onChange={(event) => setOtpByOrder((current) => ({ ...current, [order.id]: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
                            />
                          )}
                          <Button className="w-full sm:w-auto" size="sm" onClick={() => markStatus(order)} disabled={busyOrderId === order.id}>
                            <CheckCircle className="mr-2 h-4 w-4" /> {ACTION_LABEL[order.status]}
                          </Button>
                          {order.status === "packed" && (
                            <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => cancelAssignment(order.id)} disabled={busyOrderId === order.id}>
                              <X className="mr-2 h-4 w-4" /> Unable to continue
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border bg-white p-3 sm:p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold">Live route preview</h2>
                <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={updateGpsOnce} disabled={updateLocation.isPending}>
                  <LocateFixed className="mr-2 h-4 w-4" /> Ping GPS
                </Button>
              </div>
              {currentOrder ? (
                <LiveDeliveryMap tracking={(currentOrder as any).liveTracking ?? (currentOrder as any).tracking} compact role="partner" />
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Accept an order to see its live route map here.
                </div>
              )}
              <div className="mt-3 space-y-1 text-xs">
                <p className={gpsError ? "text-red-600" : "text-muted-foreground"}>
                  {gpsError || (autoGps ? "Live GPS sharing is active. Customers and admin can see your real movement." : "Start GPS or tap Ping GPS to update the live route. No fake movement is used.")}
                </p>
                {lastGpsAt && (
                  <p className={lastAccuracy && lastAccuracy > 80 ? "text-amber-600" : "text-muted-foreground"}>
                    Last GPS: {new Date(lastGpsAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    {lastAccuracy ? ` · accuracy ${lastAccuracy}m` : ""}
                    {lastAccuracy && lastAccuracy > 80 ? " · low accuracy" : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3 sm:p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Route className="h-4 w-4" /> Delivery checklist</h2>
              {["Accept or reject quickly", "Mark picked up at seller", "Start delivery after pickup", "Share live GPS", "Ask customer OTP before delivered"].map((item) => (
                <div key={item} className="flex items-center gap-2 border-t py-2 text-sm first:border-t-0">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg bg-white/10 px-2 py-3 sm:px-4">
      <p className="text-xl font-bold sm:text-2xl">{value}</p>
      <p className="text-xs text-white/60">{label}</p>
    </div>
  );
}
