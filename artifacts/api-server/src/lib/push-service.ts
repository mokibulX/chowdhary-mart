import { eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { createSign } from "node:crypto";

type PushPayload = {
  userId: number;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getFcmAccessToken() {
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const jwt = `${unsigned}.${base64Url(signer.sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth failed: ${await response.text().catch(() => response.statusText)}`);
  const data = await response.json() as { access_token?: string };
  return data.access_token ?? null;
}

async function sendFcmV1(tokens: string[], payload: PushPayload) {
  const projectId = process.env.FCM_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId || tokens.length === 0) return { sent: 0, skipped: tokens.length };
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return { sent: 0, skipped: tokens.length };
  let sent = 0;
  for (const token of tokens) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: Object.fromEntries(Object.entries(payload.data ?? {}).map(([key, value]) => [key, String(value)])),
          android: { priority: "HIGH", notification: { sound: "default", channel_id: "orders" } },
        },
      }),
    });
    if (response.ok) sent += 1;
  }
  return { sent, skipped: tokens.length - sent };
}

async function sendFcmLegacy(tokens: string[], payload: PushPayload) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey || tokens.length === 0) return { sent: 0, skipped: tokens.length };
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: { authorization: `key=${serverKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      registration_ids: tokens,
      priority: "high",
      notification: { title: payload.title, body: payload.body, sound: "default", android_channel_id: "orders" },
      data: payload.data ?? {},
    }),
  });
  if (!response.ok) throw new Error(`FCM push failed: ${response.status}`);
  return { sent: tokens.length, skipped: 0 };
}

export async function registerPushToken(input: { userId: number; token: string; platform?: string; deviceId?: string }) {
  const token = input.token.trim();
  if (!token) throw new Error("Push token is required");
  const existing = await db.select().from(pushTokensTable).where(eq(pushTokensTable.token, token)).limit(1);
  if (existing[0]) {
    const [updated] = await db.update(pushTokensTable)
      .set({ userId: input.userId, platform: input.platform ?? existing[0].platform, deviceId: input.deviceId ?? existing[0].deviceId, isActive: true, updatedAt: new Date() })
      .where(eq(pushTokensTable.id, existing[0].id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(pushTokensTable).values({
    userId: input.userId,
    token,
    platform: input.platform ?? "web",
    deviceId: input.deviceId ?? null,
  }).returning();
  return created;
}

export async function createAndPushNotification(payload: PushPayload) {
  const [notification] = await db.insert(notificationsTable).values({
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }).returning();

  const tokens = await db.select().from(pushTokensTable)
    .where(eq(pushTokensTable.userId, payload.userId));
  const activeTokens = tokens.filter((item) => item.isActive).map((item) => item.token);

  let push = { sent: 0, skipped: activeTokens.length };
  try {
    push = await sendFcmV1(activeTokens, payload);
    if (push.sent === 0) push = await sendFcmLegacy(activeTokens, payload);
  } catch {
    push = { sent: 0, skipped: activeTokens.length };
  }

  return { notification, push };
}
