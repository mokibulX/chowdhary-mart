import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listProducts, type Product } from "@workspace/api-client-react";

const PAGE_SIZE = 16;

export function useInfiniteProducts(params: Record<string, any>, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: ["infinite-products", params],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listProducts({
        ...params,
        limit: PAGE_SIZE,
        offset: Number(pageParam) || 0,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((total, page) => total + page.items.length, 0);
    },
  });

  const products = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  ) as Product[];

  const total = query.data?.pages[0]?.total ?? 0;

  return { ...query, products, total };
}
