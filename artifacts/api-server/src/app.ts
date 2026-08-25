import express, { type Express } from "express";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/error-handler";
import { requestContext } from "./middleware/request-context";
import { getCorsOptions, securityHeaders } from "./middleware/security";

const app: Express = express();
// Render and other reverse proxies terminate TLS before forwarding requests.
// Trust the forwarded scheme so generated public upload URLs stay HTTPS.
app.set("trust proxy", 1);
const workspaceRoot = path.basename(process.cwd()) === "api-server"
  ? path.resolve(process.cwd(), "..", "..")
  : process.cwd();

app.disable("x-powered-by");
app.use(requestContext);
app.use(securityHeaders);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          requestId: req.raw.requestId,
          correlationId: req.raw.correlationId,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(getCorsOptions()));
app.use("/uploads", express.static(path.resolve(workspaceRoot, "uploads"), {
  immutable: true,
  maxAge: "30d",
  setHeaders(res) {
    res.setHeader("cross-origin-resource-policy", "cross-origin");
    res.setHeader("access-control-allow-origin", "*");
  },
}));
// Serve files created by older local runs, which wrote to artifacts/api-server/uploads.
// New uploads always use workspaceRoot/uploads above.
const legacyUploadRoot = path.resolve(process.cwd(), "uploads");
if (legacyUploadRoot !== path.resolve(workspaceRoot, "uploads") && existsSync(legacyUploadRoot)) {
  app.use("/uploads", express.static(legacyUploadRoot, {
    immutable: true,
    maxAge: "30d",
    setHeaders(res) {
      res.setHeader("cross-origin-resource-policy", "cross-origin");
      res.setHeader("access-control-allow-origin", "*");
    },
  }));
}
app.use(express.json({
  limit: process.env.REQUEST_JSON_LIMIT ?? "8mb",
  verify: (req, _res, buf) => {
    if (req.url?.startsWith("/api/webhooks/razorpay")) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_FORM_LIMIT ?? "1mb" }));

app.use("/api", router);

const webDist = path.resolve(workspaceRoot, "artifacts", "web", "dist", "public");
const webIndex = path.join(webDist, "index.html");
if (existsSync(webIndex)) {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path === "/api") {
      next();
      return;
    }
    res.sendFile(webIndex);
  });
}

app.use(errorHandler);

export default app;
