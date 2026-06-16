import http from "node:http";
import cors from "cors";
import express from "express";
import "#db";
import { env, parseOrigins } from "#config";
import {
  messagesRouter,
  providersRouter,
  authRouter,
  adminRouter,
  uploadsRouter,
  keysRouter,
  linkRouter,
  providerConnectionsRouter,
  swaggerRouter,
  telegramRouter,
} from "#routes";
import { initRealtime, loadAllMTProtoSessions } from "#services";
import { notFoundHandler, errorHandler } from "#middleware";

const app = express();

app.use(
  cors({
    origin: parseOrigins(env.CORS_ORIGIN),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({
  limit: "4mb",
  verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
    req.rawBody = buf;
  },
}));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crypt-backend" });
});

app.use("/api", messagesRouter);
app.use("/api", providersRouter);
app.use("/api", authRouter);
app.use("/api", adminRouter);
app.use("/api", uploadsRouter);
app.use("/api", keysRouter);
app.use("/api", linkRouter);
app.use("/api", providerConnectionsRouter);
app.use("/api", swaggerRouter);
app.use("/api", telegramRouter);

app.use("*splat", notFoundHandler);
app.use(errorHandler);

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const bootstrap = async () => {
  const { connectToDatabase } = await import("#db");
  await connectToDatabase();

  const server = http.createServer(app);
  initRealtime(server, env.CORS_ORIGIN);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${env.PORT}`);
  });

  loadAllMTProtoSessions().catch((err) =>
    console.error("MTProto session restore failed:", err),
  );
};

bootstrap().catch((error) => {
  console.error("Failed to bootstrap backend", error);
  process.exit(1);
});
