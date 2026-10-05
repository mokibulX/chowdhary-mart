import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

let storeDisplayReady: Promise<void> | null = null;

// Add placement controls for existing databases without a manual migration.
export function ensureStoreDisplayColumns() {
  storeDisplayReady ??= (async () => {
    await db.execute(sql`alter table stores add column if not exists display_order integer not null default 0`);
    await db.execute(sql`alter table stores add column if not exists is_featured boolean not null default false`);
  })();
  return storeDisplayReady;
}
