import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListProducts, useListCategories, getListProductsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, X } from "lucide-react";

export default function Search() {
  const [location] = useLocation();
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );

  const [q, setQ] = useState(params.get("q") ?? "");
  const [categoryId, setCategoryId] = useState<number | undefined>(
    params.get("categoryId") ? Number(params.get("categoryId")) : undefined
  );
  const [sortBy, setSortBy] = useState("popular");
  const [inputVal, setInputVal] = useState(q);

  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const queryParams = {
    q: q || undefined,
    categoryId: categoryId || undefined,
    sortBy: sortBy as "popular" | "price_asc" | "price_desc" | "rating",
    limit: 40,
  };

  const { data: productsData, isLoading } = useListProducts(queryParams, {
    query: { queryKey: getListProductsQueryKey(queryParams) },
  });

  const products = productsData?.items ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(inputVal);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search groceries, brands, essentials..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            data-testid="input-search"
            autoFocus
          />
          {inputVal && (
            <button type="button" onClick={() => { setInputVal(""); setQ(""); }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button type="submit" data-testid="btn-search">Search</Button>
      </form>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 flex-nowrap">
        <Badge
          variant={!categoryId ? "default" : "outline"}
          className="cursor-pointer whitespace-nowrap px-3 py-1 text-sm"
          onClick={() => setCategoryId(undefined)}
        >
          All
        </Badge>
        {categories?.map(cat => (
          <Badge
            key={cat.id}
            variant={categoryId === cat.id ? "default" : "outline"}
            className="cursor-pointer whitespace-nowrap px-3 py-1 text-sm"
            onClick={() => setCategoryId(categoryId === cat.id ? undefined : cat.id)}
          >
            {cat.iconEmoji} {cat.name}
          </Badge>
        ))}
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Searching..." : `${productsData?.total ?? 0} results`}
          {q && <> for "<strong>{q}</strong>"</>}
        </p>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Popular</SelectItem>
            <SelectItem value="price_asc">Price: Low to High</SelectItem>
            <SelectItem value="price_desc">Price: High to Low</SelectItem>
            <SelectItem value="rating">Best Rated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No products found</p>
          <p className="text-sm">Try a different search or browse categories above</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
