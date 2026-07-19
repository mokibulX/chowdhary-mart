import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, outboxEventsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const instanceId = process.env.API_INSTANCE_ID || `worker-${process.pid}`;
const concurrency = Math.max(1, Number(process.env.ORDER_QUEUE_CONCURRENCY || process.env.OUTBOX_WORKER_CONCURRENCY || 4));
const maxRetries = Math.max(1, Number(process.env.QUEUE_MAX_RETRIES || 8));
const pollMs = Math.max(250, Number(process.env.OUTBOX_POLL_MS || 1000));

async function main() {
  logger.info({ instanceId, concurrency, maxRetries }, "Outbox worker started");
  for (;;) {
    const batch = await claimBatch(concurrency);
    if (!batch.length) {
      await sleep(pollMs);
      continue;
    }
    await Promise.all(batch.map(processEvent));
  }
}

async function claimBatch(limit: number) {
  return db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEventsTable)
      .where(and(eq(outboxEventsTable.status, "pending"), lte(outboxEventsTable.availableAt, new Date())))
      .orderBy(asc(outboxEventsTable.availableAt), asc(outboxEventsTable.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (!events.length) return [];
    await tx
      .update(outboxEventsTable)
      .set({ status: "failed", updatedAt: new Date(), lastError: `leased:${instanceId}` })
      .where(inArray(outboxEventsTable.id, events.map((event) => event.id)));
    return events;
  });
}

async function processEvent(event: typeof outboxEventsTable.$inferSelect) {
  try {
    await publishEvent(event);
    await db.update(outboxEventsTable)
      .set({ status: "published", publishedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(outboxEventsTable.id, event.id));
  } catch (error) {
    const retryCount = event.retryCount + 1;
    const dead = retryCount >= maxRetries;
    const delayMs = Math.min(15 * 60_000, Number(process.env.QUEUE_RETRY_BASE_MS || 1000) * 2 ** Math.min(retryCount, 8));
    await db.update(outboxEventsTable)
      .set({
        status: dead ? "dead" : "pending",
        retryCount,
        availableAt: new Date(Date.now() + delayMs),
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(outboxEventsTable.id, event.id));
  }
}

async function publishEvent(event: typeof outboxEventsTable.$inferSelect) {
  // Local durable mode: DB outbox is the source of truth. Managed queues can be integrated here
  // by switching on QUEUE_PROVIDER while keeping the same idempotent event schema.
  logger.info({ eventId: event.id, eventType: event.eventType, aggregateId: event.aggregateId }, "Outbox event published");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.fatal({ err: error }, "Outbox worker crashed");
  process.exit(1);
});
