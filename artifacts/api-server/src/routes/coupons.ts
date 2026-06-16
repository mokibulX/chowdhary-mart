import { Router } from "express";
import { eq, and, gt, lte, or, isNull, sql } from "drizzle-orm";
import { db, couponsTable, couponUsesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/coupons
router.get("/", async (_req, res) => {
  try {
    const now = new Date();
    const coupons = await db.select().from(couponsTable)
      .where(and(eq(couponsTable.isActive, true)));
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/coupons/validate
router.post("/validate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { code, orderValue } = req.body as { code: string; orderValue: string };
    const userId = req.user!.userId;
    const orderAmt = Number(orderValue);

    const [coupon] = await db.select().from(couponsTable)
      .where(and(eq(couponsTable.code, code.toUpperCase()), eq(couponsTable.isActive, true)))
      .limit(1);

    if (!coupon) {
      res.status(400).json({ error: "Invalid coupon code" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ error: "Coupon has expired" });
      return;
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      res.status(400).json({ error: "Coupon usage limit reached" });
      return;
    }

    if (Number(coupon.minOrderValue) > orderAmt) {
      res.status(400).json({ error: `Minimum order value of ₹${coupon.minOrderValue} required` });
      return;
    }

    // Check per-user limit
    if (coupon.perUserLimit) {
      const [uses] = await db.select({ count: sql<number>`count(*)` })
        .from(couponUsesTable)
        .where(and(eq(couponUsesTable.couponId, coupon.id), eq(couponUsesTable.userId, userId)));
      if (Number(uses.count) >= coupon.perUserLimit) {
        res.status(400).json({ error: "You have already used this coupon" });
        return;
      }
    }

    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = (orderAmt * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
    } else {
      discount = Number(coupon.discountValue);
    }
    discount = Math.min(discount, orderAmt);

    res.json({
      valid: true,
      discount: discount.toFixed(2),
      message: null,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        expiresAt: coupon.expiresAt,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
