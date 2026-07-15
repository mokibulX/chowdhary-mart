import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  useAddToCart,
  useAddToWishlist,
  useCreateReview,
  useGetCart,
  useGetProduct,
  useGetProductReviews,
  useGetWishlist,
  useListOrders,
  useListProducts,
  useRemoveFromWishlist,
  getGetCartQueryKey,
  getGetProductQueryKey,
  getGetProductReviewsQueryKey,
  getGetWishlistQueryKey,
  getListOrdersQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/ProductCard";
import { BadgePercent, Heart, LocateFixed, Minus, PackageCheck, Plus, RotateCcw, Shield, ShoppingCart, Star, Store, Truck, Zap } from "lucide-react";
import { getSavedDeliveryLocation, nearestDeliveryLocation, saveDeliveryLocation, type DeliveryLocation } from "@/lib/pincode";
import { getBrowserLocation } from "@/lib/live-location";

const COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#facc15",
  brown: "#92400e",
  grey: "#9ca3af",
  gray: "#9ca3af",
  navy: "#1e3a8a",
  pink: "#ec4899",
  purple: "#9333ea",
  orange: "#f97316",
  beige: "#d6b98c",
  gold: "#d4af37",
  silver: "#c0c0c0",
};

function normalizeOptions(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(source.map((item) => String(item).trim()).filter(Boolean)));
}

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const id = Number(productId);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedImg, setSelectedImg] = useState(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation>(() => getSavedDeliveryLocation());
  const [locatingGps, setLocatingGps] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");

  const { data: product, isLoading } = useGetProduct(id, {
    query: { enabled: !!id, queryKey: getGetProductQueryKey(id) },
  });

  const similarParams = { categoryId: (product as any)?.categoryId || undefined, limit: 8 };
  const { data: similar } = useListProducts(similarParams, {
    query: { enabled: !!(product as any)?.categoryId, queryKey: getListProductsQueryKey(similarParams) },
  });

  const { data: reviews } = useGetProductReviews(id, {
    query: { enabled: !!id, queryKey: getGetProductReviewsQueryKey(id) },
  });
  const { data: cart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const { data: wishlist } = useGetWishlist({ query: { enabled: !!user, queryKey: getGetWishlistQueryKey() } });
  const { data: orders } = useListOrders({ limit: 50 }, { query: { enabled: !!user, queryKey: getListOrdersQueryKey({ limit: 50 }) } });

  const addToCart = useAddToCart();
  const createReview = useCreateReview();
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setSelectedImg(0);
  }, [id]);

  useEffect(() => {
    const syncLocation = () => setDeliveryLocation(getSavedDeliveryLocation());
    window.addEventListener("delivery-location-change", syncLocation);
    return () => window.removeEventListener("delivery-location-change", syncLocation);
  }, []);

  useEffect(() => {
    if (!product) return;
    const current = {
      id: product.id,
      name: product.name,
      price: product.price,
      mrp: product.mrp,
      discountPercent: product.discountPercent,
      images: (product as any).images ?? [],
      weight: (product as any).weight,
      unit: (product as any).unit,
      isAvailable: (product as any).isAvailable,
      storeId: (product as any).storeId,
    };
    try {
      const stored = localStorage.getItem("ekart_recent_products");
      const list = stored ? JSON.parse(stored) : [];
      const next = [current, ...list.filter((item: any) => item.id !== current.id)].slice(0, 10);
      localStorage.setItem("ekart_recent_products", JSON.stringify(next));
    } catch {
      localStorage.setItem("ekart_recent_products", JSON.stringify([current]));
    }
  }, [product]);

  useEffect(() => {
    setSelectedImg(0);
    setSelectedSize("");
    setSelectedColor("");
  }, [(product as any)?.id]);

  useEffect(() => {
    const colorImages = (product as any)?.colorImages && typeof (product as any).colorImages === "object" ? (product as any).colorImages : {};
    const colorImage = selectedColor ? colorImages[selectedColor] || colorImages[selectedColor.toLowerCase()] : "";
    const rotatingImages = [colorImage, ...((product as any)?.images ?? [])].filter(Boolean);
    if (rotatingImages.length <= 1) return;
    const timer = window.setInterval(() => {
      setSelectedImg((current) => (current + 1) % rotatingImages.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [(product as any)?.id, (product as any)?.images?.length, selectedColor]);

  useEffect(() => {
    if (!product) return;
    const nextSizes = normalizeOptions((product as any).sizes ?? (product as any).specifications?.Sizes ?? (product as any).specifications?.Size);
    const nextColors = normalizeOptions((product as any).colors ?? (product as any).specifications?.Colors ?? (product as any).specifications?.Color);
    setSelectedSize((current) => nextSizes.length ? (nextSizes.includes(current) ? current : nextSizes[0]) : "");
    setSelectedColor((current) => nextColors.length ? (nextColors.includes(current) ? current : nextColors[0]) : "");
  }, [(product as any)?.id, (product as any)?.sizes, (product as any)?.colors]);

  if (!product) {
    if (isLoading) {
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      );
    }
    return <div className="py-16 text-center text-muted-foreground">Product not found.</div>;
  }

  const isWishlisted = wishlist?.some((item: { productId: number }) => item.productId === id) ?? false;
  const baseImages = ((product as any).images ?? []).filter(Boolean);
  const colorImages = (product as any).colorImages && typeof (product as any).colorImages === "object" ? (product as any).colorImages : {};
  const discount = product.discountPercent ? Number(product.discountPercent) : 0;
  const available = (product as any).isAvailable !== false && (product as any).isAvailable !== 0;
  const sellerActive = !(product as any).store || (product as any).store?.isOpen !== false;
  const specs = (product as any).specifications && typeof (product as any).specifications === "object" ? Object.entries((product as any).specifications) : [];
  const similarProducts = (similar?.items ?? []).filter((item: any) => item.id !== id);
  const eligibleOrder = (orders ?? []).find((order: any) => order.status === "delivered" && (order.items ?? []).some((item: any) => Number(item.productId) === id));
  const sizes = normalizeOptions((product as any).sizes ?? (product as any).specifications?.Sizes ?? (product as any).specifications?.Size);
  const colors = normalizeOptions((product as any).colors ?? (product as any).specifications?.Colors ?? (product as any).specifications?.Color);
  const selectedColorImage = selectedColor ? colorImages[selectedColor] || colorImages[selectedColor.toLowerCase()] : "";
  const images = selectedColorImage
    ? [selectedColorImage, ...baseImages.filter((image: string) => image !== selectedColorImage)]
    : baseImages;
  const selectedImageUrl = images[selectedImg] ?? images[0] ?? "";
  const cartItem = cart?.items?.find((item: any) =>
    item.productId === id
    && (!sizes.length || String(item.selectedSize ?? "") === selectedSize)
    && (!colors.length || String(item.selectedColor ?? "") === selectedColor)
  );
  const qty = cartItem?.qty ?? 0;
  const returnWindow = (product as any).returnWindow || (product as any).returnPolicy || (product as any).specifications?.Return || "Damaged items only";
  const warranty = (product as any).warranty || (product as any).specifications?.Warranty || "Seller assured";
  const paymentOptions = (product as any).paymentOptions || (product as any).specifications?.Payment || "Cash on Delivery, UPI";
  const deliveryNote = (product as any).deliveryNote || (product as any).specifications?.Delivery || "40 minute local target";

  const requireOptions = () => {
    if (sizes.length && !selectedSize) {
      toast({ title: "Please select a size", variant: "destructive" });
      return false;
    }
    if (colors.length && !selectedColor) {
      toast({ title: "Please select a color", variant: "destructive" });
      return false;
    }
    return true;
  };

  const applyLiveGps = async () => {
    setLocatingGps(true);
    try {
      const gps = await getBrowserLocation();
      const nearest = nearestDeliveryLocation(gps.lat, gps.lng);
      const selected: DeliveryLocation = {
        ...nearest.location,
        area: `Live GPS near ${nearest.location.area}`,
        lat: gps.lat,
        lng: gps.lng,
        source: "gps",
        accuracy: gps.accuracy,
        capturedAt: gps.capturedAt,
      };
      saveDeliveryLocation(selected);
      setDeliveryLocation(selected);
      toast({ title: "Live location saved", description: `${nearest.location.pincode} selected from GPS.` });
    } catch (error) {
      toast({ title: "GPS failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLocatingGps(false);
    }
  };

  const handleAdd = () => {
    if (!user) { setLocation("/login"); return; }
    if (!sellerActive) {
      toast({ title: "Seller is not active", description: "This seller is not accepting orders right now.", variant: "destructive" });
      return;
    }
    if (!requireOptions()) return;
    addToCart.mutate(
      { data: { productId: id, qty: 1, selectedSize, selectedColor, selectedImageUrl } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          toast({ title: "Added to cart" });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
            ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Could not add to cart";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleAdjust = (newQty: number) => {
    addToCart.mutate(
      { data: { productId: id, qty: newQty, selectedSize, selectedColor, selectedImageUrl } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCartQueryKey() }) }
    );
  };

  const handleOrderNow = () => {
    if (!user) { setLocation("/login"); return; }
    if (!sellerActive) {
      toast({ title: "Seller is not active", description: "This seller is not accepting orders right now.", variant: "destructive" });
      return;
    }
    if (!requireOptions()) return;
    addToCart.mutate(
      { data: { productId: id, qty: Math.max(1, qty || 1), selectedSize, selectedColor, selectedImageUrl } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          setLocation("/checkout");
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
            ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Order failed";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleWishlist = () => {
    if (!user) { setLocation("/login"); return; }
    if (isWishlisted) {
      removeFromWishlist.mutate(
        { productId: id },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }) }
      );
    } else {
      addToWishlist.mutate(
        { data: { productId: id } },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }) }
      );
    }
  };

  const handleReviewSubmit = () => {
    if (!user) { setLocation("/login"); return; }
    if (!reviewBody.trim() && !reviewTitle.trim()) {
      toast({ title: "Review text required", variant: "destructive" });
      return;
    }
    if (!eligibleOrder) {
      toast({ title: "Delivered order required", description: "Product delivery complete hole tarpor verified review submit kora jabe.", variant: "destructive" });
      return;
    }
    createReview.mutate(
      {
        orderId: eligibleOrder.id,
        data: { productId: id, rating: reviewRating, title: reviewTitle || undefined, body: reviewBody || undefined, images: [] },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetProductReviewsQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetProductQueryKey(id) });
          setReviewTitle("");
          setReviewBody("");
          setReviewRating(5);
          toast({ title: "Review submitted", description: "Thanks for sharing your experience." });
        },
        onError: () => toast({ title: "Review failed", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden pb-28 md:space-y-6 md:pb-6">
      <section className="min-w-0 overflow-hidden rounded-[22px] border bg-white shadow-sm md:grid md:grid-cols-2 md:gap-6 md:p-6">
        <div className="min-w-0 space-y-3">
          <div className="relative aspect-square overflow-hidden bg-gray-50 md:rounded-lg">
            {discount > 0 && <Badge className="absolute left-3 top-3 z-10 bg-green-600 text-white">Bestseller</Badge>}
            {images[selectedImg] ? (
              <img src={images[selectedImg]} alt={product.name} className="h-full w-full object-contain p-6 md:p-8" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingCart className="h-16 w-16 text-gray-200" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-3 pb-1 md:px-0">
              {images.map((img: string, index: number) => (
                <button
                  key={img + index}
                  onClick={() => setSelectedImg(index)}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-colors ${selectedImg === index ? "border-[#0757ee]" : "border-gray-200"}`}
                >
                  <img src={img} alt="" className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
          {images.length > 1 && (
            <div className="flex justify-center gap-1 px-3 md:hidden">
              {images.slice(0, 6).map((_: string, index: number) => (
                <span key={index} className={`h-1.5 rounded-full ${index === selectedImg ? "w-5 bg-primary" : "w-1.5 bg-gray-300"}`} />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4 p-4 md:p-0">
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{(product as any).weight} {(product as any).unit}</p>
              <button onClick={handleWishlist} className={`rounded-full border p-2 ${isWishlisted ? "border-red-200 text-red-500" : "text-gray-600"}`} data-testid="btn-wishlist-icon">
                <Heart className={`h-5 w-5 ${isWishlisted ? "fill-red-500 stroke-red-500" : ""}`} />
              </button>
            </div>
            <h1 className="text-xl font-bold leading-tight md:text-2xl">{product.name}</h1>
            {product.rating && (
              <div className="mt-2 flex items-center gap-2">
                <Badge className="bg-green-600 text-white">
                  {Number(product.rating).toFixed(1)} <Star className="ml-1 h-3 w-3 fill-white" />
                </Badge>
                <span className="text-sm text-muted-foreground">{(product as any).reviewCount || 0} reviews</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            {discount > 0 && <span className="text-lg font-bold text-green-600">↓ {Math.round(discount)}%</span>}
            {product.mrp && Number(product.mrp) > Number(product.price) && (
              <>
                <span className="text-lg text-muted-foreground line-through">Rs.{Number(product.mrp).toFixed(0)}</span>
              </>
            )}
            <span className="text-3xl font-bold">Rs.{Number(product.price).toFixed(0)}</span>
          </div>

          {product.description && <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>}

          {!sellerActive && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              Seller is not active. This product cannot be ordered right now.
            </div>
          )}

          {sizes.length > 0 && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="mb-2 text-sm font-semibold">Select size</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size: string) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors ${selectedSize === size ? "border-primary bg-primary text-white" : "bg-white text-gray-800 hover:border-primary/50"}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="mb-2 text-sm font-semibold">Select color</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((color: string) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color);
                      setSelectedImg(0);
                    }}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors ${selectedColor === color ? "border-primary bg-primary text-white" : "bg-white text-gray-800 hover:border-primary/50"}`}
                  >
                    <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: COLOR_SWATCHES[color.toLowerCase()] ?? color }} />
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="font-medium text-green-600">Save extra with combo offers</p>
            {[
              ["Bank Offer", "10% off on selected cards"],
              ["No Cost EMI", `From Rs.${Math.max(99, Math.round(Number(product.price) / 9))}/m`],
            ].map(([title, text]) => (
              <div key={title} className="flex items-center gap-3 rounded-lg border p-3">
                <BadgePercent className="h-7 w-7 rounded-full bg-green-100 p-1.5 text-green-600" />
                <div className="flex-1">
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
                <span className="text-xl text-muted-foreground">{">"}</span>
              </div>
            ))}
          </div>

          <Separator />
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Truck className="mt-1 h-5 w-5 text-[#0757ee]" />
                <div>
                  <p className="font-semibold">
                    {deliveryLocation.pincode ? `Deliver to: ${deliveryLocation.area} - ${deliveryLocation.pincode}` : "Select live delivery location"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {deliveryLocation.source === "gps" ? "Live GPS saved" : "Use GPS or pincode"} | Delivery in <span className="font-semibold text-gray-950">40 minutes</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="sm" onClick={applyLiveGps} disabled={locatingGps}>
                  <LocateFixed className="mr-1 h-4 w-4" /> {locatingGps ? "GPS..." : "GPS"}
                </Button>
                <Link href="/addresses"><Button variant="secondary" size="sm">Change</Button></Link>
              </div>
            </div>
          </div>

          {eligibleOrder && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="mb-2 text-sm font-semibold text-green-800">Review this delivered product</p>
              <div className="mb-2 flex gap-1">
                {Array.from({ length: 5 }).map((_, index) => {
                  const value = index + 1;
                  return (
                    <button key={value} type="button" onClick={() => setReviewRating(value)} className="p-0.5">
                      <Star className={`h-5 w-5 ${value <= reviewRating ? "fill-amber-400 stroke-amber-400" : "stroke-gray-300"}`} />
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                <Input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} placeholder="Review title" />
                <Textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} placeholder="Share product quality and delivery experience..." />
                <Button size="sm" onClick={handleReviewSubmit} disabled={createReview.isPending}>
                  {createReview.isPending ? "Submitting..." : "Submit Review"}
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-center text-xs sm:grid-cols-4">
            <div className="min-w-0 space-y-1"><RotateCcw className="mx-auto h-5 w-5 text-[#0757ee]" /><span className="block leading-tight">{returnWindow}</span></div>
            <div className="min-w-0 space-y-1"><PackageCheck className="mx-auto h-5 w-5 text-[#0757ee]" /><span className="block leading-tight">{paymentOptions}</span></div>
            <div className="min-w-0 space-y-1"><Shield className="mx-auto h-5 w-5 text-[#0757ee]" /><span className="block leading-tight">{warranty}</span></div>
            <div className="min-w-0 space-y-1"><Zap className="mx-auto h-5 w-5 text-[#0757ee]" /><span className="block leading-tight">{deliveryNote}</span></div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            {(product as any).storeId && (
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                <Link href={`/store/${(product as any).storeId}`} className="text-primary hover:underline">View seller store</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 rounded-lg border bg-white p-3 shadow-sm">
        {qty > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border p-1">
            <Button variant="ghost" size="icon" onClick={() => handleAdjust(qty - 1)} data-testid="btn-decrease"><Minus className="h-4 w-4" /></Button>
            <span className="flex-1 text-center text-lg font-bold">{qty}</span>
            <Button variant="ghost" size="icon" onClick={() => handleAdjust(qty + 1)} data-testid="btn-increase"><Plus className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button size="lg" variant="outline" onClick={handleAdd} disabled={addToCart.isPending || !available} data-testid="btn-add-cart">
            <ShoppingCart className="mr-2 h-5 w-5" /> Add to cart
          </Button>
        )}
        <Button size="lg" onClick={handleOrderNow} disabled={addToCart.isPending || !available} className="bg-yellow-400 text-gray-950 hover:bg-yellow-300" data-testid="btn-order-now">
          Buy now
        </Button>
      </section>

      <div className="hidden">
        {qty > 0 ? (
          <div className="flex items-center gap-3 rounded-lg border bg-white p-1">
            <Button variant="ghost" size="icon" onClick={() => handleAdjust(qty - 1)} data-testid="btn-decrease-desktop"><Minus className="h-4 w-4" /></Button>
            <span className="flex-1 text-center text-lg font-bold">{qty}</span>
            <Button variant="ghost" size="icon" onClick={() => handleAdjust(qty + 1)} data-testid="btn-increase-desktop"><Plus className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button size="lg" variant="outline" onClick={handleAdd} disabled={addToCart.isPending || !available}>
            <ShoppingCart className="mr-2 h-4 w-4" /> Add to cart
          </Button>
        )}
        <Button size="lg" onClick={handleOrderNow} disabled={addToCart.isPending || !available} className="bg-yellow-400 text-gray-950 hover:bg-yellow-300">
          Buy now
        </Button>
      </div>

      {specs.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-xl font-bold">Specifications</h2>
          <div className="divide-y rounded-lg border">
            {specs.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 p-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
                <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, " ")}</span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Ratings and reviews</h2>
            <p className="text-sm text-muted-foreground">{Array.isArray(reviews) ? reviews.length : 0} customer reviews</p>
          </div>
          {product.rating && (
            <Badge className="bg-green-600 text-white">{Number(product.rating).toFixed(1)} <Star className="ml-1 h-3 w-3 fill-white" /></Badge>
          )}
        </div>

        {Array.isArray(reviews) && reviews.length > 0 ? (
          <div className="space-y-3">
            {(showAllReviews ? reviews : reviews.slice(0, 5)).map((review: any) => (
              <div key={review.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-amber-400 stroke-amber-400" : "stroke-gray-300"}`} />
                  ))}
                  {review.title && <span className="text-sm font-medium">{review.title}</span>}
                </div>
                {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                {review.isVerifiedPurchase && <Badge variant="outline" className="border-green-200 text-xs text-green-600">Verified Purchase</Badge>}
              </div>
            ))}
            {reviews.length > 5 && (
              <Button variant="outline" className="w-full" onClick={() => setShowAllReviews((value) => !value)}>
                {showAllReviews ? "Show fewer reviews" : `View all reviews (${reviews.length})`}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No reviews yet. Delivered buyers can add a verified review from the delivery section above.
          </div>
        )}
      </section>

      {similarProducts.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Similar products</h2>
            <Link href={`/search?categoryId=${(product as any).categoryId}`} className="text-sm font-medium text-primary">View all</Link>
          </div>
          <div className="flex max-w-full gap-3 overflow-x-auto pb-1 sm:gap-4">
            {similarProducts.map((item: any) => (
              <div key={item.id} className="min-w-[78vw] max-w-[78vw] sm:min-w-[220px] sm:max-w-[240px]">
                <ProductCard product={item} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
