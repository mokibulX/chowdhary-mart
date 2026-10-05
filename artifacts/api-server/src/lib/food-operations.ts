import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

let foodOperationsReady: Promise<void> | null = null;

export function ensureFoodOperationColumns() {
  foodOperationsReady ??= db.execute(sql`
    alter table stores add column if not exists auto_accept_orders boolean not null default false
  `).then(() => undefined);
  return foodOperationsReady;
}
