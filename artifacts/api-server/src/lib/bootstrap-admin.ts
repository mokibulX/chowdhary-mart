import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { generateReferralCode, hashPassword } from "./auth";
import { logger } from "./logger";

export async function ensureConfiguredAdmin() {
  const email = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD ?? "");

  if (!email || !password) return;

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (existing) {
    await db.update(usersTable)
      .set({
        passwordHash,
        role: "admin",
        name: existing.name || "Chowdhary Mart Admin",
        isVerified: true,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id));
    logger.info({ adminEmail: email }, "Configured admin account synced");
    return;
  }

  await db.insert(usersTable).values({
    email,
    phone: process.env.ADMIN_PHONE?.replace(/\D/g, "") || "9876500001",
    name: process.env.ADMIN_NAME || "Chowdhary Mart Admin",
    passwordHash,
    role: "admin",
    isVerified: true,
    isActive: true,
    referralCode: generateReferralCode(),
  });
  logger.info({ adminEmail: email }, "Configured admin account created");
}
