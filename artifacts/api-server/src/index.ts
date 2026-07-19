import app from "./app";
import { logger } from "./lib/logger";
import { validateRuntimeEnv } from "@workspace/db/env";
import { createServer } from "node:http";
import { Server } from "socket.io";

validateRuntimeEnv({ requireDatabase: true, requireJwt: true });

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join:order", (orderId) => {
    if (orderId) socket.join(`delivery:tracking:${orderId}`);
  });
  socket.on("join:rider", (deliveryPartnerId) => {
    if (deliveryPartnerId) socket.join(`rider:location:${deliveryPartnerId}`);
  });
  socket.on("join:zone", (zoneId) => {
    if (zoneId) socket.join(`zone:riders:${zoneId}`);
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
