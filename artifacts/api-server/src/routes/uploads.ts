import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { getStorageConfig, readEnv } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin", "vendor", "delivery_partner", "customer"));

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safeFolder(value: unknown) {
  return String(value ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .slice(0, 80) || "general";
}

function parseDataUrl(dataUrl: unknown) {
  const raw = String(dataUrl ?? "");
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("Valid base64 image is required.");
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new Error("Only JPG, PNG, WEBP or GIF images are allowed.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Image file is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image is too large. Please upload up to 5 MB.");
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1].replace("jpeg", "jpg");
  return { mime, buffer, ext };
}

function publicBaseUrl(req: AuthRequest) {
  return `${req.protocol}://${req.get("host")}`;
}

async function uploadLocal(req: AuthRequest, storagePath: string, buffer: Buffer) {
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  const target = path.join(uploadRoot, storagePath);
  if (!target.startsWith(uploadRoot)) throw new Error("Invalid upload path.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  const configuredBase = readEnv("STORAGE_PUBLIC_BASE_URL") || `${publicBaseUrl(req)}/uploads`;
  return `${configuredBase.replace(/\/+$/, "")}/${storagePath.replace(/\\/g, "/")}`;
}

async function uploadSupabase(storagePath: string, mime: string, buffer: Buffer) {
  const supabaseUrl = readEnv("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = readEnv("STORAGE_BUCKET") || readEnv("SUPABASE_STORAGE_BUCKET") || "chowdharymart-images";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage uploads.");
  }
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "content-type": mime,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${response.status}). ${detail.slice(0, 180)}`);
  }
  const configuredBase = readEnv("STORAGE_PUBLIC_BASE_URL");
  if (configuredBase) return `${configuredBase.replace(/\/+$/, "")}/${storagePath}`;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}

router.post("/image", async (req: AuthRequest, res) => {
  try {
    const { mime, buffer, ext } = parseDataUrl(req.body?.dataUrl);
    const config = getStorageConfig();
    const provider = String(config.provider || "local").toLowerCase();
    const folder = safeFolder(req.body?.folder);
    const userId = req.user?.userId ?? "guest";
    const storagePath = `${folder}/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

    let imageUrl: string;
    if (provider === "supabase") {
      imageUrl = await uploadSupabase(storagePath, mime, buffer);
    } else if (provider === "local") {
      imageUrl = await uploadLocal(req, storagePath, buffer);
    } else {
      throw new Error(`Storage provider '${provider}' is not enabled yet. Use STORAGE_PROVIDER=local or supabase.`);
    }

    res.status(201).json({
      imageUrl,
      storagePath,
      provider,
      mime,
      sizeBytes: buffer.length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Image upload failed" });
  }
});

export default router;
