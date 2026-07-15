import { getRedisConfig } from "../env";

export type RedisHealth = {
  enabled: boolean;
  status: "not_configured" | "configured";
  queuePrefix: string;
  cacheTtlSeconds: number;
};

export function getRedisHealth(): RedisHealth {
  const config = getRedisConfig();
  return {
    enabled: config.enabled,
    status: config.enabled ? "configured" : "not_configured",
    queuePrefix: config.queuePrefix,
    cacheTtlSeconds: config.cacheTtlSeconds,
  };
}
