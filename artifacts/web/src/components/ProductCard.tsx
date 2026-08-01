import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Minus, Plus, Scale, ShoppingCart, Star, Zap } from "lucide-react";
import { useAddToCart, useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/error-message";

interface Product {
  id: number;
  name: string;
  price: string | number;
  mrp?: string | number | null;
  discountPercent?: string | number | null;
  images?: string[] | null;
  weight?: string | null;
  unit?: string | null;
  isAvailable?: boolean | number;
  rating?: string | number | null;
  storeId?: number;
  sizes?: string[] | null;
  colors?: string[] | null;
  category?: { name?: string; cardTemplate?: string | null } | null;
  categoryName?: string | null;
  cardTemplate?: string | null;
  brandName?: string | null;
  brand?: { name?: string } | null;
  warranty?: string | null;
  specifications?: Record<string, unknown> | null;
}

interface ProductCardProps {
  product: Product;
  compact?: boolean;
}

export function ProductCard({ product, compact = false }: ProductCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [imageIndex, setImageIndex] = useState(0);

  const { data: cart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const addToCart = useAddToCart();

  const cartItem = cart?.items?.find((item: { productId: number }) => item.productId === product.id);
  const qty = cartItem?.qty ?? 0;
  const discount = product.discountPercent ? Number(product.discountPercent) : 0;
  const available = product.isAvailable !== false && product.isAvailable !== 0;
  const images = useMemo(() => (Array.isArray(product.images) ? product.images.filter(Boolean) : []), [product.images]);
  const sizes = Array.isArray(product.sizes) ? product.sizes.filter(Boolean) : [];
  const colors = Array.isArray(product.colors) ? product.colors.filter(Boolean) : [];
  const template = getProductTemplate(product);
  const categoryStyle = CARD_STYLES[template] ?? CARD_STYLES.default_marketplace;
  const brand = product.brand?.name ?? product.brandName ?? product.category?.name ?? product.categoryName ?? "";
  const unitText = [product.weight, product.unit].filter(Boolean).join(" ");
  const showStepper = !compact && !["fashion_portrait", "books_portrait"].includes(template);

  useEffect(() => {
    setImageIndex(0);
  }, [product.id]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      setImageIndex((current) => (current + 1) % images.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [images.length]);

  const addProduct = (qtyToSet: number, goCheckout = false) => {
    if (!user) {
      setLocation("/login");
      return;
    }

    addToCart.mutate(
      { data: { productId: product.id, qty: qtyToSet } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          if (goCheckout) setLocation("/checkout");
        },
        onError: (err: unknown) => {
          toast({ title: "Could not add product", description: getFriendlyErrorMessage(err, "Failed to add product."), variant: "destructive" });
        },
      }
    );
  };

  const handleAdd = (event: React.MouseEvent) => {
    event.preventDefault();
    addProduct(1);
  };

  const handleAdjust = (event: React.MouseEvent, newQty: number) => {
    event.preventDefault();
    addProduct(newQty);
  };

  const handleOrderNow = (event: React.MouseEvent) => {
    event.preventDefault();
    addProduct(Math.max(1, qty || 1), true);
  };

  return (
    <Link href={`/product/${product.id}`}>
      <Card className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg ${categoryStyle.cardClass} ${compact ? "min-h-[210px]" : "min-h-[238px] sm:min-h-[282px]"}`} data-template={template} data-testid={`product-card-${product.id}`}>
        <div className={`relative w-full flex-shrink-0 overflow-hidden bg-gray-50 ${categoryStyle.imageClass}`}>
          {images[imageIndex] ? (
            <img
              src={images[imageIndex]}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={`h-full w-full transition-transform duration-500 group-hover:scale-105 ${categoryStyle.objectClass}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <ShoppingCart className="h-10 w-10 opacity-30" />
            </div>
          )}
          {discount > 0 && (
            <Badge className="absolute left-2 top-2 bg-red-500 px-1.5 text-[10px] text-white">
              {Math.round(discount)}% OFF
            </Badge>
          )}
          {!available && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75">
              <span className="text-xs font-semibold text-gray-500">Out of Stock</span>
            </div>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
              {images.slice(0, 5).map((_, index) => (
                <span key={index} className={`h-1.5 rounded-full transition-all ${index === imageIndex ? "w-4 bg-primary" : "w-1.5 bg-gray-300"}`} />
              ))}
            </div>
          )}
          {template === "fashion_portrait" && (
            <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-sm">
              <Heart className="h-4 w-4" />
            </span>
          )}
        </div>

        <CardContent className={`flex min-w-0 flex-1 flex-col ${compact ? "p-2.5" : "p-3"}`}>
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{unitText || brand || categoryStyle.metaLabel}</p>
            {available && <span className="whitespace-nowrap rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">40 min</span>}
          </div>

          <h3 className={`${compact ? "min-h-[32px] text-[12px] leading-4" : "min-h-[34px] text-[13px] leading-[17px]"} line-clamp-2 font-semibold text-gray-950`}>{product.name}</h3>

          <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px] text-amber-600">
            <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
            <span className="font-semibold">{product.rating ? Number(product.rating).toFixed(1) : "4.3"}</span>
            {template === "electronics_spec" && <span className="line-clamp-1 text-muted-foreground">- {(product.warranty || product.specifications?.Warranty || "Warranty") as string}</span>}
            {template === "fresh_produce" && <span className="ml-1 text-green-600">Fresh</span>}
            {discount > 0 && template !== "electronics_spec" && <span className="ml-1 text-green-600">{Math.round(discount)}% off</span>}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-base font-bold text-gray-950">Rs.{Number(product.price).toFixed(0)}</span>
            {product.mrp && Number(product.mrp) > Number(product.price) && (
              <span className="text-xs text-muted-foreground line-through">Rs.{Number(product.mrp).toFixed(0)}</span>
            )}
          </div>

          {template === "electronics_spec" && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-blue-700">
              <Scale className="h-3.5 w-3.5" /> Compare
            </div>
          )}

          {(sizes.length > 0 || colors.length > 0) && (
            <div className="mt-1.5 flex min-h-[22px] flex-wrap gap-1">
              {sizes.slice(0, compact ? 3 : 5).map((size) => (
                <span key={size} className="rounded-full border bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{size}</span>
              ))}
              {sizes.length > (compact ? 3 : 5) && <span className="text-[10px] text-muted-foreground">+{sizes.length - (compact ? 3 : 5)}</span>}
              {colors.length > 0 && <span className="rounded-full border bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{colors.length} colors</span>}
            </div>
          )}

          {showStepper && (
          <div className="mt-auto pt-2">
            {available ? (
              <div className="grid grid-cols-2 gap-1 rounded-full border bg-gray-50 p-1 shadow-inner">
                {qty > 0 ? (
                  <div className="flex h-8 items-center justify-between rounded-full bg-white px-0.5 shadow-sm" onClick={(event) => event.preventDefault()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={(event) => handleAdjust(event, qty - 1)} data-testid={`btn-decrease-${product.id}`}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-6 text-center text-sm font-bold">{qty}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={(event) => handleAdjust(event, qty + 1)} data-testid={`btn-increase-${product.id}`}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8 rounded-full bg-white text-xs font-bold text-primary shadow-sm hover:bg-white" onClick={handleAdd} disabled={addToCart.isPending} data-testid={`btn-add-${product.id}`}>
                    <Plus className="mr-0.5 h-3.5 w-3.5" />
                    Add
                  </Button>
                )}

                <Button size="sm" className="h-8 rounded-full bg-gray-950 text-xs font-bold text-white hover:bg-gray-800" onClick={handleOrderNow} disabled={addToCart.isPending} data-testid={`btn-order-${product.id}`}>
                  <Zap className="mr-0.5 h-3.5 w-3.5" />
                  Order
                </Button>
              </div>
            ) : (
              <Button disabled variant="outline" className="h-9 w-full rounded-lg">
                Out of Stock
              </Button>
            )}
          </div>
          )}
          {!showStepper && available && (
            <Button size="sm" variant="outline" className="mt-auto h-9 rounded-full text-xs font-bold text-primary" onClick={handleAdd} disabled={addToCart.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

type CardTemplate =
  | "grocery_compact"
  | "fresh_produce"
  | "electronics_spec"
  | "fashion_portrait"
  | "beauty_compact"
  | "food_menu"
  | "books_portrait"
  | "default_marketplace";

const CARD_STYLES: Record<CardTemplate, { cardClass: string; imageClass: string; objectClass: string; metaLabel: string }> = {
  grocery_compact: {
    cardClass: "bg-white",
    imageClass: "aspect-square",
    objectClass: "object-contain p-2.5 sm:p-3",
    metaLabel: "Pack",
  },
  fresh_produce: {
    cardClass: "border-green-100 bg-gradient-to-b from-green-50/45 to-white",
    imageClass: "aspect-square",
    objectClass: "object-contain p-2 sm:p-3",
    metaLabel: "Per kg",
  },
  electronics_spec: {
    cardClass: "bg-gradient-to-b from-blue-50/40 to-white",
    imageClass: "aspect-[1.08/1]",
    objectClass: "object-contain p-3 sm:p-4",
    metaLabel: "Model",
  },
  fashion_portrait: {
    cardClass: "bg-white",
    imageClass: "aspect-[3/4]",
    objectClass: "object-cover",
    metaLabel: "Style",
  },
  beauty_compact: {
    cardClass: "bg-gradient-to-b from-pink-50/50 to-white",
    imageClass: "aspect-square",
    objectClass: "object-contain p-3",
    metaLabel: "Size",
  },
  food_menu: {
    cardClass: "bg-white",
    imageClass: "aspect-[1.25/1]",
    objectClass: "object-cover",
    metaLabel: "Prep",
  },
  books_portrait: {
    cardClass: "bg-gradient-to-b from-amber-50/50 to-white",
    imageClass: "aspect-[3/4]",
    objectClass: "object-contain p-2",
    metaLabel: "Book",
  },
  default_marketplace: {
    cardClass: "bg-white",
    imageClass: "aspect-square",
    objectClass: "object-contain p-3 sm:p-4",
    metaLabel: "Unit",
  },
};

function getProductTemplate(product: Product): CardTemplate {
  const configured = product.cardTemplate ?? product.category?.cardTemplate;
  if (configured && configured in CARD_STYLES) return configured as CardTemplate;
  const category = `${product.category?.name ?? product.categoryName ?? ""}`.toLowerCase();
  const name = product.name.toLowerCase();
  const text = `${category} ${name}`;
  if (/(fruit|vegetable|fresh|sabji|veg|potato|onion|tomato|banana|apple)/.test(text)) return "fresh_produce";
  if (/(grocery|milk|rice|atta|dal|oil|bread|tea|snack|chocolate|beverage|cleaning|household)/.test(text)) return "grocery_compact";
  if (/(mobile|electronics|phone|laptop|headphone|watch|charger|camera|tv|speaker)/.test(text)) return "electronics_spec";
  if (/(fashion|shirt|jeans|dress|kurta|shoe|chappal|sandal|cloth|wear)/.test(text)) return "fashion_portrait";
  if (/(beauty|cream|serum|shampoo|soap|makeup|perfume)/.test(text)) return "beauty_compact";
  if (/(food|restaurant|dish|meal|biryani|roll|momo|pizza)/.test(text)) return "food_menu";
  if (/(book|stationery|notebook|pen|author)/.test(text)) return "books_portrait";
  return "default_marketplace";
}
