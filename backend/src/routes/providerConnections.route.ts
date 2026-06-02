import { Router } from "express";
import { z } from "zod";
import { ProviderConnection } from "../models/providerConnection.model.js";
import { requireAuth } from "./auth.route.js";
import { env } from "../config/env.js";
import { encryptSecret } from "../services/secret.service.js";

const router = Router();

// Middleware: allow either admin header or normal JWT auth.
const adminOrAuth = (req: any, res: any, next: any) => {
  const adminHeader = String(req.header("x-webhook-admin-token") || "");
  if (
    adminHeader &&
    env.WEBHOOK_ADMIN_TOKEN &&
    adminHeader === env.WEBHOOK_ADMIN_TOKEN
  ) {
    req.__isAdminOverride = true;
    return next();
  }
  return requireAuth(req, res, next);
};

router.get("/provider/connections", requireAuth, async (req: any, res) => {
  const accountId = req.account?.accountId;
  if (!accountId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const connections = await ProviderConnection.find({ accountId }).lean();
  res.status(200).json({ ok: true, data: connections });
  return;
});

// Resolve a provider chatId to the owning account (public endpoint)
router.get("/provider/resolve", async (req, res) => {
  const provider = String(req.query.provider || "");
  const chatId = String(req.query.chatId || "");
  if (!provider || !chatId) {
    res.status(400).json({ ok: false, error: "missing provider or chatId" });
    return;
  }

  const conn = await ProviderConnection.findOne({
    provider: provider as any,
    providerChatId: chatId,
  } as any).lean();
  if (!conn) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }

  // Attempt to populate account email
  try {
    // Lazy require to avoid circular dep issues
    const { Account } = await import("../models/account.model.js");
    const account = await Account.findById(conn.accountId).lean();
    res.status(200).json({
      ok: true,
      data: { accountId: conn.accountId, email: account?.email ?? null },
    });
    return;
  } catch (err) {
    res.status(200).json({ ok: true, data: { accountId: conn.accountId } });
    return;
  }
});

router.delete(
  "/provider/connections/:id",
  requireAuth,
  async (req: any, res) => {
    const accountId = req.account?.accountId;
    const id = req.params.id;
    if (!accountId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const conn = await ProviderConnection.findById(id);
    if (!conn) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }

    if (conn.accountId.toString() !== accountId) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    await conn.deleteOne();
    res.status(200).json({ ok: true });
    return;
  },
);

// Set encrypted provider credentials for a connection (admin or owner)
router.post(
  "/provider/connections/:id/credentials",
  adminOrAuth,
  async (req: any, res) => {
    const parsed = z
      .object({
        token: z.string().min(1),
        phoneNumberId: z.string().optional(),
      })
      .safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const { token, phoneNumberId } = parsed.data;
    const id = req.params.id;

    const conn = await ProviderConnection.findById(id);
    if (!conn) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }

    if (!req.__isAdminOverride) {
      const accountId = req.account?.accountId;
      if (!accountId) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      if (conn.accountId.toString() !== accountId) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
    }

    try {
      const encrypted = encryptSecret(token);
      conn.encryptedToken = encrypted;
      if (phoneNumberId) {
        conn.meta = { ...(conn.meta || {}), phoneNumberId };
      }
      await conn.save();
      res.status(200).json({ ok: true, data: { id: conn._id } });
      return;
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: "failed to encrypt/save token" });
      return;
    }
  },
);

export default router;
