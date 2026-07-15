import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  analyticsPool,
  authPool,
  deliveryPool,
  getConfiguredDatabaseRoles,
  getStorageConfig,
  marketplacePool,
  orderPool,
  primaryPool,
  type DatabaseRole,
} from "@workspace/db";
import { getRedisHealth } from "@workspace/db/services/redis";

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

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "chowdharymart-api",
    databases: getConfiguredDatabaseRoles(),
    redis: getRedisHealth(),
    storage: getStorageConfig(),
  });
});

router.get("/health/databases", async (_req, res) => {
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

export default router;
