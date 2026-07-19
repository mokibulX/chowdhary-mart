import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { otpCodesTable } from "@workspace/db/schema";
import { isDemoOtp, testMode } from "./test-mode";

type OtpChannel = "sms" | "email";
type OtpPurpose = "login" | "register" | "forgot" | "delivery_register";

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTarget(channel: OtpChannel, value: string) {
  if (channel === "sms") return value.replace(/\D/g, "");
  return value.trim().toLowerCase();
}

function validTarget(channel: OtpChannel, target: string) {
  return channel === "sms" ? /^\d{10}$/.test(target) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);
}

function generateOtp() {
  return String(randomInt(100000, 1000000));
}

async function sendSmsOtp(phone: string, otp: string) {
  const provider = String(process.env.SMS_PROVIDER ?? "").toLowerCase();
  const message = `Your ChowdharyMart OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`;

  if (provider === "fast2sms") {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) throw new Error("FAST2SMS_API_KEY is missing");
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ route: "q", message, language: "english", flash: 0, numbers: phone }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Fast2SMS failed: ${body || response.status}`);
    }
    return;
  }

  if (provider === "msg91") {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    if (!authKey || !templateId) throw new Error("MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is missing");
    const response = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [{ mobiles: `91${phone}`, OTP: otp }],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`MSG91 failed: ${body || response.status}`);
    }
    return;
  }

  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) throw new Error("Twilio SMS env values are missing");
    const body = new URLSearchParams({ To: `+91${phone}`, From: from, Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(`Twilio failed: ${bodyText || response.status}`);
    }
    return;
  }

  throw new Error("SMS_PROVIDER is not configured");
}

async function sendEmailOtp(email: string, otp: string) {
  const provider = String(process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  const subject = "Your ChowdharyMart OTP";
  const text = `Your ChowdharyMart OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`;
  const from = process.env.EMAIL_FROM || "ChowdharyMart <noreply@chowdharymart.local>";

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is missing");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: email, subject, text }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend failed: ${body || response.status}`);
    }
    return;
  }

  if (provider === "brevo") {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("BREVO_API_KEY is missing");
    const senderEmail = process.env.BREVO_SENDER_EMAIL || from.replace(/^.*<|>$/g, "");
    const senderName = process.env.BREVO_SENDER_NAME || "ChowdharyMart";
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject,
        textContent: text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Brevo failed: ${body || response.status}`);
    }
    return;
  }

  throw new Error("EMAIL_PROVIDER is not configured");
}

export async function requestOtp(input: { target: string; channel: OtpChannel; purpose: OtpPurpose }) {
  const target = normalizeTarget(input.channel, input.target);
  if (!validTarget(input.channel, target)) throw new Error(input.channel === "sms" ? "Valid 10 digit mobile number is required" : "Valid email is required");

  const code = testMode.allowDemoOtp ? testMode.demoOtpCode : generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  if (testMode.allowDemoOtp) {
    await db.insert(otpCodesTable).values({
      target,
      channel: input.channel,
      purpose: input.purpose,
      codeHash: sha(code),
      expiresAt,
    });
    return { target, channel: input.channel, verificationMode: "DEMO", expiresInSeconds: OTP_TTL_MINUTES * 60, otp: code };
  }

  if (input.channel === "sms") await sendSmsOtp(target, code);
  else await sendEmailOtp(target, code);

  await db.insert(otpCodesTable).values({
    target,
    channel: input.channel,
    purpose: input.purpose,
    codeHash: sha(code),
    expiresAt,
  });

  return { target, channel: input.channel, verificationMode: "REAL", expiresInSeconds: OTP_TTL_MINUTES * 60 };
}

export async function verifyOtp(input: { target: string; channel: OtpChannel; purpose: OtpPurpose; otp?: string }) {
  const target = normalizeTarget(input.channel, input.target);
  const otp = String(input.otp ?? "").trim();
  if (!otp || !validTarget(input.channel, target)) return false;
  if (isDemoOtp(otp)) return true;

  const [record] = await db.select().from(otpCodesTable)
    .where(and(
      eq(otpCodesTable.target, target),
      eq(otpCodesTable.channel, input.channel),
      eq(otpCodesTable.purpose, input.purpose),
      eq(otpCodesTable.isUsed, false),
      gt(otpCodesTable.expiresAt, new Date()),
    ))
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (!record || record.attempts >= OTP_MAX_ATTEMPTS) return false;
  await db.update(otpCodesTable).set({ attempts: record.attempts + 1 }).where(eq(otpCodesTable.id, record.id));

  const expected = Buffer.from(record.codeHash);
  const actual = Buffer.from(sha(otp));
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (ok) await db.update(otpCodesTable).set({ isUsed: true }).where(eq(otpCodesTable.id, record.id));
  return ok;
}

export function resolveOtpChannel(identifier: { email?: string; phone?: string }) {
  if (identifier.phone) return { channel: "sms" as const, target: identifier.phone };
  if (identifier.email) return { channel: "email" as const, target: identifier.email };
  throw new Error("Email or phone is required");
}
