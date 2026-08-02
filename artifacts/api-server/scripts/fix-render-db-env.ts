import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromDbPackage = createRequire(path.resolve(process.cwd(), "../../lib/db/package.json"));
const pg = requireFromDbPackage("pg") as typeof import("pg");

const DB_KEYS = [
  "DATABASE_URL",
  "MARKETPLACE_DATABASE_URL",
  "AUTH_DATABASE_URL",
  "ORDER_DATABASE_URL",
  "DELIVERY_DATABASE_URL",
  "ANALYTICS_DATABASE_URL",
];

const REGIONS = [
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "sa-east-1",
];

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

function parseEnv(lines: string[]) {
  const map = new Map<string, { index: number; value: string }>();
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match || line.trim().startsWith("#")) return;
    map.set(match[1], { index, value: match[2].trim().replace(/^["']|["']$/g, "") });
  });
  return map;
}

function quoteEnv(value: string) {
  return value.includes("#") || /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function setEnvLine(lines: string[], map: Map<string, { index: number; value: string }>, key: string, value: string) {
  const next = `${key}=${quoteEnv(value)}`;
  const existing = map.get(key);
  if (existing) {
    lines[existing.index] = next;
    existing.value = value;
    return;
  }
  lines.push(next);
  map.set(key, { index: lines.length - 1, value });
}

function projectRefFromDirectUrl(url: URL) {
  return url.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "";
}

function makeSessionPoolerUrl(raw: string, projectRef: string, region: string) {
  const url = new URL(raw);
  url.protocol = "postgresql:";
  url.hostname = `aws-0-${region}.pooler.supabase.com`;
  url.port = "5432";
  url.username = `postgres.${projectRef}`;
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

async function canConnect(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function resolvePoolerUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  if (url.hostname.includes("pooler.supabase.com")) return currentUrl;

  const projectRef = projectRefFromDirectUrl(url);
  if (!projectRef) {
    throw new Error("DATABASE_URL is not a Supabase direct or pooler URL.");
  }

  for (const region of REGIONS) {
    const candidate = makeSessionPoolerUrl(currentUrl, projectRef, region);
    if (await canConnect(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not auto-detect Supabase pooler region. Copy the Session pooler URL from Supabase > Connect > Pooler.");
}

async function main() {
  const envFile = findEnvFile(process.cwd());
  if (!envFile) throw new Error(".env file not found.");

  const original = fs.readFileSync(envFile, "utf8");
  const lines = original.split(/\r?\n/);
  const map = parseEnv(lines);
  const databaseUrl = map.get("DATABASE_URL")?.value;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env.");

  const poolerUrl = await resolvePoolerUrl(databaseUrl);
  for (const key of DB_KEYS) setEnvLine(lines, map, key, poolerUrl);
  setEnvLine(lines, map, "DATABASE_SSL", "true");

  fs.writeFileSync(envFile, `${lines.join("\n").replace(/\n*$/, "")}\n`);
  const host = new URL(poolerUrl).host;
  console.log(JSON.stringify({ updated: true, envFile, host, keys: DB_KEYS.length + 1 }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
