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
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { ArrowRight, BadgePercent, Clock, CreditCard, ShieldCheck, Truck, Zap } from "lucide-react";

const OFFER_CARDS = [
  { title: "Bank offer", text: "10% instant discount on cards", icon: CreditCard, tone: "bg-blue-50 text-blue-700 border-blue-100" },
  { title: "Flash deal", text: "Limited stock, fastest checkout", icon: Zap, tone: "bg-yellow-50 text-yellow-700 border-yellow-100" },
  { title: "Fast delivery", text: "Nearby sellers dispatch quickly", icon: Truck, tone: "bg-green-50 text-green-700 border-green-100" },
  { title: "Assured quality", text: "Verified products and sellers", icon: ShieldCheck, tone: "bg-violet-50 text-violet-700 border-violet-100" },
];

export default function Home() {
  const { data: banners, isLoading: loadingBanners } = useListBanners({ query: { queryKey: getListBannersQueryKey() } });
  const { data: categories, isLoading: loadingCategories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: stores, isLoading: loadingStores } = useListStores({ limit: 5 }, { query: { queryKey: getListStoresQueryKey({ limit: 5 }) } });
  const { data: featured, isLoading: loadingFeatured } = useListProducts({ featured: true, limit: 12 }, { query: { queryKey: getListProductsQueryKey({ featured: true, limit: 12 }) } });
  const { data: electronics } = useListProducts({ categoryId: 1, limit: 6 }, { query: { queryKey: getListProductsQueryKey({ categoryId: 1, limit: 6 }) } });
  const { data: grocery } = useListProducts({ categoryId: 2, limit: 6 }, { query: { queryKey: getListProductsQueryKey({ categoryId: 2, limit: 6 }) } });

  return (
    <div className="space-y-8 pb-10">
      <style>{`
        @keyframes lch-slide { 0%, 28% { transform: translateX(0); } 34%, 62% { transform: translateX(-100%); } 68%, 96% { transform: translateX(-200%); } 100% { transform: translateX(0); } }
        @keyframes lch-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .lch-carousel { animation: lch-slide 15s ease-in-out infinite; }
        .lch-float { animation: lch-float 3.5s ease-in-out infinite; }
      `}</style>

      <section className="overflow-hidden rounded-lg bg-white border">
        {loadingBanners ? (
          <Skeleton className="h-56 md:h-72 w-full" />
        ) : (
          <div className="relative h-56 md:h-72 overflow-hidden">
            <div className="lch-carousel flex h-full w-full">
              {(banners?.length ? banners : []).slice(0, 3).map((banner) => (
                <Link key={banner.id} href={(banner as any).href ?? "/search"} className="relative block h-full min-w-full overflow-hidden">
                  {banner.imageUrl && <img src={banner.imageUrl} alt={banner.title} className="h-full w-full object-cover" />}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
                  <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center p-6 text-white md:p-10">
                    <Badge className="mb-3 w-fit bg-white text-gray-900 hover:bg-white">Mega sale live</Badge>
                    <h1 className="text-3xl font-bold leading-tight md:text-5xl">{banner.title}</h1>
                    {banner.subtitle && <p className="mt-3 max-w-md text-sm text-white/90 md:text-base">{banner.subtitle}</p>}
                    <Button className="mt-5 w-fit bg-white text-gray-950 hover:bg-gray-100">
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
          <Link key={title} href="/coupons" className={`rounded-lg border p-4 transition-transform hover:-translate-y-1 ${tone}`}>
            <Icon className="mb-3 h-5 w-5" />
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-xs opacity-80">{text}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Shop by category</h2>
          <Link href="/search" className="text-sm font-medium text-primary">View all</Link>
        </div>
        {loadingCategories ? (
          <div className="grid grid-cols-5 gap-3 md:grid-cols-10">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (
          <div className="grid grid-cols-5 gap-3 md:grid-cols-10">
            {categories?.map((cat) => (
              <Link key={cat.id} href={`/search?categoryId=${cat.id}`} className="group text-center">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-lg border text-lg font-bold transition-all group-hover:-translate-y-1 group-hover:shadow-md ${cat.colorClass || "bg-white"}`}>
                  {cat.iconEmoji}
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] font-medium text-gray-700">{cat.name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/search?sort=price_asc" className="rounded-lg bg-gray-950 p-5 text-white transition-transform hover:-translate-y-1">
          <BadgePercent className="mb-4 h-7 w-7 text-yellow-300" />
          <h3 className="text-xl font-bold">Lowest price zone</h3>
          <p className="mt-1 text-sm text-white/70">Daily essentials, fashion and electronics under budget.</p>
        </Link>
        <Link href="/search?categoryId=1" className="rounded-lg bg-blue-600 p-5 text-white transition-transform hover:-translate-y-1">
          <Zap className="mb-4 h-7 w-7 text-yellow-200" />
          <h3 className="text-xl font-bold">Gadget rush</h3>
          <p className="mt-1 text-sm text-white/80">Phones, audio and laptops from verified local sellers.</p>
        </Link>
        <Link href="/search?categoryId=2" className="rounded-lg bg-emerald-600 p-5 text-white transition-transform hover:-translate-y-1">
          <Clock className="mb-4 h-7 w-7 text-emerald-100" />
          <h3 className="text-xl font-bold">Quick grocery</h3>
          <p className="mt-1 text-sm text-white/80">Fresh stock, fast packing and live order tracking.</p>
        </Link>
      </section>

      <ProductRail title="Trending deals" isLoading={loadingFeatured} products={featured?.items ?? []} href="/search" />
      <ProductRail title="Electronics top picks" products={electronics?.items ?? []} href="/search?categoryId=1" />
      <ProductRail title="Grocery saver packs" products={grocery?.items ?? []} href="/search?categoryId=2" />

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nearby sellers</h2>
          <Link href="/search" className="text-sm font-medium text-primary">Browse products</Link>
        </div>
        {loadingStores ? (
          <div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            {stores?.map((store) => (
              <Link key={store.id} href={`/store/${store.id}`} className="rounded-lg border p-3 transition-all hover:-translate-y-1 hover:shadow-md">
                <div className="mb-3 h-16 overflow-hidden rounded-md bg-gray-100">
                  {store.logoUrl && <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />}
                </div>
                <h3 className="line-clamp-1 font-semibold">{store.name}</h3>
                <p className="line-clamp-1 text-xs text-muted-foreground">{store.address}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-amber-600">Star {store.rating || "New"}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5">{store.estimatedDeliveryMins} min</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProductRail({ title, products, isLoading, href }: { title: string; products: any[]; isLoading?: boolean; href: string }) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link href={href} className="text-sm font-medium text-primary">View more</Link>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </section>
  );
}
