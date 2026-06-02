import http from "node:http";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { connectToDatabase } from "./db/connect.js";
import { messagesRouter } from "./routes/messages.route.js";
import { providersRouter } from "./routes/providers.route.js";
import adminRouter from "./routes/admin.route.js";
import uploadsRouter from "./routes/uploads.route.js";
import keysRouter from "./routes/keys.route.js";
import linkRouter from "./routes/link.route.js";
import authRouter from "./routes/auth.route.js";
import providerConnectionsRouter from "./routes/providerConnections.route.js";
import { initRealtime } from "./services/realtime.service.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
  }),
);
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crypt-backend" });
  return;
});

app.use("/api", messagesRouter);
app.use("/api", providersRouter);
app.use("/api", authRouter);
app.use("/api", adminRouter);
app.use("/api", uploadsRouter);
app.use("/api", keysRouter);
app.use("/api", linkRouter);
app.use("/api", providerConnectionsRouter);

const bootstrap = async () => {
  await connectToDatabase();

  const server = http.createServer(app);
  initRealtime(server, env.CORS_ORIGIN);

  server.listen(env.PORT, () => {
    console.log(`Backend listening on http://localhost:${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to bootstrap backend", error);
  process.exit(1);
});
