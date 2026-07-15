import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import {
  db,
  homepageSectionProductsTable,
  homepageSectionsTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  storesTable,
} from "@workspace/db";

export const HOMEPAGE_PERMISSIONS = [
  "homepage.view",
  "homepage.create_section",
  "homepage.edit_section",
  "homepage.delete_section",
  "homepage.add_product",
  "homepage.remove_product",
  "homepage.reorder_product",
  "homepage.publish",
  "homepage.schedule",
  "homepage.manage_zone_content",
] as const;

type Section = typeof homepageSectionsTable.$inferSelect;
type Product = typeof productsTable.$inferSelect;
type Store = typeof storesTable.$inferSelect;

const now = () => new Date();

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "homepage-section";
}

export function assertHomepageAdmin(role?: string) {
  if (role !== "admin") {
    const error = new Error("Seller is not allowed to modify homepage curated sections.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function isScheduled(section: Section) {
  const current = now().getTime();
  if (section.startAt && section.startAt.getTime() > current) return false;
  if (section.endAt && section.endAt.getTime() < current) return false;
  return true;
}

function productIsEligible(product: Product, store?: Store | null) {
  return Boolean(
    product &&
      product.isAvailable !== false &&
      Number(product.stock ?? 0) > 0 &&
      store &&
      store.isActive !== false &&
      store.isVerified !== false &&
      store.isOpen !== false,
  );
}

function sectionCategoryGuard(section: Section, product: Product, categoryName?: string | null) {
  const title = `${section.title} ${section.slug}`.toLowerCase();
  const category = String(categoryName ?? "").toLowerCase();
  if (title.includes("electronics")) {
    const haystack = `${category} ${product.name} ${(product.tags ?? []).join(" ")}`.toLowerCase();
    return /(electronic|mobile|phone|earphone|charger|smart|appliance|gadget|audio)/.test(haystack);
  }
  if (title.includes("grocery")) {
    const haystack = `${category} ${product.name} ${(product.tags ?? []).join(" ")}`.toLowerCase();
    return /(grocery|vegetable|fruit|milk|rice|atta|oil|dal|saver|pack|combo|family|bulk)/.test(haystack);
  }
  return true;
}

async function productsWithStores(products: Product[]) {
  const storeIds = [...new Set(products.map((item) => item.storeId).filter(Boolean))];
  const stores = storeIds.length ? await db.select().from(storesTable).where(inArray(storesTable.id, storeIds)) : [];
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  return products.map((product) => ({ ...product, store: storeMap.get(product.storeId) ?? null }));
}

async function manualProducts(section: Section, zoneId?: number) {
  const current = now();
  const rows = await db
    .select({ item: homepageSectionProductsTable, product: productsTable, store: storesTable })
    .from(homepageSectionProductsTable)
    .innerJoin(productsTable, eq(homepageSectionProductsTable.productId, productsTable.id))
    .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
    .where(
      and(
        eq(homepageSectionProductsTable.sectionId, section.id),
        zoneId ? or(eq(homepageSectionProductsTable.zoneId, zoneId), sql`${homepageSectionProductsTable.zoneId} is null`) : undefined,
        or(sql`${homepageSectionProductsTable.startAt} is null`, lte(homepageSectionProductsTable.startAt, current)),
        or(sql`${homepageSectionProductsTable.endAt} is null`, gte(homepageSectionProductsTable.endAt, current)),
      ),
    )
    .orderBy(desc(homepageSectionProductsTable.isPinned), homepageSectionProductsTable.priority, homepageSectionProductsTable.createdAt)
    .limit(section.productLimit);

  return rows
    .filter(({ product, store }) => productIsEligible(product, store) && sectionCategoryGuard(section, product))
    .map(({ product, store, item }) => ({ ...product, store, curation: { priority: item.priority, isPinned: item.isPinned } }));
}

async function ruleProducts(section: Section, zoneId?: number) {
  const base = [eq(productsTable.isAvailable, true), sql`${productsTable.stock} > 0`];
  if (zoneId) base.push(eq(storesTable.id, storesTable.id));

  const title = `${section.title} ${section.slug}`.toLowerCase();
  if (title.includes("electronics")) base.push(or(ilike(productsTable.name, "%phone%"), ilike(productsTable.name, "%charger%"), ilike(productsTable.name, "%earphone%"))!);
  if (title.includes("grocery")) base.push(or(ilike(productsTable.name, "%milk%"), ilike(productsTable.name, "%rice%"), ilike(productsTable.name, "%oil%"), ilike(productsTable.name, "%vegetable%"))!);

  let orderBy = desc(productsTable.createdAt);
  if (section.sectionType === "BEST_SELLING") orderBy = desc(productsTable.rating);
  if (section.sectionType === "DISCOUNT_BASED") orderBy = desc(productsTable.discountPercent);
  if (section.sectionType === "NEW_ARRIVAL") orderBy = desc(productsTable.createdAt);

  const products = await db
    .select({ product: productsTable, store: storesTable })
    .from(productsTable)
    .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
    .where(and(...base, eq(storesTable.isActive, true), eq(storesTable.isVerified, true), eq(storesTable.isOpen, true)))
    .orderBy(orderBy)
    .limit(section.productLimit);

  return products
    .filter(({ product, store }) => productIsEligible(product, store) && sectionCategoryGuard(section, product))
    .map(({ product, store }) => ({ ...product, store }));
}

async function bestSellingProducts(section: Section) {
  const rows = await db
    .select({
      productId: orderItemsTable.productId,
      soldQty: sql<number>`sum(${orderItemsTable.qty})`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.status, "delivered"))
    .groupBy(orderItemsTable.productId)
    .orderBy(sql`sum(${orderItemsTable.qty}) desc`)
    .limit(section.productLimit);
  const ids = rows.map((row) => row.productId).filter((id): id is number => Boolean(id));
  if (!ids.length) return ruleProducts(section);
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, ids));
  const enriched = await productsWithStores(products);
  return enriched.filter((product) => productIsEligible(product, product.store));
}

export async function getHomepageSections(zoneId?: number) {
  const sections = await db
    .select()
    .from(homepageSectionsTable)
    .where(
      and(
        eq(homepageSectionsTable.isActive, true),
        zoneId ? or(eq(homepageSectionsTable.zoneId, zoneId), sql`${homepageSectionsTable.zoneId} is null`) : undefined,
      ),
    )
    .orderBy(homepageSectionsTable.sortOrder, homepageSectionsTable.createdAt);

  const active = sections.filter(isScheduled);
  const payload = [];
  for (const section of active) {
    const pinned = await manualProducts(section, zoneId);
    let auto: Array<Product & { store?: Store | null }> = [];
    if (section.sectionType === "BEST_SELLING") auto = await bestSellingProducts(section);
    else if (section.sectionType !== "MANUAL") auto = await ruleProducts(section, zoneId);
    const seen = new Set<number>();
    const products = [...pinned, ...auto].filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    }).slice(0, section.productLimit);
    payload.push({
      id: section.slug,
      databaseId: section.id,
      title: section.title,
      subtitle: section.subtitle,
      layout: section.layoutType,
      sectionType: section.sectionType,
      zoneId: section.zoneId,
      products,
    });
  }
  return payload;
}
