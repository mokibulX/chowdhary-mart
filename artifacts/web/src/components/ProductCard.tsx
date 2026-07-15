import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingCart, Star, Zap } from "lucide-react";
import { useAddToCart, useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to add product";
          toast({ title: "Error", description: msg, variant: "destructive" });
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
      <Card className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg ${compact ? "min-h-[246px]" : "min-h-[318px]"}`} data-testid={`product-card-${product.id}`}>
        <div className="relative aspect-[1.18/1] w-full flex-shrink-0 overflow-hidden bg-gray-50">
          {images[imageIndex] ? (
            <img
              src={images[imageIndex]}
              alt={product.name}
              className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
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
        </div>

        <CardContent className="flex min-w-0 flex-1 flex-col p-3">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{product.weight} {product.unit}</p>
            {available && <span className="whitespace-nowrap rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">40 min</span>}
          </div>

          <h3 className="line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-[17px] text-gray-950">{product.name}</h3>

          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
            <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
            <span className="font-semibold">{product.rating ? Number(product.rating).toFixed(1) : "4.3"}</span>
            {discount > 0 && <span className="ml-1 text-green-600">{Math.round(discount)}% off</span>}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-base font-bold text-gray-950">Rs.{Number(product.price).toFixed(0)}</span>
            {product.mrp && Number(product.mrp) > Number(product.price) && (
              <span className="text-xs text-muted-foreground line-through">Rs.{Number(product.mrp).toFixed(0)}</span>
            )}
          </div>

          {sizes.length > 0 && (
            <div className="mt-1.5 flex min-h-[22px] flex-wrap gap-1">
              {sizes.slice(0, compact ? 3 : 5).map((size) => (
                <span key={size} className="rounded-full border bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{size}</span>
              ))}
              {sizes.length > (compact ? 3 : 5) && <span className="text-[10px] text-muted-foreground">+{sizes.length - (compact ? 3 : 5)}</span>}
            </div>
          )}

          {!compact && (
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
        </CardContent>
      </Card>
    </Link>
  );
}
