import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useListCategories, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { useInfiniteProducts } from "@/hooks/use-infinite-products";
import { getSavedDeliveryLocation } from "@/lib/pincode";

const SUGGESTIONS = ["mobile", "grocery", "shoes", "headphones", "rice", "shirt", "home decor", "smart watch"];
const TYPO_CORRECTIONS: Record<string, string> = {
  suger: "sugar",
  sugr: "sugar",
  shooe: "shoe",
  chapal: "chappal",
  chappal: "chappal",
  sabji: "vegetable",
  sobji: "vegetable",
  alu: "potato",
  peyaj: "onion",
  dudh: "milk",
  mobail: "mobile",
  hedphone: "headphones",
};
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
  const [minPrice, setMinPrice] = useState(params.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [minDiscount, setMinDiscount] = useState("0");
  const [brand, setBrand] = useState("all");
  const [inStock, setInStock] = useState(params.get("inStock") ?? "true");
  const [radiusKm, setRadiusKm] = useState(params.get("radiusKm") ?? "5");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const nextQ = nextParams.get("q") ?? "";
    const nextCategory = nextParams.get("categoryId") ? Number(nextParams.get("categoryId")) : undefined;
    const nextSort = nextParams.get("sort") ?? "newest";
    setQ(nextQ);
    setInputVal(nextQ);
    setCategoryId(nextCategory);
    setSort(nextSort);
    setMinPrice(nextParams.get("minPrice") ?? "");
    setMaxPrice(nextParams.get("maxPrice") ?? "");
    setMinRating(nextParams.get("rating") ?? "0");
    setMinDiscount(nextParams.get("discount") ?? "0");
    setBrand(nextParams.get("brand") ?? "all");
    setInStock(nextParams.get("inStock") ?? "true");
    setRadiusKm(nextParams.get("radiusKm") ?? "5");
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
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    rating: minRating !== "0" ? Number(minRating) : undefined,
    discount: minDiscount !== "0" ? Number(minDiscount) : undefined,
    brand: brand !== "all" ? brand : undefined,
    inStock: inStock === "true" ? true : undefined,
    radiusKm: radiusKm ? Number(radiusKm) : undefined,
    lat: getSavedDeliveryLocation().lat,
    lng: getSavedDeliveryLocation().lng,
  };

  const { products, total, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteProducts(queryParams);

  const brands = useMemo(() => {
    const names = products.map((product: any) => product.brand?.name || product.brandName).filter(Boolean);
    return Array.from(new Set(names));
  }, [products]);

  const filteredProducts = products.filter((product: any) => {
    return true;
  });
  const correctedQuery = useMemo(() => {
    const normalized = inputVal.trim().toLowerCase();
    return TYPO_CORRECTIONS[normalized] && TYPO_CORRECTIONS[normalized] !== normalized ? TYPO_CORRECTIONS[normalized] : "";
  }, [inputVal]);
  const liveSuggestions = useMemo(() => {
    const typed = inputVal.trim().toLowerCase();
    const base = [...recentSearches, ...SUGGESTIONS, ...(categories ?? []).map((cat: any) => cat.name)];
    const matches = base
      .filter(Boolean)
      .filter((item) => !typed || String(item).toLowerCase().includes(typed) || typed.includes(String(item).toLowerCase()))
      .slice(0, 8);
    return Array.from(new Set([correctedQuery, ...matches].filter(Boolean)));
  }, [categories, correctedQuery, inputVal, recentSearches]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "450px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, filteredProducts.length]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = inputVal.trim();
    setQ(next);
    setLocation(buildSearchUrl({ q: next, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }));
    if (next) {
      const updated = [next, ...recentSearches.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem("ekart_recent_searches", JSON.stringify(updated));
    }
  };

  const resetFilters = () => {
    setCategoryId(undefined);
    setSort("newest");
    setMinPrice("");
    setMaxPrice("");
    setMinRating("0");
    setMinDiscount("0");
    setBrand("all");
    setInStock("true");
    setRadiusKm("5");
    setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
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
          {(liveSuggestions.length ? liveSuggestions : SUGGESTIONS).map((item) => (
            <Badge
              key={item}
              variant={correctedQuery === item ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap"
            onClick={() => {
                setInputVal(item);
                setQ(item);
                setLocation(buildSearchUrl({ q: item, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }));
              }}
            >
              {correctedQuery === item ? "Did you mean: " : recentSearches.includes(item) ? "Recent: " : ""}{item}
            </Badge>
          ))}
        </div>
        {correctedQuery && (
          <button
            type="button"
            onClick={() => {
              setInputVal(correctedQuery);
              setQ(correctedQuery);
              setLocation(buildSearchUrl({ q: correctedQuery, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }));
            }}
            className="mt-2 text-left text-xs font-semibold text-primary"
          >
            Search instead for "{correctedQuery}"
          </button>
        )}
      </form>

      <section className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex max-w-full gap-3 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => { setCategoryId(undefined); setLocation(buildSearchUrl({ q, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm })); }}
            className="min-w-[68px] text-center"
          >
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 bg-gray-950 text-xs font-bold text-white shadow-sm ${!categoryId ? "ring-2 ring-primary/40" : ""}`}>
              All
            </div>
            <p className="mt-1 line-clamp-1 text-[10px] font-semibold">All</p>
          </button>
          {categories?.map((cat, index) => (
            <button key={cat.id} type="button" onClick={() => { setCategoryId(cat.id); setLocation(buildSearchUrl({ q, categoryId: cat.id, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm })); }} className="min-w-[68px] text-center">
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
          <Select value={categoryId ? String(categoryId) : "all"} onValueChange={(value) => { const nextCategory = value === "all" ? undefined : Number(value); setCategoryId(nextCategory); setLocation(buildSearchUrl({ q, categoryId: nextCategory, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm })); }}>
            <SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories?.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => { setSort(value); setLocation(buildSearchUrl({ q, categoryId, sort: value, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm })); }}>
            <SelectTrigger className="h-9 min-w-0 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Low price</SelectItem>
              <SelectItem value="price_desc">High price</SelectItem>
              <SelectItem value="rating">Rated</SelectItem>
              <SelectItem value="discount">Discount</SelectItem>
              <SelectItem value="nearest">Nearest</SelectItem>
              <SelectItem value="fastest">Fastest</SelectItem>
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
            <Input className="h-9 min-w-0" type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} onBlur={() => setLocation(buildSearchUrl({ q, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }))} placeholder="Min price" />
            <Input className="h-9 min-w-0" type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} onBlur={() => setLocation(buildSearchUrl({ q, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }))} placeholder="Max price" />
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
            <Select value={inStock} onValueChange={(value) => { setInStock(value); setLocation(buildSearchUrl({ q, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock: value, radiusKm })); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">In stock only</SelectItem>
                <SelectItem value="false">All stock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={radiusKm} onValueChange={(value) => { setRadiusKm(value); setLocation(buildSearchUrl({ q, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm: value })); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">Within 2 km</SelectItem>
                <SelectItem value="5">Within 5 km</SelectItem>
                <SelectItem value="8">Within 8 km</SelectItem>
                <SelectItem value="20">Within 20 km</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {brands.length > 0 && (
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto">
            <Badge variant={brand === "all" ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => setBrand("all")}>All brands</Badge>
            {brands.map((item) => (
              <Badge key={String(item)} variant={brand === item ? "default" : "outline"} className="cursor-pointer whitespace-nowrap" onClick={() => { setBrand(String(item)); setLocation(buildSearchUrl({ q, categoryId, sort, minPrice, maxPrice, minRating, minDiscount, brand: String(item), inStock, radiusKm })); }}>
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
          {isLoading ? "Searching..." : `${filteredProducts.length} of ${total} loaded`}
          {q && <> for "<strong>{q}</strong>"</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {activeFilterChips({ minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm }).map((chip) => (
          <Badge key={chip.key} variant="secondary" className="gap-1">
            {chip.label}
            <button type="button" onClick={() => {
              const next = { minPrice, maxPrice, minRating, minDiscount, brand, inStock, radiusKm, [chip.key]: chip.reset };
              if (chip.key === "minRating") next.minRating = "0";
              if (chip.key === "minDiscount") next.minDiscount = "0";
              if (chip.key === "brand") next.brand = "all";
              setMinPrice(next.minPrice); setMaxPrice(next.maxPrice); setMinRating(next.minRating); setMinDiscount(next.minDiscount); setBrand(next.brand); setInStock(next.inStock); setRadiusKm(next.radiusKm);
              setLocation(buildSearchUrl({ q, categoryId, sort, ...next }));
            }}><X className="h-3 w-3" /></button>
          </Badge>
        ))}
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
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
          <div ref={loadMoreRef} className="flex min-h-16 items-center justify-center py-4">
            {isFetchingNextPage ? (
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-lg sm:h-64" />)}
              </div>
            ) : hasNextPage ? (
              <Button variant="outline" onClick={() => fetchNextPage()}>Load more products</Button>
            ) : (
              <p className="text-xs text-muted-foreground">You have reached the end.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function buildSearchUrl(filters: Record<string, any>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", String(filters.q));
  if (filters.categoryId) params.set("categoryId", String(filters.categoryId));
  if (filters.sort && filters.sort !== "newest") params.set("sort", String(filters.sort));
  if (filters.minPrice) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minRating && filters.minRating !== "0") params.set("rating", String(filters.minRating));
  if (filters.minDiscount && filters.minDiscount !== "0") params.set("discount", String(filters.minDiscount));
  if (filters.brand && filters.brand !== "all") params.set("brand", String(filters.brand));
  if (filters.inStock && filters.inStock !== "true") params.set("inStock", String(filters.inStock));
  if (filters.radiusKm && filters.radiusKm !== "5") params.set("radiusKm", String(filters.radiusKm));
  const text = params.toString();
  return text ? `/search?${text}` : "/search";
}

function activeFilterChips(filters: Record<string, string>) {
  const chips: Array<{ key: string; label: string; reset: string }> = [];
  if (filters.minPrice) chips.push({ key: "minPrice", label: `Min Rs.${filters.minPrice}`, reset: "" });
  if (filters.maxPrice) chips.push({ key: "maxPrice", label: `Max Rs.${filters.maxPrice}`, reset: "" });
  if (filters.minRating !== "0") chips.push({ key: "minRating", label: `${filters.minRating}+ rating`, reset: "0" });
  if (filters.minDiscount !== "0") chips.push({ key: "minDiscount", label: `${filters.minDiscount}%+ off`, reset: "0" });
  if (filters.brand !== "all") chips.push({ key: "brand", label: `Brand: ${filters.brand}`, reset: "all" });
  if (filters.inStock === "true") chips.push({ key: "inStock", label: "In stock", reset: "false" });
  if (filters.radiusKm !== "5") chips.push({ key: "radiusKm", label: `Within ${filters.radiusKm} km`, reset: "5" });
  return chips;
}
