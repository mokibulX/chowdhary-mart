import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

async function main() {
  await db.execute(sql`alter table users add column if not exists deleted_at timestamp`);
  await db.execute(sql`alter table users add column if not exists warning text`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from delivery_earnings`);
    await tx.execute(sql`delete from rider_earning_transactions`);
    await tx.execute(sql`delete from seller_settlements`);
    await tx.execute(sql`delete from delivery_route`);
    await tx.execute(sql`delete from delivery_tracking_history`);
    await tx.execute(sql`delete from active_delivery_locations`);
    await tx.execute(sql`delete from order_tracking`);
    await tx.execute(sql`delete from reviews`);
    await tx.execute(sql`delete from "returns"`);
    await tx.execute(sql`delete from coupon_uses`);
    await tx.execute(sql`delete from refunds`);
    await tx.execute(sql`delete from payments`);
    await tx.execute(sql`delete from payment_attempts`);
    await tx.execute(sql`delete from payment_orders`);
    await tx.execute(sql`delete from order_items`);
    await tx.execute(sql`delete from orders`);

    await tx.execute(sql`delete from cart_items`);
    await tx.execute(sql`delete from carts`);
    await tx.execute(sql`delete from wishlist`);
    await tx.execute(sql`delete from homepage_section_products`);
    await tx.execute(sql`delete from inventory_ledger`);
    await tx.execute(sql`delete from products`);

    await tx.execute(sql`delete from seller_zone_assignments`);
    await tx.execute(sql`delete from rider_zone_assignments`);
    await tx.execute(sql`delete from zone_change_requests`);
    await tx.execute(sql`delete from store_hours`);
    await tx.execute(sql`delete from stores`);

    await tx.execute(sql`update media_library set category_id = null`);
    await tx.execute(sql`delete from categories`);
    await tx.execute(sql`delete from brands`);

    await tx.execute(sql`delete from delivery_partners where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from payouts where withdrawal_request_id in (select id from withdrawal_requests where user_id in (select id from users where role <> 'admin'))`);
    await tx.execute(sql`delete from withdrawal_requests where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from wallet_transactions where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from wallet_ledger_entries where wallet_id in (select id from wallets where owner_user_id in (select id from users where role <> 'admin'))`);
    await tx.execute(sql`delete from wallet_holds where wallet_id in (select id from wallets where owner_user_id in (select id from users where role <> 'admin'))`);
    await tx.execute(sql`delete from wallets where owner_user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from payout_fund_accounts where contact_id in (select id from payout_contacts where user_id in (select id from users where role <> 'admin'))`);
    await tx.execute(sql`delete from payout_contacts where user_id in (select id from users where role <> 'admin')`);

    await tx.execute(sql`delete from notifications where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from loyalty_transactions where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from idempotency_records where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from addresses where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from sessions where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from push_tokens where user_id in (select id from users where role <> 'admin')`);
    await tx.execute(sql`delete from users where role <> 'admin'`);
  });

  const result = await db.execute(sql`
    select
      (select count(*) from users where role = 'admin') as admins,
      (select count(*) from users where role <> 'admin') as users,
      (select count(*) from products) as products,
      (select count(*) from categories) as categories,
      (select count(*) from stores) as stores
  `);
  console.log("Admin-only cleanup complete:", (result as any).rows?.[0] ?? result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
