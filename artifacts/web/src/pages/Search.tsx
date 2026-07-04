import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListProducts, useListCategories, getListProductsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";

const SUGGESTIONS = ["mobile", "grocery", "shoes", "headphones", "rice", "shirt", "home decor", "smart watch"];
const CATEGORY_IMAGES = [
  "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=240&q=80",
];

export default function Search() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

  const [q, setQ] = useState(params.get("q") ?? "");
  const [categoryId, setCategoryId] = useState<number | undefined>(params.get("categoryId") ? Number(params.get("categoryId")) : undefined);
  const [sort, setSort] = useState(params.get("sort") ?? "newest");
  const [inputVal, setInputVal] = useState(q);
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [minDiscount, setMinDiscount] = useState("0");
  const [brand, setBrand] = useState("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const nextParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const nextQ = nextParams.get("q") ?? "";
    const nextCategory = nextParams.get("categoryId") ? Number(nextParams.get("categoryId")) : undefined;
    const nextSort = nextParams.get("sort") ?? "newest";
    setQ(nextQ);
    setInputVal(nextQ);
    setCategoryId(nextCategory);
    setSort(nextSort);
  }, [location]);

  useEffect(() => {
    const stored = localStorage.getItem("ekart_recent_searches");
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored).slice(0, 6));
      } catch {
        setRecentSearches([]);
      }
    }
  }, []);

  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const queryParams = {
    q: q || undefined,
    categoryId: categoryId || undefined,
    sort: sort as any,
    limit: 100,
  };

  const { data: productsData, isLoading } = useListProducts(queryParams, {
    query: { queryKey: getListProductsQueryKey(queryParams) },
  });

  const products = productsData?.items ?? [];
  const brands = useMemo(() => {
    const names = products.map((product: any) => product.brand?.name || product.brandName).filter(Boolean);
    return Array.from(new Set(names));
  }, [products]);

  const filteredProducts = products.filter((product: any) => {
    const priceOk = maxPrice ? Number(product.price) <= Number(maxPrice) : true;
    const ratingOk = Number(product.rating ?? 0) >= Number(minRating);
    const discountOk = Number(product.discountPercent ?? 0) >= Number(minDiscount);
    const brandOk = brand === "all" ? true : product.brand?.name === brand || product.brandName === brand;
    return priceOk && ratingOk && discountOk && brandOk;
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = inputVal.trim();
    setQ(next);
    setLocation(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
    if (next) {
      const updated = [next, ...recentSearches.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem("ekart_recent_searches", JSON.stringify(updated));
    }
  };

  const resetFilters = () => {
    setCategoryId(undefined);
    setSort("newest");
    setMaxPrice("");
    setMinRating("0");
    setMinDiscount("0");
    setBrand("all");
  };

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      <form onSubmit={handleSearch} className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-11 pl-9" placeholder="Search products, brands, stores..." value={inputVal} onChange={(event) => setInputVal(event.target.value)} data-testid="input-search" autoFocus />
            {inputVal && (
              <button type="button" onClick={() => { setInputVal(""); setQ(""); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button className="h-11" type="submit" data-testid="btn-search">Search</Button>
        </div>
        <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
          {(recentSearches.length ? recentSearches : SUGGESTIONS).map((item) => (
            <Badge key={item} variant="outline" className="cursor-pointer whitespace-nowrap" onClick={() => { setInputVal(item); setQ(item); }}>
              {recentSearches.includes(item) ? "Recent: " : ""}{item}
            </Badge>
          ))}
        </div>
      </form>

      <section className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex max-w-full gap-3 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId(undefined)}
            className="min-w-[68px] text-center"
          >
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 bg-gray-950 text-xs font-bold text-white shadow-sm ${!categoryId ? "ring-2 ring-primary/40" : ""}`}>
              All
            </div>
            <p className="mt-1 line-clamp-1 text-[10px] font-semibold">All</p>
          </button>
          {categories?.map((cat, index) => (
            <button key={cat.id} type="button" onClick={() => setCategoryId(cat.id)} className="min-w-[68px] text-center">
              <div className={`mx-auto h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-gray-50 shadow-sm ring-1 ring-gray-200 ${categoryId === cat.id ? "ring-2 ring-primary" : ""}`}>
                <img src={cat.imageUrl || CATEGORY_IMAGES[index % CATEGORY_IMAGES.length]} alt={cat.name} className="h-full w-full object-cover" />
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-3">{cat.name}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Select value={categoryId ? String(categoryId) : "all"} onValueChange={(value) => setCategoryId(value === "all" ? undefined : Number(value))}>
            <SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories?.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Low price</SelectItem>
              <SelectItem value="price_desc">High price</SelectItem>
              <SelectItem value="rating">Rated</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-3" onClick={() => setFiltersOpen((value) => !value)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
        {filtersOpen && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Input className="h-9 min-w-0" type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max price" />
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any rating</SelectItem>
                <SelectItem value="3">3+ rating</SelectItem>
                <SelectItem value="4">4+ rating</SelectItem>
              </SelectContent>
            </Select>
            <Select value={minDiscount} onValueChange={setMinDiscount}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any discount</SelectItem>
                <SelectItem value="10">10%+ off</SelectItem>
                <SelectItem value="25">25%+ off</SelectItem>
                <SelectItem value="50">50%+ off</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {brands.length > 0 && (
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto">
            <Badge variant={brand === "all" ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => setBrand("all")}>All brands</Badge>
            {brands.map((item) => (
              <Badge key={String(item)} variant={brand === item ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => setBrand(String(item))}>
                {String(item)}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetFilters}>Clear filters</Button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Searching..." : `${filteredProducts.length} results`}
          {q && <> for "<strong>{q}</strong>"</>}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-lg sm:h-64" />)}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-lg border bg-white py-16 text-center text-muted-foreground">
          <SearchIcon className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="font-medium">No products found</p>
          <p className="text-sm">Try another keyword or clear filters.</p>
          <Button className="mt-4" variant="outline" onClick={resetFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </div>
  );
}
