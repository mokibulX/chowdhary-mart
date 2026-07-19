import { and, eq, sql } from "drizzle-orm";
import { couponUsesTable, couponsTable } from "@workspace/db";

export function calculateCouponDiscount(coupon: typeof couponsTable.$inferSelect, orderAmount: number) {
  const amount = Math.max(0, Number(orderAmount) || 0);
  const value = Math.max(0, Number(coupon.discountValue) || 0);
  const raw = coupon.discountType === "percent" ? (amount * value) / 100 : value;
  const capped = coupon.maxDiscount ? Math.min(raw, Number(coupon.maxDiscount)) : raw;
  return Math.min(Math.max(0, capped), amount);
}

export async function validateCouponForUser(db: any, input: { code: string; orderAmount: number; userId: number }) {
  const code = String(input.code ?? "").trim().toUpperCase();
  const orderAmount = Math.max(0, Number(input.orderAmount) || 0);
  if (!code) throw new Error("Coupon code is required");

  const [coupon] = await db.select().from(couponsTable)
    .where(and(eq(couponsTable.code, code), eq(couponsTable.isActive, true)))
    .limit(1);

  if (!coupon) throw new Error("Invalid coupon code");
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error("Coupon has expired");
  if (coupon.usageLimit && Number(coupon.usedCount ?? 0) >= Number(coupon.usageLimit)) throw new Error("Coupon usage limit reached");
  if (Number(coupon.minOrderValue ?? 0) > orderAmount) throw new Error(`Minimum order value of Rs.${Number(coupon.minOrderValue ?? 0).toFixed(0)} required`);

  if (coupon.perUserLimit) {
    const [uses] = await db.select({ count: sql<number>`count(*)` })
      .from(couponUsesTable)
      .where(and(eq(couponUsesTable.couponId, coupon.id), eq(couponUsesTable.userId, input.userId)));
    if (Number(uses?.count ?? 0) >= Number(coupon.perUserLimit)) throw new Error("You have already used this coupon");
  }

  const discount = calculateCouponDiscount(coupon, orderAmount);
  if (discount <= 0) throw new Error("Coupon discount is not available for this order");
  return { coupon, discount };
}
