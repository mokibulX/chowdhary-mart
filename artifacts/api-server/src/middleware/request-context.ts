import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      startedAt?: number;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incomingRequestId = req.header("x-request-id");
  const incomingCorrelationId = req.header("x-correlation-id");
  req.requestId = cleanId(incomingRequestId) || crypto.randomUUID();
  req.correlationId = cleanId(incomingCorrelationId) || req.requestId;
  req.startedAt = Date.now();
  res.setHeader("x-request-id", req.requestId);
  res.setHeader("x-correlation-id", req.correlationId);
  next();
}

function cleanId(value?: string) {
  if (!value) return "";
  return /^[a-zA-Z0-9_.:-]{8,80}$/.test(value) ? value : "";
}
