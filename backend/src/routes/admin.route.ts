import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export const adminRouter = Router();

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header("x-admin-token");
  if (!env.WEBHOOK_ADMIN_TOKEN || token !== env.WEBHOOK_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  return next();
};

adminRouter.post(
  "/admin/telegram/set-webhook",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const url = req.body?.url;

    if (!url || typeof url !== "string") {
      res.status(400).json({ ok: false, error: "missing url" });
      return;
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
      res.status(400).json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
      return;
    }

    const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
    const body: Record<string, unknown> = { url };
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      body.secret_token = env.TELEGRAM_WEBHOOK_SECRET;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        res.status(500).json({ ok: false, error: data });
        return;
      }

      res.json({ ok: true, data });
      return;
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  },
);

adminRouter.post(
  "/admin/telegram/delete-webhook",
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    if (!env.TELEGRAM_BOT_TOKEN) {
      res.status(400).json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
      return;
    }

    const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`;

    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        res.status(500).json({ ok: false, error: data });
        return;
      }

      res.json({ ok: true, data });
      return;
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  },
);

export default adminRouter;
