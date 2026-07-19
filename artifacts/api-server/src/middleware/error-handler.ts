import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db, systemErrorsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import type { AuthRequest } from "./auth";

export function createErrorReference() {
  return `ERR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function recordSystemError(req: Request, error: unknown, safeMessage = "Something went wrong. Please try again.") {
  const referenceId = createErrorReference();
  const authReq = req as AuthRequest;
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ err, referenceId, requestId: req.requestId, route: req.path }, "Request failed");
  try {
    await db.insert(systemErrorsTable).values({
      referenceId,
      requestId: req.requestId,
      userId: authReq.user?.userId ?? null,
      role: authReq.user?.role ?? null,
      route: req.originalUrl?.split("?")[0] ?? req.path,
      method: req.method,
      safeMessage,
      internalMessage: err.message,
      stack: err.stack,
      metadata: { correlationId: req.correlationId },
    });
  } catch (recordError) {
    logger.error({ err: recordError, referenceId }, "Could not persist system error");
  }
  return referenceId;
}

export function asyncHandler<TReq extends Request = Request>(
  handler: (req: TReq, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: TReq, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export async function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  const referenceId = await recordSystemError(req, err);
  res.status(500).json({
    error: "Something went wrong. Please try again.",
    referenceId,
  });
}
