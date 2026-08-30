import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListBanners,
  useListCategories,
  useListStores,
  useListProducts,
  getListBannersQueryKey,
  getListCategoriesQueryKey,
  getListStoresQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { ArrowRight, BadgePercent, Clock, CreditCard, MapPin, ShieldCheck, Sparkles, Truck, Zap } from "lucide-react";
import { useInfiniteProducts } from "@/hooks/use-infinite-products";
import { getSavedDeliveryLocation, type DeliveryLocation } from "@/lib/pincode";

const OFFER_CARDS = [
  { title: "Bank offer", text: "10% instant discount on cards", icon: CreditCard, tone: "bg-blue-50 text-blue-700 border-blue-100" },
  { title: "Flash deal", text: "Limited stock, fastest checkout", icon: Zap, tone: "bg-yellow-50 text-yellow-700 border-yellow-100" },
  { title: "Fast delivery", text: "Nearby sellers dispatch quickly", icon: Truck, tone: "bg-green-50 text-green-700 border-green-100" },
  { title: "Assured quality", text: "Verified products and sellers", icon: ShieldCheck, tone: "bg-violet-50 text-violet-700 border-violet-100" },
];

const CATEGORY_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1571019613914-85f342c6a11e?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=300&q=80",
];

const FALLBACK_BANNERS = [
  {
    id: -1,
    title: "Mega Sale Weekend",
    subtitle: "Fresh deals on phones, grocery, fashion and daily essentials.",
    imageUrl: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=1400&q=80",
    href: "/search?sort=price_asc",
  },
  {
    id: -2,
    title: "40 Minute Local Delivery",
    subtitle: "Order from nearby verified sellers and track every move live.",
    imageUrl: "https://images.unsplash.com/photo-1586880244386-8b3e34c8382c?auto=format&fit=crop&w=1400&q=80",
    href: "/search",
  },
  {
    id: -3,
    title: "Gadget Rush",
    subtitle: "Mobiles, audio, accessories and home tech at sharper prices.",
    imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
    href: "/search?categoryId=1",
  },
];

function listItems<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.results)) return record.results as T[];
  }
  return [];
}

export default function Home() {
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(3600 * 5 + 42 * 60 + 12);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation>(() => getSavedDeliveryLocation());
  const categoryLoadMoreRef = useRef<HTMLDivElement | null>(null);

  const { data: banners, isLoading: loadingBanners } = useListBanners({ query: { queryKey: getListBannersQueryKey() } });
  const { data: categories, isLoading: loadingCategories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const zoneParams = { lat: deliveryLocation.lat, lng: deliveryLocation.lng, radiusKm: 5 };
  const { data: stores, isLoading: loadingStores } = useListStores({ limit: 5, ...zoneParams }, { query: { queryKey: getListStoresQueryKey({ limit: 5, ...zoneParams }) } });
  const { data: featured, isLoading: loadingFeatured } = useListProducts({ featured: true, limit: 12, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ featured: true, limit: 12, ...zoneParams }) } });
  const { data: electronics } = useListProducts({ categoryId: 1, limit: 8, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ categoryId: 1, limit: 8, ...zoneParams }) } });
  const { data: grocery } = useListProducts({ categoryId: 2, limit: 8, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ categoryId: 2, limit: 8, ...zoneParams }) } });
  const { data: dailyEssentials } = useListProducts({ categoryId: 2, limit: 12, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ categoryId: 2, limit: 12, ...zoneParams }) } });
  const { data: bestSellers } = useListProducts({ sort: "rating" as any, limit: 8, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ sort: "rating" as any, limit: 8, ...zoneParams }) } });
  const { data: newest } = useListProducts({ limit: 8, ...zoneParams }, { query: { queryKey: getListProductsQueryKey({ limit: 8, ...zoneParams }) } });
  const bannerItems = listItems<any>(banners);
  const categoryItems = listItems<any>(categories);
  const storeItems = listItems<any>(stores);
  const storeIds = storeItems.map((store) => store.id).filter(Boolean).join(",");
  const { data: nearbyStoreProducts } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/products", "nearby-seller-offers", storeIds],
    enabled: storeItems.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(storeItems.map(async (store) => {
        const response = await customFetch<any>(`/api/products?storeId=${encodeURIComponent(String(store.id))}&limit=100`);
        return [String(store.id), listItems<any>(response)] as const;
      }));
      return Object.fromEntries(entries);
    },
  });
  const zoneId = (deliveryLocation as DeliveryLocation & { zoneId?: number }).zoneId;
  const { data: homepageData } = useQuery({
    queryKey: ["/api/homepage", zoneId],
    queryFn: () => customFetch<any>(`/api/homepage${zoneId ? `?zoneId=${zoneId}` : ""}`),
  });
  const selectedCategoryParams = { categoryId: selectedCategoryId, sort: "newest" as any };
  const {
    products: selectedCategoryProducts,
    total: selectedCategoryTotal,
    isLoading: loadingSelectedCategory,
    hasNextPage: hasMoreCategoryProducts,
    fetchNextPage: fetchMoreCategoryProducts,
    isFetchingNextPage: loadingMoreCategoryProducts,
  } = useInfiniteProducts(selectedCategoryParams, !!selectedCategoryId);

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    const stored = localStorage.getItem("ekart_recent_products");
    if (stored) {
      try {
        setRecentlyViewed(JSON.parse(stored).slice(0, 8));
      } catch {
        setRecentlyViewed([]);
      }
    }
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const productLists = [featured, dailyEssentials, bestSellers, newest].filter(Boolean);
    if (productLists.length < 4) return;
    const availableIds = new Set<number>();
    productLists.forEach((list: any) => {
      (list?.items ?? []).forEach((product: any) => availableIds.add(Number(product.id)));
    });
    const next = recentlyViewed.filter((product) => availableIds.has(Number(product.id)));
    if (next.length !== recentlyViewed.length) {
      if (next.length) localStorage.setItem("ekart_recent_products", JSON.stringify(next));
      else localStorage.removeItem("ekart_recent_products");
      setRecentlyViewed(next);
    }
  }, [bestSellers, dailyEssentials, featured, newest, recentlyViewed]);

  const slides = bannerItems.length ? bannerItems : FALLBACK_BANNERS;
  const selectedCategory = categoryItems.find((cat) => cat.id === selectedCategoryId);
  const countdown = useMemo(() => {
    const hours = Math.floor(secondsLeft / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, "0");
    const seconds = Math.floor(secondsLeft % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }, [secondsLeft]);

  useEffect(() => {
    const syncLocation = () => setDeliveryLocation(getSavedDeliveryLocation());
    window.addEventListener("delivery-location-change", syncLocation);
    return () => window.removeEventListener("delivery-location-change", syncLocation);
  }, []);

  useEffect(() => {
    const node = categoryLoadMoreRef.current;
    if (!node || !hasMoreCategoryProducts) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreCategoryProducts) {
          void fetchMoreCategoryProducts();
        }
      },
      { rootMargin: "450px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchMoreCategoryProducts, hasMoreCategoryProducts, loadingMoreCategoryProducts, selectedCategoryProducts.length]);

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden pb-10 sm:space-y-6">
      <style>{`
        @keyframes lch-slide { 0%, 28% { transform: translateX(0); } 34%, 62% { transform: translateX(-100%); } 68%, 96% { transform: translateX(-200%); } 100% { transform: translateX(0); } }
        @keyframes lch-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes lch-shine { 0% { transform: translateX(-140%) skewX(-18deg); } 45%, 100% { transform: translateX(220%) skewX(-18deg); } }
        .lch-carousel { animation: lch-slide 15s ease-in-out infinite; }
        .lch-float { animation: lch-float 3.5s ease-in-out infinite; }
        .lch-offer-shine::after { animation: lch-shine 3.8s ease-in-out infinite; }
        .lch-clean-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .lch-clean-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <section className="rounded-xl border bg-white p-3 shadow-sm sm:p-4">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-location-selector"))}
          className="flex w-full items-center gap-2 rounded-lg bg-orange-50 px-3 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-orange-100"
          aria-label="Change delivery location"
        >
          <MapPin className="h-4 w-4 text-primary" />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {deliveryLocation.pincode ? `Deliver to ${deliveryLocation.area} ${deliveryLocation.pincode}` : "Select live delivery location"}
          </span>
          <span className="ml-auto text-xs text-primary">Change</span>
        </button>
      </section>

      <section className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Shop by category</h2>
          <Link href="/search" className="text-xs font-medium text-primary">View all</Link>
        </div>
        {loadingCategories ? (
          <div className="flex max-w-full gap-3 overflow-x-auto pb-1">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 min-w-16 rounded-full" />)}</div>
        ) : (
          <div className="lch-clean-scroll flex max-w-full gap-3 overflow-x-auto pb-1">
            {categoryItems.map((cat, index) => (
              <button key={cat.id} type="button" onClick={() => setSelectedCategoryId(cat.id)} className="group min-w-[72px] text-center">
                <div className={`lch-category-orbit lch-category-tone-${index % 8} ${index % 2 ? "lch-category-reverse" : ""} mx-auto h-16 w-16 ${selectedCategoryId === cat.id ? "is-selected" : ""}`}>
                  <div className="lch-category-orbit-media">
                    <img src={cat.imageUrl || CATEGORY_FALLBACK_IMAGES[index % CATEGORY_FALLBACK_IMAGES.length]} alt={cat.name} className="h-full w-full object-cover" />
                  </div>
                </div>
                <p className="lch-category-luxury-text mt-2 line-clamp-2 text-[11px] font-extrabold leading-3">{cat.name}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCategoryId && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{selectedCategory?.name ?? "Selected category"}</h2>
              <p className="text-xs text-muted-foreground">{selectedCategoryProducts.length} of {selectedCategoryTotal} products loaded. Scroll for more.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedCategoryId(undefined)}>Clear</Button>
              <Link href={`/search?categoryId=${selectedCategoryId}`} className="text-sm font-medium text-primary">View all</Link>
            </div>
          </div>
          {loadingSelectedCategory ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {selectedCategoryProducts.map((product) => (
                  <ProductCard key={product.id} product={product} compact />
                ))}
              </div>
              <div ref={categoryLoadMoreRef} className="flex min-h-16 items-center justify-center py-4">
                {loadingMoreCategoryProducts ? (
                  <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-xl" />)}
                  </div>
                ) : hasMoreCategoryProducts ? (
                  <Button variant="outline" onClick={() => fetchMoreCategoryProducts()}>Load more</Button>
                ) : selectedCategoryProducts.length > 0 ? (
                  <p className="text-xs text-muted-foreground">All products from this category are loaded.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">No products in this category yet.</p>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-lg border bg-white">
        {loadingBanners ? (
          <Skeleton className="h-56 w-full md:h-72" />
        ) : (
          <div className="relative h-60 overflow-hidden sm:h-64 md:h-72">
            <div className="lch-carousel flex h-full w-full">
              {slides.slice(0, 3).map((banner: any) => (
                <Link key={banner.id} href={banner.href ?? "/search"} className="relative block h-full min-w-full overflow-hidden">
                  {banner.imageUrl && <img src={banner.imageUrl} alt={banner.title} className="h-full w-full object-cover" />}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
                  <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xl flex-col justify-center p-5 text-white sm:w-[70%] md:p-10">
                    <Badge className="mb-2 w-fit bg-white text-gray-900 hover:bg-white md:mb-3">Mega sale live</Badge>
                    <h1 className="line-clamp-2 text-2xl font-bold leading-tight sm:text-3xl md:text-5xl">{banner.title}</h1>
                    {banner.subtitle && <p className="mt-2 line-clamp-2 max-w-md text-xs text-white/90 sm:text-sm md:mt-3 md:text-base">{banner.subtitle}</p>}
                    <Button className="mt-4 w-fit bg-white text-gray-950 hover:bg-gray-100 md:mt-5">
                      Shop now <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                  <div className="lch-float absolute bottom-6 right-6 hidden rounded-lg bg-white/95 px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg md:block">
                    Up to 70% off
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {OFFER_CARDS.map(({ title, text, icon: Icon, tone }) => (
          <Link key={title} href="/coupons" className={`lch-offer-shine relative overflow-hidden rounded-lg border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg after:absolute after:inset-y-0 after:left-0 after:w-10 after:bg-white/40 after:content-[''] ${tone}`}>
            <Icon className="mb-3 h-5 w-5" />
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-xs opacity-80">{text}</p>
          </Link>
        ))}
      </section>

      <section className="hidden rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Shop by category</h2>
          <Link href="/search" className="text-sm font-medium text-primary">View all</Link>
        </div>
        {loadingCategories ? (
          <div className="grid grid-cols-4 gap-3 md:grid-cols-10">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (
          <div className="grid grid-cols-4 gap-3 md:grid-cols-10">
            {categoryItems.map((cat, index) => (
              <Link key={cat.id} href={`/search?categoryId=${cat.id}`} className="group text-center">
                <div className={`lch-category-orbit lch-category-tone-${index % 8} ${index % 2 ? "lch-category-reverse" : ""} mx-auto h-16 w-16`}>
                  <div className="lch-category-orbit-media">
                    <img src={cat.imageUrl || CATEGORY_FALLBACK_IMAGES[index % CATEGORY_FALLBACK_IMAGES.length]} alt={cat.name} className="h-full w-full object-cover" />
                  </div>
                </div>
                <p className="lch-category-luxury-text mt-2 line-clamp-2 text-[11px] font-extrabold leading-3">{cat.name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/search?sort=price_asc" className="rounded-lg bg-gray-950 p-5 text-white transition-transform hover:-translate-y-1">
          <BadgePercent className="mb-4 h-7 w-7 text-yellow-300" />
          <h3 className="text-xl font-bold">Mega Sale</h3>
          <p className="mt-1 text-sm text-white/70">Daily essentials, fashion and electronics under budget.</p>
        </Link>
        <Link href="/search?categoryId=1" className="rounded-lg bg-blue-600 p-5 text-white transition-transform hover:-translate-y-1">
          <Zap className="mb-4 h-7 w-7 text-yellow-200" />
          <h3 className="text-xl font-bold">Gadget Rush</h3>
          <p className="mt-1 text-sm text-white/80">Phones, audio and laptops from verified local sellers.</p>
        </Link>
        <Link href="/search?categoryId=2" className="rounded-lg bg-emerald-600 p-5 text-white transition-transform hover:-translate-y-1">
          <Clock className="mb-4 h-7 w-7 text-emerald-100" />
          <h3 className="text-xl font-bold">Quick Grocery</h3>
          <p className="mt-1 text-sm text-white/80">Fresh stock, fast packing and live order tracking.</p>
        </Link>
      </section>

      {homepageData?.sections?.length ? (
        homepageData.sections.map((section: any) => (
          <ProductRail
            key={section.id}
            title={section.title}
            subtitle={section.subtitle || (section.title.toLowerCase().includes("deal") ? `Ends in ${countdown}` : undefined)}
            products={section.products ?? []}
            href={`/search?section=${encodeURIComponent(section.id)}`}
          />
        ))
      ) : (
        <>
          <ProductRail title="Flash Deals" subtitle={`Ends in ${countdown}`} isLoading={loadingFeatured} products={featured?.items ?? []} href="/search?featured=true" />
          <ProductRail title="Daily essentials" subtitle="Milk, bread, cleaning, personal care and household basics" products={dailyEssentials?.items ?? grocery?.items ?? []} href="/search?categoryId=2" />
          <ProductRail title="Recommended for you" products={newest?.items ?? []} href="/search" />
          <ProductRail title="Best sellers" products={bestSellers?.items ?? []} href="/search?sort=rating" />
          <ProductRail title="Electronics top picks" products={electronics?.items ?? []} href="/search?categoryId=1" />
          <ProductRail title="Grocery saver packs" products={grocery?.items ?? []} href="/search?categoryId=2" />
        </>
      )}
      {recentlyViewed.length > 0 && <ProductRail title="Recently viewed" products={recentlyViewed} href="/search" />}

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Sponsored picks</h2>
          <Badge variant="outline">Ad</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Local Luxe", "Premium fashion under Rs.999", "/search?categoryId=3"],
            ["Home Upgrade", "Kitchen, decor and appliances", "/search?q=home"],
            ["Fresh Basket", "Daily grocery combo offers", "/search?categoryId=2"],
          ].map(([title, text, href]) => (
            <Link key={title} href={href} className="rounded-lg border bg-gradient-to-br from-white to-orange-50 p-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <Sparkles className="mb-3 h-5 w-5 text-primary" />
              <p className="font-bold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nearby sellers</h2>
          <Link href="/search" className="text-sm font-medium text-primary">Browse products</Link>
        </div>
        {loadingStores ? (
          <div className="cm-nearby-seller-rail">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-24 shrink-0 rounded-full" />)}</div>
        ) : (
          <div className="cm-nearby-seller-rail">
            {storeItems.map((store) => {
              const sellerProducts = nearbyStoreProducts?.[String(store.id)] ?? [];
              const hasOffer = sellerProducts.some((product: any) => Number(product.discountPercent) > 0 && Number(product.stock ?? 1) > 0);
              return (
                <Link key={store.id} href={`/store/${store.id}`} className={`cm-nearby-seller ${hasOffer ? "cm-nearby-seller--offer" : ""}`}>
                  <div className="cm-nearby-seller-avatar-wrap">
                    <div className="cm-nearby-seller-avatar">
                      {store.logoUrl ? <img src={store.logoUrl} alt={store.name} loading="lazy" /> : storeInitials(store.name)}
                    </div>
                  </div>
                  <strong className="cm-nearby-seller-name">{store.name}</strong>
                  {hasOffer ? (
                    <span className="cm-nearby-seller-offer"><BadgePercent size={12} /> Offer</span>
                  ) : (
                    <span className="cm-nearby-seller-meta">{store.estimatedDeliveryMins ?? "--"} min</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function storeInitials(name: unknown) {
  const initials = String(name || "Store")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "S";
}

function ProductRail({ title, subtitle, products, isLoading, href }: { title: string; subtitle?: string; products: any[]; isLoading?: boolean; href: string }) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-xs font-semibold text-primary">{subtitle}</p>}
        </div>
        <Link href={href} className="text-sm font-medium text-primary">View all</Link>
      </div>
      {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[250px] rounded-xl" />)}
        </div>
      ) : products.length > 0 ? (
        <div className="cm-product-rail-grid grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {products.slice(0, 10).map((product: any) => <ProductCard key={product.id} product={product} compact />)}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Products will appear here once sellers add stock.
        </div>
      )}
    </section>
  );
}
