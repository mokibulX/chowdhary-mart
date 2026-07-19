import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, idempotencyRecordsTable } from "@workspace/db";

export type IdempotencyReplay =
  | { state: "missing" }
  | { state: "replay"; status: number; body: Record<string, unknown> }
  | { state: "conflict"; message: string }
  | { state: "processing"; message: string };

export function requestHash(payload: unknown) {
  return crypto.createHash("sha256").update(stableStringify(payload ?? {})).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function getIdempotencyKey(headers: { [key: string]: string | string[] | undefined }) {
  const raw = headers["idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return typeof key === "string" && /^[a-zA-Z0-9_.:-]{12,180}$/.test(key) ? key : "";
}

export async function inspectIdempotency(key: string, userId: number, endpoint: string, hash: string): Promise<IdempotencyReplay> {
  if (!key) return { state: "missing" };
  const [record] = await db.select().from(idempotencyRecordsTable)
    .where(and(eq(idempotencyRecordsTable.key, key), eq(idempotencyRecordsTable.endpoint, endpoint)))
    .limit(1);
  if (!record) return { state: "missing" };
  if (record.userId !== userId) return { state: "conflict", message: "Idempotency key is not valid for this user." };
  if (record.requestHash !== hash) return { state: "conflict", message: "Idempotency key was already used with a different request." };
  if (record.responseStatus && record.responseBody) {
    return { state: "replay", status: record.responseStatus, body: record.responseBody };
  }
  return { state: "processing", message: "This request is already being processed. Please retry with the same key." };
}

export async function beginIdempotency(key: string, userId: number, endpoint: string, hash: string): Promise<IdempotencyReplay | { state: "claimed" }> {
  if (!key) return { state: "missing" };
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
  const inserted = await db.insert(idempotencyRecordsTable)
    .values({
      key,
      userId,
      endpoint,
      requestHash: hash,
      lockedUntil,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyRecordsTable.id });
  if (inserted.length) return { state: "claimed" };
  return inspectIdempotency(key, userId, endpoint, hash);
}

export async function saveIdempotencyResponse({
  key,
  userId,
  endpoint,
  hash,
  status,
  body,
  resourceId,
}: {
  key: string;
  userId: number;
  endpoint: string;
  hash: string;
  status: number;
  body: Record<string, unknown>;
  resourceId?: string;
}) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
  await db.insert(idempotencyRecordsTable)
    .values({
      key,
      userId,
      endpoint,
      requestHash: hash,
      responseStatus: status,
      responseBody: body,
      resourceId,
      lockedUntil,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [idempotencyRecordsTable.key, idempotencyRecordsTable.endpoint],
      set: {
        responseStatus: status,
        responseBody: body,
        resourceId,
        lockedUntil,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}
