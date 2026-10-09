import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const CATEGORY_SURFACES = ["shopping", "food", "travel"] as const;
export type CategorySurface = typeof CATEGORY_SURFACES[number];

let categorySurfaceReady: Promise<void> | null = null;

export function normalizeCategorySurface(value: unknown, fallback: CategorySurface = "shopping"): CategorySurface {
  return CATEGORY_SURFACES.includes(String(value) as CategorySurface)
    ? String(value) as CategorySurface
    : fallback;
}

// Existing installations gain this column on startup. Their older categories
// remain in Shopping through the database default.
export function ensureCategorySurfaceSchema() {
  categorySurfaceReady ??= (async () => {
    await db.execute(sql`alter table categories add column if not exists surface varchar(20) not null default 'shopping'`);
    await db.execute(sql`create index if not exists categories_surface_active_sort_idx on categories (surface, is_active, sort_order, name)`);
  })();
  return categorySurfaceReady;
}
