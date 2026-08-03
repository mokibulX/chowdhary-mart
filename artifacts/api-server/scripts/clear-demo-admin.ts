import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

async function main() {
  const keepEmail = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!keepEmail) throw new Error("ADMIN_EMAIL missing");

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from sessions where user_id in (select id from users where role = 'admin' and lower(coalesce(email, '')) <> ${keepEmail})`);
    await tx.execute(sql`delete from notifications where user_id in (select id from users where role = 'admin' and lower(coalesce(email, '')) <> ${keepEmail})`);
    await tx.execute(sql`delete from wallet_transactions where user_id in (select id from users where role = 'admin' and lower(coalesce(email, '')) <> ${keepEmail})`);
    await tx.execute(sql`delete from users where role = 'admin' and lower(coalesce(email, '')) <> ${keepEmail}`);
  });

  const result = await db.execute(sql`select id, email, name, role from users where role = 'admin' order by id`);
  console.log("Remaining admins:", (result as any).rows ?? result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
