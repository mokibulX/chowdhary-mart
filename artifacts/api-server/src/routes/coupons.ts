import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, couponsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { validateCouponForUser } from "../lib/coupons";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const coupons = await db.select().from(couponsTable)
      .where(and(eq(couponsTable.isActive, true)));
    res.json(coupons);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/validate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { code, orderValue } = req.body as { code: string; orderValue: string };
    const { coupon, discount } = await validateCouponForUser(db, {
      code,
      orderAmount: Number(orderValue),
      userId: req.user!.userId,
    });

    res.json({
      valid: true,
      discount: discount.toFixed(2),
      payableTotal: Math.max(0, Number(orderValue) - discount).toFixed(2),
      message: "Coupon applied",
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        isSpecial: coupon.isSpecial,
        expiresAt: coupon.expiresAt,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid coupon" });
  }
});

export default router;
