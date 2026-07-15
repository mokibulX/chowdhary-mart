import crypto from "node:crypto";
import { readEnv } from "@workspace/db/env";

export function getRazorpayConfig() {
  return {
    mode: readEnv("RAZORPAY_MODE") ?? "test",
    keyId: readEnv("RAZORPAY_KEY_ID"),
    keySecret: readEnv("RAZORPAY_KEY_SECRET"),
    webhookSecret: readEnv("RAZORPAY_WEBHOOK_SECRET"),
    currency: readEnv("RAZORPAY_CURRENCY") ?? "INR",
    capture: (readEnv("RAZORPAY_PAYMENT_CAPTURE") ?? "true").toLowerCase() !== "false",
  };
}

export function requireRazorpayConfigured() {
  const config = getRazorpayConfig();
  if (!config.keyId || !config.keySecret) {
    const error = new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend .env.");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return config as ReturnType<typeof getRazorpayConfig> & { keyId: string; keySecret: string };
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  const config = requireRazorpayConfigured();
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: config.currency,
      receipt,
      payment_capture: config.capture ? 1 : 0,
      notes,
    }),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String((data.error as { description?: string } | undefined)?.description ?? "Razorpay order creation failed"));
  }
  return data;
}

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const config = requireRazorpayConfigured();
  const expected = crypto.createHmac("sha256", config.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer | string, signature?: string) {
  const config = getRazorpayConfig();
  if (!config.webhookSecret || !signature) return false;
  const webhookSecret = config.webhookSecret;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
