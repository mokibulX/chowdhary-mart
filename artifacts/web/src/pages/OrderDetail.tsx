import { useParams, Link } from "wouter";
import { useGetOrder, useCancelOrder, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, ChevronRight, X, Navigation, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  on_the_way: "bg-cyan-100 text-cyan-700", preparing: "bg-orange-100 text-orange-700",
  confirmed: "bg-blue-100 text-blue-700", pending: "bg-yellow-100 text-yellow-700",
};

const TRACKING_STEPS = ["confirmed", "preparing", "packed", "picked_up", "on_the_way", "delivered"];

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id && !!user, queryKey: getGetOrderQueryKey(id), refetchInterval: 4000 },
  });
  const cancelOrder = useCancelOrder();

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!order) return <div className="text-center py-16 text-muted-foreground">Order not found.</div>;

  const canCancel = !["delivered", "cancelled"].includes(order.status);
  const returnRequestAvailable = Boolean((order as any).returnRequestAvailable)
    || (!["delivered", "cancelled", "returned"].includes(order.status)
      && Date.now() - new Date(order.createdAt).getTime() >= 60 * 60_000);
  const tracking = (order as any).tracking;
  const currentStep = TRACKING_STEPS.indexOf(order.status);

  const handleCancel = () => {
    if (!cancelReason.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
    cancelOrder.mutate(
      { orderId: id, data: { reason: cancelReason } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
          qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          setCancelOpen(false);
          toast({ title: "Order cancelled" });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Cancellation failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const items = (order as any).items ?? [];
  const deliveryAddress = (order as any).address ?? (order as any).addressSnapshot;
  const pickupLat = Number((order as any).pickupLatitude ?? deliveryAddress?.lat);
  const pickupLng = Number((order as any).pickupLongitude ?? deliveryAddress?.lng);
  const pickupAddress = (order as any).pickupAddress ?? deliveryAddress?.line1;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Order #{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Badge className={`${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"} border-0 px-3 py-1`}>
          {order.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
        </Badge>
      </div>

      {/* Tracking Timeline */}
      {order.status !== "cancelled" && (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Order Progress</h2>
            <Link href={`/track/${id}`}>
              <Button variant="ghost" size="sm" className="text-primary" data-testid="btn-track">
                <Navigation className="w-3 h-3 mr-1" />Track Live
              </Button>
            </Link>
          </div>
          {tracking?.deliveryOtp && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
              <p className="text-sm font-semibold">Delivery OTP</p>
              <p className="mt-1 text-2xl font-bold tracking-widest">{tracking.deliveryOtp}</p>
              <p className="text-xs">Share this code only after the delivery partner reaches you with the order.</p>
            </div>
          )}
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-gray-100" />
            {TRACKING_STEPS.map((step, i) => {
              const done = i <= currentStep;
              const current = i === currentStep;
              return (
                <div key={step} className="relative flex items-center gap-3 pb-4 last:pb-0">
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 ${done ? "bg-primary border-primary" : "bg-white border-gray-200"}`}>
                    {done && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div className={current ? "font-semibold text-sm" : "text-sm text-muted-foreground"}>
                    {step === "picked_up" ? "Out for delivery" : step.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    {current && order.estimatedDeliveryMins && step !== "delivered" && (
                      <span className="text-xs text-primary ml-1">(~{order.estimatedDeliveryMins} min)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Items ({items.length})</h2>
        {items.map((item: any) => (
          <Link key={item.id} href={`/product/${item.productId}`} className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-gray-50">
            <div className="w-12 h-12 bg-gray-50 rounded-lg flex-shrink-0">
              {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{item.name}</p>
              {(item.selectedSize || item.selectedColor) && (
                <p className="text-xs text-muted-foreground">
                  {[item.selectedSize ? `Size: ${item.selectedSize}` : "", item.selectedColor ? `Color: ${item.selectedColor}` : ""].filter(Boolean).join(" | ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Qty: {item.qty} × ₹{Number(item.price).toFixed(0)}</p>
            </div>
            <p className="font-medium text-sm">₹{Number(item.total).toFixed(0)}</p>
          </Link>
        ))}
      </div>

      {/* Bill */}
      <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-semibold mb-2">Bill Summary</h2>
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{Number(order.subtotal).toFixed(0)}</span></div>
        {Number((order as any).platformFee ?? (order as any).commissionAmount ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span>₹{Number((order as any).platformFee ?? (order as any).commissionAmount).toFixed(2)}</span></div>}
        {(order as any).calculatedDistanceKm != null && <div className="flex justify-between text-xs text-muted-foreground"><span>Delivery distance</span><span>{Number((order as any).calculatedDistanceKm).toFixed(2)} km</span></div>}
        <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className={Number(order.deliveryFee) === 0 ? "text-green-600" : ""}>{Number(order.deliveryFee) === 0 ? "FREE" : `₹${Number(order.deliveryFee).toFixed(0)}`}</span></div>
        {order.couponCode && <div className="flex justify-between text-green-600"><span>Coupon ({order.couponCode})</span><span>-₹{Number(order.couponDiscount).toFixed(0)}</span></div>}
        {order.walletUsed && Number(order.walletUsed) > 0 && <div className="flex justify-between text-green-600"><span>Wallet</span><span>-₹{Number(order.walletUsed).toFixed(0)}</span></div>}
        <Separator />
        <div className="flex justify-between font-bold text-base"><span>Total Paid</span><span>₹{Number(order.total).toFixed(0)}</span></div>
        <div className="flex justify-between text-xs text-muted-foreground"><span>Payment</span><span className="capitalize">{order.paymentMethod?.replace(/_/g, " ")} · {order.paymentStatus}</span></div>
        {Number(order.loyaltyPointsEarned ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-600 font-medium mt-1">
            <Star className="w-3 h-3" />{order.loyaltyPointsEarned} loyalty points earned
          </div>
        )}
      </div>

      {/* Delivery Address */}
      {deliveryAddress && (
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-2"><MapPin className="w-4 h-4 text-primary" />Confirmed Pickup Location</h2>
          {(deliveryAddress as any).photoUrl && (
            <img src={(deliveryAddress as any).photoUrl} alt="Delivery place" className="mb-3 h-32 w-full rounded-lg object-cover" />
          )}
          <p className="text-sm">{deliveryAddress.name}</p>
          <p className="text-sm text-muted-foreground">{pickupAddress}, {deliveryAddress.city} - {deliveryAddress.pincode}</p>
          {Number.isFinite(pickupLat) && Number.isFinite(pickupLng) && (
            <div className="mt-2 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className="text-emerald-700">GPS: {pickupLat.toFixed(5)}, {pickupLng.toFixed(5)}</p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${pickupLat},${pickupLng}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline"><Navigation className="mr-2 h-4 w-4" />Open in Maps</Button>
              </a>
            </div>
          )}
        </div>
      )}

      {canCancel && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelOpen(true)} data-testid="btn-cancel">
          <X className="w-4 h-4 mr-2" />Cancel Order
        </Button>
      )}

      {returnRequestAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Return request available</p>
          <p className="mt-1 text-sm text-amber-900">This order has not been delivered within 1 hour. You can submit a return request for the delayed delivery.</p>
          <Link href={`/returns?orderId=${id}`}>
            <Button className="mt-3 bg-amber-600 text-white hover:bg-amber-700">Request a return</Button>
          </Link>
        </div>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for cancellation..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} data-testid="input-cancel-reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Order</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelOrder.isPending}>Confirm Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
