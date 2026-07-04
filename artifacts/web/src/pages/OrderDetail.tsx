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
    query: { enabled: !!id && !!user, queryKey: getGetOrderQueryKey(id) },
  });
  const cancelOrder = useCancelOrder();

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!order) return <div className="text-center py-16 text-muted-foreground">Order not found.</div>;

  const canCancel = !["delivered", "cancelled"].includes(order.status);
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
                    {step.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
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
      {(order as any).address && (
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-2"><MapPin className="w-4 h-4 text-primary" />Delivery Address</h2>
          <p className="text-sm">{(order as any).address.name}</p>
          <p className="text-sm text-muted-foreground">{(order as any).address.line1}, {(order as any).address.city} - {(order as any).address.pincode}</p>
        </div>
      )}

      {canCancel && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelOpen(true)} data-testid="btn-cancel">
          <X className="w-4 h-4 mr-2" />Cancel Order
        </Button>
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
