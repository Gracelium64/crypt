import http from "node:http";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { connectToDatabase } from "./db/connect.js";
import { messagesRouter } from "./routes/messages.route.js";
import { providersRouter } from "./routes/providers.route.js";
import { initRealtime } from "./services/realtime.service.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
  }),
);
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  return res.json({ ok: true, service: "crypt-backend" });
});

app.use("/api", messagesRouter);
app.use("/api", providersRouter);

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
