import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetCart, useListAddresses, usePlaceOrder, getGetCartQueryKey, getListAddressesQueryKey, getListOrdersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, CreditCard, Wallet, Truck, Plus, CheckCircle } from "lucide-react";
import { Link } from "wouter";

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery", icon: Truck, desc: "Pay when delivered" },
  { value: "upi", label: "UPI / Online", icon: CreditCard, desc: "PhonePe, GPay, Paytm" },
  { value: "wallet", label: "Wallet", icon: Wallet, desc: "Use your balance" },
] as const;

export default function Checkout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const couponCode = params.get("coupon") ?? undefined;

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "upi" | "wallet">("cod");
  const [useWallet, setUseWallet] = useState(false);

  const { data: cart, isLoading: loadingCart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const { data: addresses, isLoading: loadingAddresses } = useListAddresses({ query: { enabled: !!user, queryKey: getListAddressesQueryKey() } });
  const placeOrder = usePlaceOrder();

  if (!user) { return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">log in</Link> to checkout</p></div>; }
  if (loadingCart || loadingAddresses) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  const defaultAddress = addresses?.find(a => a.isDefault) ?? addresses?.[0];
  const activeAddressId = selectedAddressId ?? defaultAddress?.id ?? null;

  const subtotal = Number(cart?.subtotal ?? 0);
  const deliveryFee = Number(cart?.deliveryFee ?? 0);
  const walletBalance = Number(user.walletBalance ?? 0);
  const walletUsable = useWallet ? Math.min(walletBalance, subtotal + deliveryFee) : 0;
  const total = Math.max(0, subtotal + deliveryFee - walletUsable);

  const handlePlaceOrder = () => {
    if (!activeAddressId) {
      toast({ title: "Select an address", variant: "destructive" });
      return;
    }
    placeOrder.mutate(
      {
        data: {
          addressId: activeAddressId,
          paymentMethod,
          couponCode,
          useWallet,
        },
      },
      {
        onSuccess: (order) => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "Order placed!", description: `Order #${order.orderNumber} confirmed` });
          setLocation(`/orders/${order.id}`);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Order failed";
          toast({ title: "Order failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {/* Delivery Address */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />Delivery Address</h2>
          <Link href="/addresses"><Button variant="ghost" size="sm" className="text-primary"><Plus className="w-3 h-3 mr-1" />Add New</Button></Link>
        </div>
        {!addresses?.length ? (
          <p className="text-sm text-muted-foreground">No saved addresses. <Link href="/addresses" className="text-primary underline">Add one</Link></p>
        ) : (
          <div className="space-y-2">
            {addresses.map(address => (
              <label
                key={address.id}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${activeAddressId === address.id ? "border-primary bg-orange-50" : "hover:border-gray-300"}`}
              >
                <input
                  type="radio"
                  name="address"
                  checked={activeAddressId === address.id}
                  onChange={() => setSelectedAddressId(address.id)}
                  className="mt-1 accent-primary"
                  data-testid={`radio-address-${address.id}`}
                />
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2">
                    {address.name}
                    {address.label && <Badge variant="secondary" className="text-[10px]">{address.label}</Badge>}
                    {address.isDefault && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">Default</Badge>}
                  </div>
                  <p className="text-muted-foreground mt-0.5">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city} - {address.pincode}</p>
                  <p className="text-muted-foreground">{address.phone}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Payment Method */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" />Payment Method</h2>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(({ value, label, icon: Icon, desc }) => (
            <label
              key={value}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${paymentMethod === value ? "border-primary bg-orange-50" : "hover:border-gray-300"}`}
            >
              <input type="radio" name="payment" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} className="accent-primary" data-testid={`radio-${value}`} />
              <Icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </label>
          ))}
        </div>
        {walletBalance > 0 && (
          <label className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer">
            <input type="checkbox" checked={useWallet} onChange={e => setUseWallet(e.target.checked)} className="accent-primary" data-testid="checkbox-wallet" />
            <div className="text-sm">
              <span className="font-medium">Use wallet balance: ₹{walletBalance.toFixed(0)}</span>
              {useWallet && <span className="text-green-600 ml-2">(Saving ₹{walletUsable.toFixed(0)})</span>}
            </div>
          </label>
        )}
      </section>

      {/* Bill Summary */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Bill Summary</h2>
        {cart?.store && (
          <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{(cart.store as any).name}</span></p>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({cart?.itemCount} items)</span><span>₹{subtotal.toFixed(0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className={deliveryFee === 0 ? "text-green-600" : ""}>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee.toFixed(0)}`}</span></div>
          {useWallet && walletUsable > 0 && <div className="flex justify-between text-green-600"><span>Wallet used</span><span>-₹{walletUsable.toFixed(0)}</span></div>}
          {couponCode && <div className="flex justify-between text-green-600"><span>Coupon ({couponCode})</span><span>Applied</span></div>}
          <Separator />
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>₹{total.toFixed(0)}</span></div>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={handlePlaceOrder}
          disabled={placeOrder.isPending || !cart?.items?.length}
          data-testid="btn-place-order"
        >
          {placeOrder.isPending ? "Placing Order..." : `Place Order · ₹${total.toFixed(0)}`}
        </Button>
        <p className="text-xs text-center text-muted-foreground">By placing order, you agree to our terms & conditions</p>
      </section>
    </div>
  );
}
