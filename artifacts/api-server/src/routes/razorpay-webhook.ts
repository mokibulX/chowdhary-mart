import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, paymentWebhookEventsTable, paymentsTable } from "@workspace/db";
import { verifyRazorpayWebhookSignature } from "../lib/razorpay";

const router = Router();

router.post("/razorpay", async (req, res) => {
  try {
    const signature = req.header("x-razorpay-signature") ?? undefined;
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
    const verified = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!verified) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }
    const payload = req.body as Record<string, any>;
    const eventId = String(payload.id ?? `${payload.event}-${payload.created_at ?? Date.now()}`);
    const eventType = String(payload.event ?? "unknown");
    const existing = await db.select().from(paymentWebhookEventsTable).where(eq(paymentWebhookEventsTable.eventId, eventId)).limit(1);
    if (existing.length) {
      res.json({ ok: true, duplicate: true });
      return;
    }
    await db.insert(paymentWebhookEventsTable).values({ eventId, eventType, verified: true, payload, processedAt: new Date() });
    const paymentEntity = payload.payload?.payment?.entity;
    if (paymentEntity?.id) {
      const status = eventType === "payment.failed" ? "failed" : eventType === "payment.captured" || eventType === "order.paid" ? "paid" : undefined;
      if (status) {
        await db.update(paymentsTable)
          .set({
            paymentStatus: status,
            captureStatus: status === "paid" ? "captured" : "failed",
            webhookVerified: true,
            failedAt: status === "failed" ? new Date() : undefined,
            capturedAt: status === "paid" ? new Date() : undefined,
            failureCode: paymentEntity.error_code ?? null,
            failureDescription: paymentEntity.error_description ?? null,
          })
          .where(eq(paymentsTable.providerPaymentId, String(paymentEntity.id)));
      }
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
