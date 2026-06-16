import { useGetWishlist, useRemoveFromWishlist, useAddToCart, getGetWishlistQueryKey, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { Link } from "wouter";

export default function Wishlist() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: wishlist, isLoading } = useGetWishlist({
    query: { enabled: !!user, queryKey: getGetWishlistQueryKey() },
  });
  const remove = useRemoveFromWishlist();
  const addToCart = useAddToCart();

  const handleRemove = (productId: number) => {
    remove.mutate({ productId }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() }),
    });
  };

  const handleAddToCart = (productId: number) => {
    addToCart.mutate({ data: { productId, qty: 1 } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
        toast({ title: "Added to cart" });
      },
    });
  };

  if (!user) {
    return (
      <div className="text-center py-16">
        <Heart className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p>Please <Link href="/login" className="text-primary underline">sign in</Link> to see wishlist</p>
      </div>
    );
  }

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>;

  if (!wishlist?.length) {
    return (
      <div className="text-center py-16 space-y-4">
        <Heart className="w-14 h-14 mx-auto text-muted-foreground opacity-40" />
        <p className="font-medium text-muted-foreground">Your wishlist is empty</p>
        <Link href="/search"><Button>Browse Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Wishlist ({wishlist.length})</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {wishlist.map((item: any) => {
          const product = item.product ?? item;
          return (
            <div key={item.id} className="bg-white border rounded-xl overflow-hidden group hover:shadow-md transition-shadow">
              <Link href={`/product/${item.productId ?? product.id}`}>
                <div className="aspect-square bg-gray-50 relative p-4 cursor-pointer">
                  {product.images?.[0] ? (
                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="w-10 h-10 text-gray-200" /></div>
                  )}
                </div>
              </Link>
              <div className="p-3 space-y-2">
                <p className="text-sm font-medium line-clamp-2">{product.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-sm">₹{Number(product.price).toFixed(0)}</span>
                  {product.mrp && Number(product.mrp) > Number(product.price) && (
                    <span className="text-xs text-muted-foreground line-through">₹{Number(product.mrp).toFixed(0)}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="flex-1 text-xs h-8" onClick={() => handleAddToCart(item.productId ?? product.id)} data-testid={`btn-cart-${item.id}`}>
                    <ShoppingCart className="w-3 h-3 mr-1" />Add
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" onClick={() => handleRemove(item.productId ?? product.id)} data-testid={`btn-remove-${item.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
