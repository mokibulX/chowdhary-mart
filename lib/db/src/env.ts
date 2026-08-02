import fs from "node:fs";
import path from "node:path";

type EnvMap = Record<string, string | undefined>;
export type DatabaseRole = "primary" | "auth" | "marketplace" | "order" | "delivery" | "analytics";

type DatabaseEnvNames = {
  url: string;
  directUrl: string;
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
  ssl: string;
  poolMax: string;
};

const databaseEnvNames: Record<DatabaseRole, DatabaseEnvNames> = {
  primary: {
    url: "DATABASE_URL",
    directUrl: "DATABASE_DIRECT_URL",
    host: "DATABASE_HOST",
    port: "DATABASE_PORT",
    name: "DATABASE_NAME",
    user: "DATABASE_USER",
    password: "DATABASE_PASSWORD",
    ssl: "DATABASE_SSL",
    poolMax: "DATABASE_POOL_MAX",
  },
  auth: {
    url: "AUTH_DATABASE_URL",
    directUrl: "AUTH_DATABASE_DIRECT_URL",
    host: "AUTH_DATABASE_HOST",
    port: "AUTH_DATABASE_PORT",
    name: "AUTH_DATABASE_NAME",
    user: "AUTH_DATABASE_USER",
    password: "AUTH_DATABASE_PASSWORD",
    ssl: "AUTH_DATABASE_SSL",
    poolMax: "AUTH_DATABASE_POOL_MAX",
  },
  marketplace: {
    url: "MARKETPLACE_DATABASE_URL",
    directUrl: "MARKETPLACE_DATABASE_DIRECT_URL",
    host: "MARKETPLACE_DATABASE_HOST",
    port: "MARKETPLACE_DATABASE_PORT",
    name: "MARKETPLACE_DATABASE_NAME",
    user: "MARKETPLACE_DATABASE_USER",
    password: "MARKETPLACE_DATABASE_PASSWORD",
    ssl: "MARKETPLACE_DATABASE_SSL",
    poolMax: "MARKETPLACE_DATABASE_POOL_MAX",
  },
  order: {
    url: "ORDER_DATABASE_URL",
    directUrl: "ORDER_DATABASE_DIRECT_URL",
    host: "ORDER_DATABASE_HOST",
    port: "ORDER_DATABASE_PORT",
    name: "ORDER_DATABASE_NAME",
    user: "ORDER_DATABASE_USER",
    password: "ORDER_DATABASE_PASSWORD",
    ssl: "ORDER_DATABASE_SSL",
    poolMax: "ORDER_DATABASE_POOL_MAX",
  },
  delivery: {
    url: "DELIVERY_DATABASE_URL",
    directUrl: "DELIVERY_DATABASE_DIRECT_URL",
    host: "DELIVERY_DATABASE_HOST",
    port: "DELIVERY_DATABASE_PORT",
    name: "DELIVERY_DATABASE_NAME",
    user: "DELIVERY_DATABASE_USER",
    password: "DELIVERY_DATABASE_PASSWORD",
    ssl: "DELIVERY_DATABASE_SSL",
    poolMax: "DELIVERY_DATABASE_POOL_MAX",
  },
  analytics: {
    url: "ANALYTICS_DATABASE_URL",
    directUrl: "ANALYTICS_DATABASE_DIRECT_URL",
    host: "ANALYTICS_DATABASE_HOST",
    port: "ANALYTICS_DATABASE_PORT",
    name: "ANALYTICS_DATABASE_NAME",
    user: "ANALYTICS_DATABASE_USER",
    password: "ANALYTICS_DATABASE_PASSWORD",
    ssl: "ANALYTICS_DATABASE_SSL",
    poolMax: "ANALYTICS_DATABASE_POOL_MAX",
  },
};

let loaded = false;

function parseEnvFile(content: string) {
  const parsed: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsAt = line.indexOf("=");
    if (equalsAt <= 0) continue;
    const key = line.slice(0, equalsAt).trim();
    let value = line.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function findEnvFile(startDir: string) {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const envFile = findEnvFile(process.cwd());
  if (!envFile) return;
  const parsed = parseEnvFile(fs.readFileSync(envFile, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

function env(name: string) {
  loadEnv();
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function readEnv(name: string) {
  return env(name);
}

function boolEnv(name: string, fallback = false) {
  const value = env(name);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function databaseUrlFromParts(role: DatabaseRole) {
  const names = databaseEnvNames[role];
  const host = env(names.host);
  const database = env(names.name);
  const user = env(names.user);
  const password = env(names.password);
  if (!host || !database || !user || !password) return undefined;
  const port = env(names.port) ?? "5432";
  const ssl = boolEnv(names.ssl, true) ? "?sslmode=require" : "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}${ssl}`;
}

function databaseUrlKind(value?: string) {
  if (!value) return "missing";
  try {
    const url = new URL(value);
    if (url.hostname.includes("pooler.supabase.com")) return "supabase-pooler";
    if (/^db\.[^.]+\.supabase\.co$/i.test(url.hostname)) return "supabase-direct";
  } catch {
    return "other";
  }
  return "other";
}

export function getDatabaseUrlFor(
  role: DatabaseRole,
  { direct = false, required = true, allowPrimaryFallback = true }: { direct?: boolean; required?: boolean; allowPrimaryFallback?: boolean } = {},
) {
  const names = databaseEnvNames[role];
  const primaryNames = databaseEnvNames.primary;
  const configuredValue = direct
    ? env(names.directUrl) ?? (role === "primary" ? env("DIRECT_URL") : undefined) ?? env(names.url) ?? databaseUrlFromParts(role)
    : env(names.url) ?? databaseUrlFromParts(role);
  const fallback =
    role !== "primary" && allowPrimaryFallback
      ? direct
        ? env(primaryNames.directUrl) ?? env("DIRECT_URL") ?? env(primaryNames.url) ?? databaseUrlFromParts("primary")
        : env(primaryNames.url) ?? databaseUrlFromParts("primary")
      : undefined;
  const shouldPreferPrimaryPooler =
    !direct &&
    role !== "primary" &&
    databaseUrlKind(configuredValue) === "supabase-direct" &&
    databaseUrlKind(fallback) === "supabase-pooler";
  const resolved = shouldPreferPrimaryPooler ? fallback : configuredValue ?? fallback;
  if (!resolved && required) {
    throw new Error(
      `${role} database connection is not configured. Add ${names.url} to .env or provide ${names.host}, ${names.port}, ${names.name}, ${names.user} and ${names.password}.`,
    );
  }
  return resolved;
}

export function getDatabaseUrl({ direct = false, required = true }: { direct?: boolean; required?: boolean } = {}) {
  return getDatabaseUrlFor("primary", { direct, required, allowPrimaryFallback: false });
}

export function createPgPoolConfig(role: DatabaseRole = "primary") {
  const names = databaseEnvNames[role];
  const connectionString = getDatabaseUrlFor(role, { required: true });
  return {
    connectionString,
    max: Number(env(names.poolMax) ?? env("DATABASE_POOL_MAX") ?? 10),
    idleTimeoutMillis: Number(env("DATABASE_IDLE_TIMEOUT_MS") ?? 30_000),
    connectionTimeoutMillis: Number(env("DATABASE_CONNECTION_TIMEOUT_MS") ?? 10_000),
    ssl: boolEnv(names.ssl, boolEnv("DATABASE_SSL", true)) ? { rejectUnauthorized: false } : undefined,
  };
}

export function getConfiguredDatabaseRoles() {
  return (Object.keys(databaseEnvNames) as DatabaseRole[]).map((role) => ({
    role,
    configured: Boolean(getDatabaseUrlFor(role, { required: false, allowPrimaryFallback: false })),
    usingPrimaryFallback: role !== "primary" && !getDatabaseUrlFor(role, { required: false, allowPrimaryFallback: false }) && Boolean(getDatabaseUrlFor("primary", { required: false })),
    ssl: boolEnv(databaseEnvNames[role].ssl, boolEnv("DATABASE_SSL", true)),
  }));
}

export function getRedisConfig() {
  return {
    url: env("REDIS_URL"),
    queuePrefix: env("REDIS_QUEUE_PREFIX") ?? "chowdharymart",
    cacheTtlSeconds: Number(env("REDIS_CACHE_TTL_SECONDS") ?? 300),
    enabled: Boolean(env("REDIS_URL")),
  };
}

export function getStorageConfig() {
  const provider = env("STORAGE_PROVIDER") ?? (env("R2_BUCKET_NAME") ? "r2" : "local");
  return {
    provider,
    bucket: env("STORAGE_BUCKET") ?? env("R2_BUCKET_NAME"),
    publicBaseUrl: env("STORAGE_PUBLIC_BASE_URL") ?? env("R2_PUBLIC_CDN_URL"),
    endpoint: env("STORAGE_ENDPOINT"),
    region: env("STORAGE_REGION") ?? "auto",
    configured: provider === "local" || Boolean(env("STORAGE_BUCKET") ?? env("R2_BUCKET_NAME")),
  };
}

export function getJwtSecret() {
  const secret = env("JWT_ACCESS_SECRET") ?? env("JWT_SECRET") ?? env("SESSION_SECRET");
  if (!secret) throw new Error("JWT_ACCESS_SECRET, JWT_SECRET or SESSION_SECRET is required in .env.");
  return secret;
}

export function validateRuntimeEnv(options: { requireDatabase?: boolean; requireJwt?: boolean } = {}) {
  if (options.requireDatabase ?? true) getDatabaseUrl({ required: true });
  if (options.requireJwt ?? true) getJwtSecret();
  return {
    nodeEnv: env("NODE_ENV") ?? "development",
    port: env("PORT"),
    demoAccountsEnabled: boolEnv("ENABLE_DEMO_ACCOUNTS", false),
  };
}
