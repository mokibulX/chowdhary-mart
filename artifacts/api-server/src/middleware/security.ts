import type { NextFunction, Request, Response } from "express";

const defaultCorsAllowlist = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];

function isAllowedRenderOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(self), geolocation=(self), microphone=()");
  res.setHeader("cross-origin-resource-policy", "same-site");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
}

export function getCorsOptions() {
  const configured = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowlist = Array.from(new Set([...defaultCorsAllowlist, ...configured]));
  return {
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
      if (
        !origin ||
        allowlist.includes(origin) ||
        allowlist.includes("*") ||
        (process.env.NODE_ENV === "production" && isAllowedRenderOrigin(origin))
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };
}
