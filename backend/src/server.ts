import http from "node:http";
import cors from "cors";
import express from "express";
import "#db";
import { env } from "#config/env.js";
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
} from "#routes";
import { initRealtime } from "#services/realtime.service.js";

const app = express();

// Support comma-separated CORS origins (e.g. "http://localhost:5173,http://192.168.0.104:5173")
const parseOrigins = (raw?: string) => {
  if (!raw) return undefined;
  if (raw.trim() === "*") return "*";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

app.use(
  cors({
    origin: parseOrigins(env.CORS_ORIGIN),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
app.use("/api", swaggerRouter);

const bootstrap = async () => {
  // db index ensures connectToDatabase is exported; call it explicitly
  const { connectToDatabase } = await import("#db");
  await connectToDatabase();

  const server = http.createServer(app);
  initRealtime(server, env.CORS_ORIGIN);

  // listen on all interfaces so the backend is reachable from other machines on LAN
  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to bootstrap backend", error);
  process.exit(1);
});
