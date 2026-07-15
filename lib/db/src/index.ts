import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { createPgPoolConfig, type DatabaseRole } from "./env";

const { Pool } = pg;

declare global {
  var __chowdharyMartPgPools: Partial<Record<DatabaseRole, pg.Pool>> | undefined;
}

function getPool(role: DatabaseRole) {
  const pools = globalThis.__chowdharyMartPgPools ?? {};
  if (!pools[role]) pools[role] = new Pool(createPgPoolConfig(role));
  if (process.env.NODE_ENV !== "production") globalThis.__chowdharyMartPgPools = pools;
  return pools[role]!;
}

export const primaryPool = getPool("primary");
export const authPool = getPool("auth");
export const marketplacePool = getPool("marketplace");
export const orderPool = getPool("order");
export const deliveryPool = getPool("delivery");
export const analyticsPool = getPool("analytics");

export const primaryDb = drizzle(primaryPool, { schema });
export const authDb = drizzle(authPool, { schema });
export const marketplaceDb = drizzle(marketplacePool, { schema });
export const orderDb = drizzle(orderPool, { schema });
export const deliveryDb = drizzle(deliveryPool, { schema });
export const analyticsDb = drizzle(analyticsPool, { schema });

export const pool = marketplacePool;
export const db = marketplaceDb;

export * from "./schema";
export * from "./env";
