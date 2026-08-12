import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, deliveryPartnersTable, storesTable, usersTable } from "@workspace/db";
import { verifyToken, type JwtPayload } from "../lib/auth";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = verifyToken(token);
    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role, isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);
    if (!user || !user.isActive || user.role !== payload.role) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export async function requireApprovedVendor(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role === "admin") {
    next();
    return;
  }
  if (req.user.role !== "vendor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [store] = await db
    .select({ isVerified: storesTable.isVerified, isActive: storesTable.isActive })
    .from(storesTable)
    .where(eq(storesTable.userId, req.user.userId))
    .limit(1);
  if (!store?.isVerified || !store.isActive) {
    res.status(403).json({ error: "Admin approval required for seller dashboard access" });
    return;
  }
  next();
}

export async function requireApprovedDeliveryPartner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role === "admin") {
    next();
    return;
  }
  if (req.user.role !== "delivery_partner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [partner] = await db
    .select({ isVerified: deliveryPartnersTable.isVerified })
    .from(deliveryPartnersTable)
    .where(eq(deliveryPartnersTable.userId, req.user.userId))
    .limit(1);
  if (!partner?.isVerified) {
    res.status(403).json({ error: "Admin approval required for delivery dashboard access" });
    return;
  }
  next();
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      // ignore invalid token — user is just unauthenticated
    }
  }
  next();
}
