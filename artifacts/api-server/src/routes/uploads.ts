import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router, type Request } from "express";
import { getStorageConfig, readEnv } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin", "vendor", "delivery_partner", "customer"));

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_DOCUMENT_MIME = new Set([...ALLOWED_MIME, "application/pdf"]);

function workspaceRoot() {
  return path.basename(process.cwd()) === "api-server"
    ? path.resolve(process.cwd(), "..", "..")
    : process.cwd();
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeFolder(value: unknown) {
  return String(value ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .slice(0, 80) || "general";
}

function parseDataUrl(dataUrl: unknown, allowPdf = false) {
  const raw = String(dataUrl ?? "");
  const match = raw.match(/^data:((?:image\/[a-z0-9.+-]+)|application\/pdf);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("Valid base64 image is required.");
  const mime = match[1].toLowerCase();
  if (!(allowPdf ? ALLOWED_DOCUMENT_MIME : ALLOWED_MIME).has(mime)) throw new Error(allowPdf ? "Only JPG, PNG, WEBP, GIF or PDF documents are allowed." : "Only JPG, PNG, WEBP or GIF images are allowed.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Image file is empty.");
  const maxBytes = allowPdf ? 10 * 1024 * 1024 : MAX_IMAGE_BYTES;
  if (buffer.length > maxBytes) throw new Error(`File is too large. Please upload up to ${allowPdf ? 10 : 5} MB.`);
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : mime.split("/")[1].replace("jpeg", "jpg");
  return { mime, buffer, ext };
}

export async function storePrivateDocument(req: Request, dataUrl: unknown, folder: string, ownerUserId: number) {
  const { mime, buffer, ext } = parseDataUrl(dataUrl, true);
  const storagePath = `${safeFolder(folder)}/${ownerUserId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const uploadRoot = path.resolve(workspaceRoot(), "private_uploads");
  const target = path.join(uploadRoot, storagePath);
  if (!isWithin(uploadRoot, target)) throw new Error("Invalid private upload path.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer, { mode: 0o600 });
  return { url: `/api/uploads/private/${storagePath.split("/").map(encodeURIComponent).join("/")}`, storagePath, mime, sizeBytes: buffer.length };
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
    let usedProvider = provider;
    if (provider === "supabase") {
      try {
        imageUrl = await uploadSupabase(storagePath, mime, buffer);
      } catch (error) {
        if (String(readEnv("STORAGE_FALLBACK_TO_LOCAL") ?? "true").toLowerCase() === "false") {
          throw error;
        }
        req.log.warn({ err: error }, "Supabase upload failed; using local storage fallback");
        imageUrl = await uploadLocal(req, storagePath, buffer);
        usedProvider = "local";
      }
    } else if (provider === "local") {
      imageUrl = await uploadLocal(req, storagePath, buffer);
    } else {
      throw new Error(`Storage provider '${provider}' is not enabled yet. Use STORAGE_PROVIDER=local or supabase.`);
    }

    res.status(201).json({
      imageUrl,
      storagePath,
      provider: usedProvider,
      mime,
      sizeBytes: buffer.length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Image upload failed" });
  }
});

router.get(/^\/private\/(.+)$/, async (req: AuthRequest, res) => {
  try {
    const requested = String(req.params[0] ?? "").split("/").map((part) => decodeURIComponent(part)).join("/");
    const parts = requested.split("/");
    if (parts.length < 3 || parts[0] !== "delivery-documents") { res.status(404).end(); return; }
    if (req.user!.role !== "admin" && Number(parts[1]) !== req.user!.userId) { res.status(403).json({ error: "Private document access denied" }); return; }
    const uploadRoot = path.resolve(workspaceRoot(), "private_uploads");
    const target = path.resolve(uploadRoot, requested);
    if (!isWithin(uploadRoot, target)) { res.status(400).end(); return; }
    res.sendFile(target, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" }, dotfiles: "deny" }, (error) => {
      if (error && !res.headersSent) {
        const statusCode = (error as Error & { statusCode?: number }).statusCode;
        res.status(statusCode === 403 ? 403 : 404).end();
      }
    });
  } catch (err) {
    req.log.error(err);
    res.status(404).end();
  }
});

// Older registrations may contain a local `/uploads/...` reference. Keep those
// records viewable to admins without exposing the legacy file through the UI.
router.get(/^\/legacy\/(.+)$/, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Legacy document access denied" }); return; }
    const requested = String(req.params[0] ?? "").split("/").map((part) => decodeURIComponent(part)).join("/");
    const uploadRoot = path.resolve(workspaceRoot(), "uploads");
    const target = path.resolve(uploadRoot, requested);
    if (!isWithin(uploadRoot, target)) { res.status(400).end(); return; }
    res.sendFile(target, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" }, dotfiles: "deny" }, (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    req.log.error(err);
    res.status(404).end();
  }
});

export default router;
