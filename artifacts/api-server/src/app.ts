import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/error-handler";
import { requestContext } from "./middleware/request-context";
import { getCorsOptions, securityHeaders } from "./middleware/security";

const app: Express = express();

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
app.use(express.json({
  limit: process.env.REQUEST_JSON_LIMIT ?? "1mb",
  verify: (req, _res, buf) => {
    if (req.url?.startsWith("/api/webhooks/razorpay")) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_FORM_LIMIT ?? "1mb" }));

app.use("/api", router);
app.use(errorHandler);

export default app;
