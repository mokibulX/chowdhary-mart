import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { desc, eq, sql } from "drizzle-orm";
import {
  analyticsPool,
  authPool,
  deliveryPool,
  getConfiguredDatabaseRoles,
  getStorageConfig,
  marketplacePool,
  orderPool,
  primaryPool,
  db,
  outboxEventsTable,
  systemErrorsTable,
  type DatabaseRole,
} from "@workspace/db";
import { getRedisHealth } from "@workspace/db/services/redis";
import { requireAuth, requireRole } from "../middleware/auth";

const router: IRouter = Router();
const pools = {
  primary: primaryPool,
  auth: authPool,
  marketplace: marketplacePool,
  order: orderPool,
  delivery: deliveryPool,
  analytics: analyticsPool,
} satisfies Record<DatabaseRole, typeof primaryPool>;

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/health/ready", async (_req, res) => {
  try {
    await primaryPool.query("select 1 as ok");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "chowdharymart-api",
  });
});

router.get("/admin/health/dependencies", requireAuth, requireRole("admin"), (_req, res) => {
  res.json({
    status: "ok",
    service: "chowdharymart-api",
    databases: getConfiguredDatabaseRoles(),
    redis: getRedisHealth(),
    storage: getStorageConfig(),
  });
});

router.get("/admin/health/databases", requireAuth, requireRole("admin"), async (_req, res) => {
  const configured = getConfiguredDatabaseRoles();
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(
    configured.map(async (entry) => {
      try {
        const pool = pools[entry.role];
        await pool.query("select 1 as ok");
        return { ...entry, connected: true, status: "ok" as const };
      } catch (error) {
        return {
          ...entry,
          connected: false,
          status: "error" as const,
          message: error instanceof Error ? error.message : "Unknown database error",
        };
      }
    }),
  );
  res.status(results.every((item) => item.connected) ? 200 : 503).json({ checkedAt, results });
});

router.get("/admin/operations/queues", requireAuth, requireRole("admin"), async (_req, res) => {
  const rows = await db
    .select({
      status: outboxEventsTable.status,
      count: sql<number>`count(*)::int`,
      oldestAvailableAt: sql<string | null>`min(${outboxEventsTable.availableAt})`,
    })
    .from(outboxEventsTable)
    .groupBy(outboxEventsTable.status);
  res.json({
    checkedAt: new Date().toISOString(),
    provider: process.env.QUEUE_PROVIDER || "database-outbox",
    outbox: rows,
  });
});

router.get("/admin/operations/errors/:referenceId", requireAuth, requireRole("admin"), async (req, res) => {
  const [error] = await db
    .select()
    .from(systemErrorsTable)
    .where(eq(systemErrorsTable.referenceId, String(req.params.referenceId)))
    .orderBy(desc(systemErrorsTable.createdAt))
    .limit(1);
  if (!error) {
    res.status(404).json({ error: "Error reference not found" });
    return;
  }
  res.json(error);
});

export default router;
