import { useParams } from "wouter";
import { useState } from "react";
import {
  useGetProduct, useAddToCart, useGetCart, useGetProductReviews, useAddToWishlist, useRemoveFromWishlist, useGetWishlist,
  getGetProductQueryKey, getGetCartQueryKey, getGetProductReviewsQueryKey, getGetWishlistQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Heart, ShoppingCart, Star, Plus, Minus, Store, Truck, Shield } from "lucide-react";
import { Link } from "wouter";
import { useLocation } from "wouter";

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const id = Number(productId);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedImg, setSelectedImg] = useState(0);

  const { data: product, isLoading } = useGetProduct(id, {
    query: { enabled: !!id, queryKey: getGetProductQueryKey(id) },
  });

  const { data: reviews } = useGetProductReviews(id, {
    query: { enabled: !!id, queryKey: getGetProductReviewsQueryKey(id) },
  });

  const { data: cart } = useGetCart({ query: { enabled: !!user, queryKey: getGetCartQueryKey() } });
  const { data: wishlist } = useGetWishlist({ query: { enabled: !!user, queryKey: getGetWishlistQueryKey() } });

  const addToCart = useAddToCart();
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  if (!product) {
    if (isLoading) return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
    return <div className="text-center py-16 text-muted-foreground">Product not found.</div>;
  }

  const cartItem = cart?.items?.find((i: { productId: number }) => i.productId === id);
  const qty = cartItem?.qty ?? 0;
  const isWishlisted = wishlist?.some((w: { productId: number }) => w.productId === id) ?? false;
  const images = (product as any).images ?? [];
  const discount = product.discountPercent ? Number(product.discountPercent) : 0;

  const handleAdd = () => {
    if (!user) { setLocation("/login"); return; }
    addToCart.mutate(
      { data: { productId: id, qty: 1 } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
          toast({ title: "Added to cart" });
        },
      }
    );
  };

  const handleAdjust = (newQty: number) => {
    addToCart.mutate(
      { data: { productId: id, qty: newQty } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCartQueryKey() }) }
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square bg-gray-50 rounded-xl overflow-hidden">
            {images[selectedImg] ? (
              <img src={images[selectedImg]} alt={product.name} className="w-full h-full object-contain p-6" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingCart className="w-16 h-16 text-gray-200" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((img: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelectedImg(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${selectedImg === i ? "border-primary" : "border-transparent"}`}
                >
                  <img src={img} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{(product as any).weight} {(product as any).unit}</p>
            <h1 className="text-2xl font-bold">{product.name}</h1>
            {product.rating && (
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                <span className="text-sm font-medium">{Number(product.rating).toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">({(product as any).reviewCount || 0} reviews)</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">₹{Number(product.price).toFixed(0)}</span>
            {product.mrp && Number(product.mrp) > Number(product.price) && (
              <>
                <span className="text-lg text-muted-foreground line-through">₹{Number(product.mrp).toFixed(0)}</span>
                <Badge className="bg-red-500 text-white">{Math.round(discount)}% OFF</Badge>
              </>
            )}
          </div>

          {product.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          )}

          <div className="flex flex-col gap-3 pt-2">
            {qty > 0 ? (
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => handleAdjust(qty - 1)} data-testid="btn-decrease">
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-lg font-bold">{qty}</span>
                <Button size="icon" onClick={() => handleAdjust(qty + 1)} data-testid="btn-increase">
                  <Plus className="h-4 w-4" />
                </Button>
                <Link href="/cart">
                  <Button variant="outline" className="flex-1" data-testid="btn-view-cart">View Cart</Button>
                </Link>
              </div>
            ) : (
              <Button
                size="lg"
                onClick={handleAdd}
                disabled={addToCart.isPending || !(product as any).isAvailable}
                className="w-full"
                data-testid="btn-add-cart"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {(product as any).isAvailable ? "Add to Cart" : "Out of Stock"}
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={handleWishlist}
              className={`w-full ${isWishlisted ? "text-red-500 border-red-200" : ""}`}
              data-testid="btn-wishlist"
            >
              <Heart className={`w-4 h-4 mr-2 ${isWishlisted ? "fill-red-500 stroke-red-500" : ""}`} />
              {isWishlisted ? "Saved" : "Save to Wishlist"}
            </Button>
          </div>

          <Separator />
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-green-500" /> Express delivery available</div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> Genuine product guarantee</div>
            {(product as any).storeId && (
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                <Link href={`/store/${(product as any).storeId}`} className="text-primary hover:underline">View store</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reviews */}
      {Array.isArray(reviews) && reviews.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Customer Reviews</h2>
          <div className="space-y-3">
            {reviews.slice(0, 5).map((review: any) => (
              <div key={review.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < review.rating ? "fill-amber-400 stroke-amber-400" : "stroke-gray-300"}`} />
                  ))}
                  {review.title && <span className="font-medium text-sm">{review.title}</span>}
                </div>
                {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                {review.isVerifiedPurchase && <Badge variant="outline" className="text-xs text-green-600 border-green-200">Verified Purchase</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
