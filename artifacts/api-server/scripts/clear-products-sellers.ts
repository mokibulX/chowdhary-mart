import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

async function main() {
  await db.execute(sql`alter table users add column if not exists deleted_at timestamp`);
  await db.execute(sql`alter table users add column if not exists warning text`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from delivery_earnings where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from rider_earning_transactions where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from seller_settlements where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from delivery_route where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from delivery_tracking_history where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from active_delivery_locations where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from order_tracking where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from reviews where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from "returns" where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from coupon_uses where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from refunds where parent_order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from payments where parent_order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from payment_attempts where payment_order_id in (select id from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores)))`);
    await tx.execute(sql`delete from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from order_items where order_id in (select id from orders where store_id in (select id from stores))`);
    await tx.execute(sql`delete from orders where store_id in (select id from stores)`);

    await tx.execute(sql`delete from cart_items where product_id in (select id from products)`);
    await tx.execute(sql`update carts set store_id = null where store_id in (select id from stores)`);
    await tx.execute(sql`delete from wishlist where product_id in (select id from products)`);
    await tx.execute(sql`delete from homepage_section_products where product_id in (select id from products)`);
    await tx.execute(sql`delete from inventory_ledger where product_id in (select id from products)`);
    await tx.execute(sql`delete from products`);
    await tx.execute(sql`delete from seller_zone_assignments where shop_id in (select id from stores) or seller_id in (select id from users where role = 'vendor')`);
    await tx.execute(sql`delete from store_hours where store_id in (select id from stores)`);
    await tx.execute(sql`delete from stores`);
    await tx.execute(sql`
      update users
      set email = null,
          phone = null,
          password_hash = null,
          name = 'Deleted Seller #' || id,
          avatar_url = null,
          referral_code = null,
          is_active = false,
          deleted_at = now(),
          updated_at = now()
      where role = 'vendor'
    `);
  });

  const result = await db.execute(sql`
    select
      (select count(*) from products) as products,
      (select count(*) from stores) as stores,
      (select count(*) from users where role = 'vendor' and deleted_at is null) as sellers
  `);
  console.log("Cleared products/sellers:", (result as any).rows?.[0] ?? result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
