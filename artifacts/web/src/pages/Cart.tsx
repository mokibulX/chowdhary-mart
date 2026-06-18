import { useGetCart, useAddToCart, useClearCart, useValidateCoupon, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Tag, X } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

export default function Cart() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: string } | null>(null);

  const { data: cart, isLoading } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const addToCart = useAddToCart();
  const clearCart = useClearCart();
  const validateCoupon = useValidateCoupon();

  const items = cart?.items ?? [];

  const handleQty = (productId: number, qty: number) => {
    addToCart.mutate(
      { data: { productId, qty } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCartQueryKey() }) }
    );
  };

  const handleClear = () => {
    clearCart.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
        setAppliedCoupon(null);
        toast({ title: "Cart cleared" });
      },
    });
  };

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    validateCoupon.mutate(
      { data: { code: couponCode.toUpperCase(), orderValue: String(cart?.subtotal ?? 0) } },
      {
        onSuccess: (data) => {
          setAppliedCoupon({ code: couponCode.toUpperCase(), discount: data.discount });
          toast({ title: "Coupon applied!", description: `You save ₹${data.discount}` });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Invalid coupon";
          toast({ title: "Coupon error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const subtotal = Number(cart?.subtotal ?? 0);
  const deliveryFee = Number(cart?.deliveryFee ?? 0);
  const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
  const total = Math.max(0, subtotal + deliveryFee - couponDiscount);

  if (!user) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium text-lg mb-4">Please log in to view your cart</p>
        <Link href="/login"><Button>Sign In</Button></Link>
      </div>
    );
  }

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground opacity-40" />
        <p className="text-xl font-semibold text-muted-foreground">Your cart is empty</p>
        <Link href="/search"><Button>Browse Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Items */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">{items.length} item{items.length !== 1 ? "s" : ""} in cart</h1>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-600" data-testid="btn-clear-cart">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        </div>
        {cart?.store && (
          <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg text-sm">
            <span className="font-medium">Ordering from:</span>
            <Link href={`/store/${cart.storeId}`} className="text-primary hover:underline font-semibold">{(cart.store as any)?.name}</Link>
          </div>
        )}
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center gap-4 p-4 bg-white border rounded-xl shadow-sm">
            <div className="w-16 h-16 bg-gray-50 rounded-lg flex-shrink-0 overflow-hidden">
              {item.product?.images?.[0] ? (
                <img src={item.product.images[0]} alt={item.product.name} className="w-full h-full object-contain p-1" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-2">{item.product?.name ?? `Product #${item.productId}`}</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-bold text-sm">₹{Number(item.price).toFixed(0)}</span>
                {item.product?.mrp && Number(item.product.mrp) > Number(item.price) && (
                  <span className="text-xs text-muted-foreground line-through">₹{Number(item.product.mrp).toFixed(0)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleQty(item.productId, item.qty - 1)} data-testid={`btn-dec-${item.productId}`}>
                {item.qty === 1 ? <Trash2 className="h-3 w-3 text-red-500" /> : <Minus className="h-3 w-3" />}
              </Button>
              <span className="w-6 text-center font-bold text-sm">{item.qty}</span>
              <Button size="icon" className="h-8 w-8" onClick={() => handleQty(item.productId, item.qty + 1)} data-testid={`btn-inc-${item.productId}`}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-right flex-shrink-0 min-w-[60px]">
              <span className="font-bold text-sm">₹{(Number(item.price) * item.qty).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="space-y-4">
        {/* Coupon */}
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4 text-primary" />Apply Coupon</h3>
          {appliedCoupon ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <div>
                <span className="font-medium text-green-700 text-sm">{appliedCoupon.code}</span>
                <p className="text-xs text-green-600">Saving ₹{Number(appliedCoupon.discount).toFixed(0)}</p>
              </div>
              <button onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>
                <X className="w-4 h-4 text-green-600" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter code"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                className="text-sm"
                data-testid="input-coupon"
              />
              <Button variant="outline" size="sm" onClick={handleApplyCoupon} disabled={validateCoupon.isPending} data-testid="btn-apply-coupon">
                Apply
              </Button>
            </div>
          )}
        </div>

        {/* Bill summary */}
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Bill Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({items.length} items)</span><span>₹{subtotal.toFixed(0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className={deliveryFee === 0 ? "text-green-600 font-medium" : ""}>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee.toFixed(0)}`}</span></div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-green-600"><span>Coupon discount</span><span>-₹{couponDiscount.toFixed(0)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>₹{total.toFixed(0)}</span></div>
          </div>
          <Link
            href={`/checkout${appliedCoupon ? `?coupon=${appliedCoupon.code}` : ""}`}
            data-testid="btn-checkout"
          >
            <Button className="w-full" size="lg">
              Proceed to Checkout <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Link href="/coupons" className="text-xs text-primary text-center block hover:underline">
            View all offers
          </Link>
        </div>
      </div>
    </div>
  );
}
