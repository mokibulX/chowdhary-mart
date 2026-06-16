import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { useAddToCart, useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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
}

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: cart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const addToCart = useAddToCart();

  const cartItem = cart?.items?.find((i: { productId: number }) => i.productId === product.id);
  const qty = cartItem?.qty ?? 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) { setLocation("/login"); return; }
    addToCart.mutate(
      { data: { productId: product.id, qty: 1 } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to add to cart";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleAdjust = (e: React.MouseEvent, newQty: number) => {
    e.preventDefault();
    addToCart.mutate(
      { data: { productId: product.id, qty: newQty } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCartQueryKey() }) }
    );
  };

  const discount = product.discountPercent ? Number(product.discountPercent) : 0;

  return (
    <Link href={`/product/${product.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-all h-full flex flex-col group" data-testid={`product-card-${product.id}`}>
        <div className="aspect-square bg-gray-50 relative overflow-hidden rounded-t-lg">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">
              <ShoppingCart className="w-12 h-12 opacity-30" />
            </div>
          )}
          {discount > 0 && (
            <Badge className="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-1.5">
              {Math.round(discount)}% OFF
            </Badge>
          )}
          {!product.isAvailable && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="text-sm font-semibold text-gray-500">Out of Stock</span>
            </div>
          )}
        </div>
        <CardContent className="p-3 flex flex-col flex-1">
          <p className="text-xs text-muted-foreground mb-0.5">{product.weight} {product.unit}</p>
          <h3 className="font-medium text-sm line-clamp-2 flex-1 mb-2">{product.name}</h3>
          <div className="flex items-center justify-between gap-1 mt-auto">
            <div>
              <span className="font-bold text-gray-900">₹{Number(product.price).toFixed(0)}</span>
              {product.mrp && Number(product.mrp) > Number(product.price) && (
                <span className="text-xs text-muted-foreground line-through ml-1">₹{Number(product.mrp).toFixed(0)}</span>
              )}
            </div>
            {product.isAvailable !== false && product.isAvailable !== 0 ? (
              qty > 0 ? (
                <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={e => handleAdjust(e, qty - 1)}
                    data-testid={`btn-decrease-${product.id}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <Button
                    size="icon"
                    className="h-7 w-7 bg-primary text-white"
                    onClick={e => handleAdjust(e, qty + 1)}
                    data-testid={`btn-increase-${product.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleAdd}
                  disabled={addToCart.isPending}
                  data-testid={`btn-add-${product.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              )
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
