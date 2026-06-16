import { useAuth } from "@/hooks/use-auth";
import { 
  useListBanners, 
  useListCategories, 
  useListStores, 
  useListProducts,
  getListBannersQueryKey,
  getListCategoriesQueryKey,
  getListStoresQueryKey,
  getListProductsQueryKey
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { user } = useAuth();
  
  const { data: banners, isLoading: loadingBanners } = useListBanners({ query: { queryKey: getListBannersQueryKey() } });
  const { data: categories, isLoading: loadingCategories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: stores, isLoading: loadingStores } = useListStores({ limit: 4 }, { query: { queryKey: getListStoresQueryKey({ limit: 4 }) } });
  const { data: productsData, isLoading: loadingProducts } = useListProducts({ featured: true, limit: 8 }, { query: { queryKey: getListProductsQueryKey({ featured: true, limit: 8 }) } });

  return (
    <div className="space-y-10 pb-10">
      {/* Banners */}
      <section>
        {loadingBanners ? (
          <Skeleton className="w-full h-48 md:h-64 rounded-xl" />
        ) : (
          <div className="flex gap-4 overflow-x-auto snap-x pb-4">
            {banners?.map((banner) => (
              <div key={banner.id} className="min-w-[85vw] md:min-w-[600px] h-48 md:h-64 rounded-xl overflow-hidden relative shrink-0 snap-center bg-gray-100">
                {banner.imageUrl && (
                  <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6 text-white">
                  <h2 className="text-2xl font-bold">{banner.title}</h2>
                  {banner.subtitle && <p className="opacity-90">{banner.subtitle}</p>}
                </div>
              </div>
            ))}
            {!banners?.length && (
               <div className="w-full h-48 md:h-64 rounded-xl bg-gradient-to-r from-orange-400 to-red-500 flex items-center justify-center text-white">
                 <div className="text-center">
                   <h2 className="text-3xl font-bold">Welcome to Chowdhary Mart</h2>
                   <p className="mt-2">Groceries delivered in 10 minutes</p>
                 </div>
               </div>
            )}
          </div>
        )}
      </section>

      {/* Categories */}
      <section>
        <h2 className="text-xl font-bold mb-4">Shop by Category</h2>
        {loadingCategories ? (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {categories?.map((cat) => (
              <Link key={cat.id} href={`/search?categoryId=${cat.id}`} className="group flex flex-col items-center text-center gap-2 cursor-pointer">
                <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-3xl shadow-sm border border-gray-100 group-hover:shadow-md transition-shadow ${cat.colorClass || 'bg-white'}`}>
                  {cat.iconEmoji && <span>{cat.iconEmoji}</span>}
                  {!cat.iconEmoji && cat.imageUrl && <img src={cat.imageUrl} className="w-10 h-10 object-contain" alt={cat.name} />}
                </div>
                <span className="text-xs font-medium text-gray-700">{cat.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured Stores */}
      <section>
        <h2 className="text-xl font-bold mb-4">Nearby Stores</h2>
        {loadingStores ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stores?.map((store) => (
              <Link key={store.id} href={`/store/${store.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4 flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                      {store.logoUrl && <img src={store.logoUrl} className="w-full h-full object-cover" alt={store.name} />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 line-clamp-1">{store.name}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1">{store.address}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {store.estimatedDeliveryMins && (
                          <Badge variant="secondary" className="text-[10px]">
                            {store.estimatedDeliveryMins} mins
                          </Badge>
                        )}
                        <span className="text-xs font-medium text-amber-600">★ {store.rating || 'New'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Trending Products */}
      <section>
        <h2 className="text-xl font-bold mb-4">Trending Now</h2>
        {loadingProducts ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {productsData?.items?.map((product) => (
              <Link key={product.id} href={`/product/${product.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow h-full flex flex-col">
                  <div className="aspect-square bg-gray-100 relative p-4">
                    {product.images?.[0] && (
                      <img src={product.images[0]} className="w-full h-full object-contain mix-blend-multiply" alt={product.name} />
                    )}
                    {product.discountPercent && (
                      <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground">
                        {product.discountPercent}% OFF
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-3 flex flex-col flex-1">
                    <div className="text-xs text-gray-500 mb-1">{product.weight} {product.unit}</div>
                    <h3 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2 flex-1">{product.name}</h3>
                    <div className="flex items-center justify-between mt-auto">
                      <div>
                        <span className="font-bold text-gray-900">₹{product.price}</span>
                        {product.mrp && product.mrp !== product.price && (
                          <span className="text-xs text-gray-400 line-through ml-1">₹{product.mrp}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
