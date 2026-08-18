import { type ReactNode, useEffect, useState } from "react";
import { customFetch, getGetMeQueryKey, getListDeliveryOrdersQueryKey, useListDeliveryOrders, useUpdateDeliveryLocation } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isDemoOtp, testMode } from "@/lib/test-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Bike, Camera, CheckCircle, CircleUserRound, DollarSign, Home, LocateFixed, LogOut, MapPin, Navigation, Package, Power, Route, WalletCards, X } from "lucide-react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { getBrowserLocation, watchBrowserLocation } from "@/lib/live-location";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  const [clock, setClock] = useState(() => Date.now());
  const [orderFilter, setOrderFilter] = useState<"active" | "completed" | "cancelled">("active");

  const { data: orders, isLoading } = useListDeliveryOrders({
    query: { enabled: !!user, queryKey: getListDeliveryOrdersQueryKey(), refetchInterval: 5000 },
  });
  const { data: dashboardSummary } = useQuery({
    queryKey: ["/api/delivery/dashboard-summary"],
    queryFn: () => customFetch<any>("/api/delivery/dashboard-summary", { responseType: "json" }),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const updateLocation = useUpdateDeliveryLocation();

  const refresh = () => qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });
  const currentStatus = dashboardSummary?.currentStatus ?? ((user as any)?.isOnline ? "online" : "offline");
  const userOnline = currentStatus !== "offline";
  const activeOrders = (orders ?? []).filter((order: any) => ["packed", "picked_up", "on_the_way"].includes(order.status));
  const waitingOrders = (orders ?? []).filter((order: any) => ["confirmed", "preparing"].includes(order.status));
  const currentOrder = activeOrders[0] ?? waitingOrders[0];
  const visibleOrders = (orders ?? []).filter((order: any) => orderFilter === "completed"
    ? order.status === "delivered"
    : orderFilter === "cancelled"
      ? order.status === "cancelled"
      : order.status !== "delivered" && order.status !== "cancelled");
  const currentSessionSeconds = dashboardSummary?.currentOnlineStartedAt
    ? Math.max(0, Math.floor((clock - new Date(dashboardSummary.currentOnlineStartedAt).getTime()) / 1000))
    : 0;
  useEffect(() => {
    if (!dashboardSummary?.currentOnlineStartedAt) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [dashboardSummary?.currentOnlineStartedAt]);
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
            timestamp: gps.capturedAt,
            orderId: currentOrder?.id,
          } as any,
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
    return { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, speed: gps.speed, heading: gps.heading, timestamp: gps.capturedAt, orderId: currentOrder?.id };
  };

  const updateGpsOnce = async () => {
    try {
      const location = await getPartnerLocation();
      updateLocation.mutate(
        { data: location as any },
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
      const goingOnline = !userOnline;
      await customFetch("/api/delivery/toggle-online", {
        method: "PATCH",
        body: JSON.stringify({ online: goingOnline }),
        responseType: "json",
      });
      if (!goingOnline) setAutoGps(false);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() });
      await qc.invalidateQueries({ queryKey: ["/api/delivery/dashboard-summary"] });
      toast({ title: goingOnline ? "You are online" : "You are offline" });
    } catch (error) {
      toast({ title: "Availability update failed", description: (error as { data?: { error?: string } })?.data?.error ?? "Please try again.", variant: "destructive" });
    } finally {
      setOnlineBusy(false);
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
    const enteredPickupOtp = pickupOtpByOrder[order.id] ?? "";
    const enteredDeliveryOtp = otpByOrder[order.id] ?? "";
    if (status === "picked_up" && enteredPickupOtp !== expectedPickupOtp && !isDemoOtp(enteredPickupOtp)) {
      toast({ title: "Pickup OTP required", description: "Seller-er kach theke pickup OTP niye enter korun.", variant: "destructive" });
      return;
    }
    if (status === "delivered" && enteredDeliveryOtp !== expectedOtp && !isDemoOtp(enteredDeliveryOtp)) {
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
    <div className="app-shell bg-[#f6f7f9] pb-24 text-slate-950">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => window.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0"><p className="truncate text-sm font-black">cMart Partner</p><p className="text-[11px] text-muted-foreground">Delivery workspace</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={userOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{userOnline ? "ONLINE" : "OFFLINE"}</Badge>
            <Button size="icon" variant="ghost" onClick={logout} aria-label="Log out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main id="top" className="app-content mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-6">
        <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Current status</p>
              <h1 className="mt-1 truncate text-2xl font-black sm:text-3xl">{user?.name}</h1>
              <p className="mt-2 text-sm text-white/65">{userOnline ? `Online for ${formatDuration(currentSessionSeconds)}` : "Go online when you are ready to deliver."}</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-48">
              <Button className="h-12 w-full rounded-xl bg-orange-500 px-6 text-base font-bold text-white hover:bg-orange-600" onClick={toggleOnline} disabled={onlineBusy}>
                <Power className="mr-2 h-5 w-5" /> {onlineBusy ? "Updating..." : userOnline ? "Go offline" : "Go online"}
              </Button>
              <Button variant="ghost" className="h-9 text-xs text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setAutoGps((value) => !value)}>
                <LocateFixed className="mr-2 h-4 w-4" /> {autoGps ? "Live GPS on" : "Share live GPS"}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Today's earnings" value={`₹${Number(dashboardSummary?.earningsToday ?? 0).toFixed(0)}`} detail={`${dashboardSummary?.earningsWeek ?? 0} this week`} />
          <SummaryCard label="Today's orders" value={String(dashboardSummary?.ordersToday ?? 0)} detail={`${dashboardSummary?.ordersWeek ?? 0} this week`} />
          <SummaryCard label="Online time" value={formatDuration(dashboardSummary?.onlineSecondsToday ?? 0)} detail={userOnline ? "Live now" : "Today"} />
          <SummaryCard label="Wallet balance" value={`₹${Number((user as any)?.walletBalance ?? dashboardSummary?.walletBalance ?? 0).toFixed(0)}`} detail="Available to withdraw" />
        </section>

        {currentOrder && <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Current delivery</p><h2 className="mt-1 text-lg font-black">{currentOrder.store?.name ?? "Assigned order"}</h2></div><Badge className="capitalize bg-white text-orange-700">{currentOrder.status.replace(/_/g, " ")}</Badge></div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Pickup</p><p className="font-semibold">{currentOrder.store?.address ?? "Seller location"}</p></div><div><p className="text-xs text-muted-foreground">Drop</p><p className="font-semibold">{(currentOrder as any).pickupAddress ?? (currentOrder as any).addressSnapshot?.city ?? "Customer location"}</p></div><div><p className="text-xs text-muted-foreground">Order earning</p><p className="font-bold">₹{Number(currentOrder.deliveryFee ?? 0).toFixed(0)}</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2"><Link href={`/track/${currentOrder.id}`}><Button className="bg-orange-500 hover:bg-orange-600"><Navigation className="mr-2 h-4 w-4" /> Navigate</Button></Link><Button variant="outline" onClick={() => document.getElementById("orders")?.scrollIntoView({ behavior: "smooth" })}>View order</Button></div>
        </section>}

        <section id="earnings" className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-bold">Earnings and performance</h2><p className="text-sm text-muted-foreground">Real completed-order earnings and saved online sessions.</p></div>
            <Link href="/delivery/wallet"><Button type="button" variant="outline">Open wallet</Button></Link>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <MetricTile label="This month" value={`₹${Number(dashboardSummary?.earningsMonth ?? 0).toFixed(0)}`} sub={`${formatDuration(dashboardSummary?.onlineSecondsMonth ?? 0)} online`} />
            <MetricTile label="Total earnings" value={`₹${Number(dashboardSummary?.totalEarnings ?? 0).toFixed(0)}`} sub={`${dashboardSummary?.totalCompletedOrders ?? 0} completed orders`} />
            <MetricTile label="Orders this month" value={String(dashboardSummary?.ordersMonth ?? 0)} sub={`${dashboardSummary?.ordersToday ?? 0} completed today`} />
          </div>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardSummary?.daily ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number, name: string) => [name === "earnings" ? `₹${Number(value).toFixed(0)}` : name === "onlineHours" ? `${Number(value).toFixed(1)} h` : value, name]} />
                <Bar dataKey="earnings" name="Earnings" fill="#ff6500" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completedOrders" name="Orders" fill="#155eef" radius={[4, 4, 0, 0]} />
                <Bar dataKey="onlineHours" name="Online hours" fill="#00a86b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section id="orders" className="grid scroll-mt-20 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0 rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="font-bold">Orders</h2><p className="text-xs text-muted-foreground">Your delivery queue</p></div>
              <Badge variant="outline">{visibleOrders.length}</Badge>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-1">
              {([['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setOrderFilter(value)} className={`rounded-lg px-2 py-2 text-xs font-bold ${orderFilter === value ? "bg-white text-orange-600 shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div>
            ) : !visibleOrders.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
                {orderFilter === "active" ? "No active orders right now." : orderFilter === "completed" ? "You have not completed any deliveries yet." : "No cancelled orders."}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order: any) => (
                  <div key={order.id} className="rounded-lg border p-3 shadow-sm sm:p-4">
                    {(() => {
                      const assigned = Boolean(order.liveTracking?.lifecycle?.assignedDeliveryPartnerId);
                      const goingToCustomer = ["picked_up", "on_the_way", "arriving"].includes(order.status);
                      const destinationLabel = goingToCustomer ? "Customer" : "Shop";
                      return <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline">{assigned ? "Assigned to you" : "Available request"}</Badge><Badge variant="outline">Next: {destinationLabel}</Badge></div>;
                    })()}
                    {order.store?.bannerUrl ? (
                      <div className="mb-3 overflow-hidden rounded-lg border bg-gray-50">
                        <img src={order.store.bannerUrl} alt={`${order.store?.name ?? "Pickup shop"} front`} className="h-40 w-full object-cover sm:h-48" loading="lazy" decoding="async" />
                        <div className="flex items-center gap-2 border-t bg-white px-3 py-2">
                          <Camera className="h-4 w-4 text-orange-600" />
                          <span className="text-xs font-semibold">Pickup shop front photo</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                        Shop front photo is not available. Confirm the pickup address before travelling.
                      </div>
                    )}
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
                        <p className="text-xs text-muted-foreground">{order.pickupAddress ?? order.addressSnapshot?.line1}, {order.addressSnapshot?.city}</p>
                        {order.pickupLatitude && order.pickupLongitude && (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            {Number(order.pickupLatitude).toFixed(5)}, {Number(order.pickupLongitude).toFixed(5)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Link href={`/track/${order.id}`}>
                        <Button className="w-full sm:w-auto" variant="outline" size="sm"><Navigation className="mr-2 h-4 w-4" /> Track map</Button>
                      </Link>
                      {(["picked_up", "on_the_way", "arriving"].includes(order.status) ? order.pickupLatitude && order.pickupLongitude : order.store?.lat && order.store?.lng) && (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${["picked_up", "on_the_way", "arriving"].includes(order.status) ? `${order.pickupLatitude},${order.pickupLongitude}` : `${order.store.lat},${order.store.lng}`}&travelmode=driving`} target="_blank" rel="noreferrer">
                          <Button className="w-full sm:w-auto" variant="outline" size="sm"><Navigation className="mr-2 h-4 w-4" /> {(["picked_up", "on_the_way", "arriving"].includes(order.status)) ? "Directions to customer" : "Directions to shop"}</Button>
                        </a>
                      )}
                      {["confirmed", "preparing"].includes(order.status) && !order.liveTracking?.lifecycle?.assignedDeliveryPartnerId && (
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
            <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
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
            <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
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
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden" aria-label="Delivery navigation">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          <BottomNavLink href="#top" label="Home" icon={<Home className="h-5 w-5" />} />
          <BottomNavLink href="#orders" label="Orders" icon={<Package className="h-5 w-5" />} />
          <BottomNavLink href="#earnings" label="Earnings" icon={<DollarSign className="h-5 w-5" />} />
          <BottomNavLink href="/delivery/wallet" label="Wallet" icon={<WalletCards className="h-5 w-5" />} />
          <BottomNavLink href="/delivery/profile" label="Profile" icon={<CircleUserRound className="h-5 w-5" />} />
        </div>
      </nav>
    </div>
  );
}

function BottomNavLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return <Link href={href} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600">{icon}<span>{label}</span></Link>;
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${secs}s`;
}

function SummaryCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`rounded-lg border bg-white p-4 shadow-sm ${accent ? "border-emerald-300" : ""}`}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-bold ${accent ? "text-emerald-700" : ""}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>;
}
