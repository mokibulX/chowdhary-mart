import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateAddress,
  useGetCart,
  useListAddresses,
  usePlaceOrder,
  useUpdateAddress,
  getGetCartQueryKey,
  getListAddressesQueryKey,
  getListOrdersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Camera, CreditCard, MapPin, Plus, ShieldCheck, Truck, Zap } from "lucide-react";
import { getSavedDeliveryLocation } from "@/lib/pincode";
import { fileToDataUrl, getBrowserLocation } from "@/lib/live-location";

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery", icon: Truck, desc: "Pay when delivered" },
  { value: "upi", label: "Online Payment", icon: CreditCard, desc: "UPI, cards, netbanking and wallets via Razorpay" },
] as const;
const DEFAULT_DELIVERY_PHOTO = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80";

function getErrorMessage(err: unknown, fallback: string) {
  return (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
    ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    ?? fallback;
}

export default function Checkout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const couponCode = params.get("coupon") ?? undefined;

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "upi">("cod");
  const [onlinePaid, setOnlinePaid] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [providerPaymentId, setProviderPaymentId] = useState("");
  const [locationSaving, setLocationSaving] = useState(false);
  const [deliveryPhoto, setDeliveryPhoto] = useState("");

  const { data: cart, isLoading: loadingCart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const { data: addresses, isLoading: loadingAddresses } = useListAddresses({ query: { enabled: !!user, queryKey: getListAddressesQueryKey() } });
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const placeOrder = usePlaceOrder();

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p>Please <Link href="/login" className="text-primary underline">log in</Link> to checkout</p>
      </div>
    );
  }

  if (loadingCart || loadingAddresses) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  const defaultAddress = addresses?.find((address) => address.isDefault) ?? addresses?.[0];
  const activeAddressId = selectedAddressId ?? defaultAddress?.id ?? null;
  const activeAddress = addresses?.find((address) => address.id === activeAddressId);

  const subtotal = Number(cart?.subtotal ?? 0);
  const deliveryFee = Number(cart?.deliveryFee ?? 0);
  const total = Math.max(0, subtotal + deliveryFee);
  const sellerActive = !(cart as any)?.store || (cart as any).store?.isOpen !== false;
  const activeAddressPhoto = activeAddress ? ((activeAddress as any).photoUrl as string | undefined) : "";
  const visibleDeliveryPhoto = deliveryPhoto || activeAddressPhoto || "";
  const orderDeliveryPhoto = visibleDeliveryPhoto || DEFAULT_DELIVERY_PHOTO;

  const handleDeliveryPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setDeliveryPhoto(dataUrl);
      toast({ title: "Delivery place photo added" });
    } catch (error) {
      toast({ title: "Photo could not be added", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handlePlaceOrder = async () => {
    if (!sellerActive) {
      toast({ title: "Seller is not active", description: "This seller is not accepting orders right now.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "upi" && !onlinePaid) {
      toast({ title: "Complete online payment", description: "Pay securely with Razorpay before placing this prepaid order.", variant: "destructive" });
      return;
    }
    let orderAddressId = activeAddressId;
    setLocationSaving(true);

    let liveLocation;
    try {
      liveLocation = await getBrowserLocation();
    } catch (error) {
      const savedLocation = getSavedDeliveryLocation();
      liveLocation = {
        lat: Number((activeAddress as any)?.lat ?? savedLocation.lat ?? 22.5726),
        lng: Number((activeAddress as any)?.lng ?? savedLocation.lng ?? 88.3639),
        accuracy: Number((activeAddress as any)?.locationAccuracy ?? 120),
        capturedAt: new Date().toISOString(),
      };
      toast({ title: "GPS fallback used", description: "Saved pincode/address location diye order continue holo." });
    }

    if (!orderAddressId) {
      try {
        const savedLocation = getSavedDeliveryLocation();
        const generatedAddress = await createAddress.mutateAsync({
          data: {
            label: "home",
            name: user.name || "Customer",
            phone: user.phone || "9999999999",
            line1: "Current delivery location",
            line2: savedLocation.area,
            city: savedLocation.city,
            state: savedLocation.state,
            pincode: savedLocation.pincode,
            lat: liveLocation.lat,
            lng: liveLocation.lng,
            locationAccuracy: liveLocation.accuracy,
            locationCapturedAt: liveLocation.capturedAt,
            photoUrl: orderDeliveryPhoto,
            isDefault: true,
          } as any,
        });
        orderAddressId = generatedAddress.id;
        qc.invalidateQueries({ queryKey: getListAddressesQueryKey() });
      } catch {
        setLocationSaving(false);
        toast({ title: "Delivery address could not be prepared", variant: "destructive" });
        return;
      }
    } else if (activeAddress) {
      try {
        await updateAddress.mutateAsync({
          addressId: orderAddressId,
          data: {
            label: activeAddress.label ?? "home",
            name: activeAddress.name,
            phone: activeAddress.phone,
            line1: activeAddress.line1,
            line2: activeAddress.line2 ?? "",
            city: activeAddress.city,
            state: activeAddress.state,
            pincode: activeAddress.pincode,
            lat: liveLocation.lat,
            lng: liveLocation.lng,
            locationAccuracy: liveLocation.accuracy,
            locationCapturedAt: liveLocation.capturedAt,
            photoUrl: orderDeliveryPhoto,
            isDefault: !!activeAddress.isDefault,
          } as any,
        });
        qc.invalidateQueries({ queryKey: getListAddressesQueryKey() });
      } catch {
        setLocationSaving(false);
        toast({ title: "Could not update live delivery location", variant: "destructive" });
        return;
      }
    }

    placeOrder.mutate(
      {
        data: {
          addressId: orderAddressId,
          paymentMethod: paymentMethod === "upi" ? "online" : "cod",
          couponCode,
          useWallet: false,
          providerPaymentId,
        } as any,
      },
      {
        onSuccess: (order) => {
          setLocationSaving(false);
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          setLocation(`/orders/${order.id}/confirmed`);
        },
        onError: (err: unknown) => {
          setLocationSaving(false);
          const msg = getErrorMessage(err, "Order failed");
          toast({ title: "Order failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge className="mb-2 bg-green-100 text-green-700 hover:bg-green-100">40 min delivery</Badge>
            <h1 className="text-2xl font-bold">Chowdhary Mart Checkout</h1>
            <p className="text-sm text-muted-foreground">Address, payment and live tracking in one smooth flow.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border bg-gray-50 p-2"><Zap className="mx-auto mb-1 h-4 w-4 text-primary" />Fast</div>
            <div className="rounded-md border bg-gray-50 p-2"><ShieldCheck className="mx-auto mb-1 h-4 w-4 text-emerald-600" />Secure</div>
            <div className="rounded-md border bg-gray-50 p-2"><Truck className="mx-auto mb-1 h-4 w-4 text-blue-600" />Live</div>
          </div>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" />Delivery Address</h2>
          <Link href="/addresses">
            <Button variant="ghost" size="sm" className="text-primary"><Plus className="mr-1 h-3 w-3" />Add New</Button>
          </Link>
        </div>
        {!addresses?.length ? (
          <div className="rounded-lg border border-dashed bg-orange-50 p-3 text-sm text-muted-foreground">
            No saved address yet. Quick checkout will use your current delivery location automatically.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">Fresh GPS location will be captured when you place the order.</p>
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${activeAddressId === address.id ? "border-primary bg-orange-50" : "hover:border-gray-300"}`}
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
                  <div className="flex items-center gap-2 font-medium">
                    {address.name}
                    {address.label && <Badge variant="secondary" className="text-[10px]">{address.label}</Badge>}
                    {address.isDefault && <Badge className="border-primary/20 bg-primary/10 text-[10px] text-primary">Default</Badge>}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city} - {address.pincode}</p>
                  <p className="text-muted-foreground">{address.phone}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="rounded-lg border bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Delivery place photo</p>
              <p className="text-xs text-muted-foreground">Gate, building, shop front or handover point.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center rounded-md border bg-white px-3 py-2 text-sm font-medium">
              <Camera className="mr-1.5 h-4 w-4" />
              {visibleDeliveryPhoto ? "Change" : "Add"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleDeliveryPhotoChange} />
            </label>
          </div>
          {visibleDeliveryPhoto && <img src={visibleDeliveryPhoto} alt="Delivery place" className="mt-3 h-32 w-full rounded-lg object-cover" />}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-primary" />Payment Method</h2>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(({ value, label, icon: Icon, desc }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${paymentMethod === value ? "border-primary bg-orange-50" : "hover:border-gray-300"}`}
            >
              <input
                type="radio"
                name="payment"
                value={value}
                checked={paymentMethod === value}
                onChange={() => {
                  setPaymentMethod(value);
                  setOnlinePaid(false);
                  setProviderPaymentId("");
                }}
                className="accent-primary"
                data-testid={`radio-${value}`}
              />
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </label>
          ))}
        </div>
        {paymentMethod === "upi" && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="text-xs font-semibold text-blue-900">Razorpay secure checkout</label>
                <p className="mt-1 text-sm text-blue-800">Amount is verified again on backend from your cart. Secret keys are never exposed in browser.</p>
                {providerPaymentId && <p className="mt-1 text-xs font-semibold text-green-700">Payment verified: {providerPaymentId}</p>}
              </div>
              <Button
                type="button"
                className="self-end bg-[#0757ee] hover:bg-[#0647c7]"
                disabled={paymentBusy || onlinePaid}
                onClick={async () => {
                  setPaymentBusy(true);
                  try {
                    const paymentOrder = await customFetch<any>("/api/payments/razorpay/order", { method: "POST", responseType: "json" });
                    await openRazorpayCheckout({
                      order: paymentOrder,
                      user,
                      onSuccess: async (response) => {
                        const verified = await customFetch<any>("/api/payments/razorpay/verify", {
                          method: "POST",
                          body: JSON.stringify(response),
                          responseType: "json",
                        });
                        setOnlinePaid(true);
                        setProviderPaymentId(verified.providerPaymentId ?? response.razorpay_payment_id);
                        toast({ title: "Payment verified", description: "You can now place the prepaid order." });
                      },
                    });
                  } catch (error) {
                    toast({ title: "Payment failed", description: getErrorMessage(error, "Razorpay payment could not be completed."), variant: "destructive" });
                  } finally {
                    setPaymentBusy(false);
                  }
                }}
              >
                {onlinePaid ? "Paid" : paymentBusy ? "Opening..." : `Pay Rs.${total.toFixed(0)}`}
              </Button>
            </div>
            <p className="mt-2 text-xs text-blue-700">Supports UPI/cards/netbanking/wallets enabled in your Razorpay account.</p>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Delivery policy</h2>
        <p>Chowdhary Mart currently serves addresses within 5 km of the local store/storage hub. Delivery target is 40 minutes, depending on address accuracy, traffic and partner availability.</p>
        <p>If delivery cannot be completed because of customer unavailability, wrong address, local restriction or similar reasons, the order remains payable and must be accepted when re-attempted or collected. Returns are accepted only for damaged items reported with proof.</p>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Bill Summary</h2>
        {cart?.store && (
          <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{(cart.store as any).name}</span></p>
        )}
        {!sellerActive && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            Seller is not active. This order cannot be placed right now.
          </div>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({cart?.itemCount} items)</span><span>Rs.{subtotal.toFixed(0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className={deliveryFee === 0 ? "text-green-600" : ""}>{deliveryFee === 0 ? "FREE" : `Rs.${deliveryFee.toFixed(0)}`}</span></div>
          {couponCode && <div className="flex justify-between text-green-600"><span>Coupon ({couponCode})</span><span>Applied</span></div>}
          <Separator />
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>Rs.{total.toFixed(0)}</span></div>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={handlePlaceOrder}
          disabled={placeOrder.isPending || createAddress.isPending || updateAddress.isPending || locationSaving || !cart?.items?.length}
          data-testid="btn-place-order"
        >
          {placeOrder.isPending || createAddress.isPending || updateAddress.isPending || locationSaving ? "Capturing location..." : `Place order and track live - Rs.${total.toFixed(0)}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">No extra confirmation screen. You will go straight to live delivery tracking.</p>
      </section>
    </div>
  );
}

async function loadRazorpayScript() {
  if ((window as any).Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

async function openRazorpayCheckout({ order, user, onSuccess }: { order: any; user: any; onSuccess: (response: any) => Promise<void> }) {
  await loadRazorpayScript();
  await new Promise<void>((resolve, reject) => {
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay || !order?.keyId) {
      reject(new Error("Razorpay public key is missing"));
      return;
    }
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.providerOrderId,
      prefill: { name: user?.name, email: user?.email, contact: user?.phone },
      theme: { color: "#0757ee" },
      handler: async (response: any) => {
        try {
          await onSuccess(response);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    checkout.open();
  });
}
