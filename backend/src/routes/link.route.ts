import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Link } from "../models/link.model.js";
import { env } from "../config/env.js";
import { requireAuth } from "./auth.route.js";
import { ProviderConnection } from "../models/providerConnection.model.js";
import { Key } from "../models/key.model.js";
import { Account } from "../models/account.model.js";

const linkRouter = Router();

const initSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  ttlMinutes: z.number().int().positive().optional(),
});

linkRouter.post("/provider/link/init", requireAuth, async (req: any, res) => {
  const parsed = initSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const provider = parsed.data.provider ?? "telegram";
  const ttl = parsed.data.ttlMinutes ?? 15;

  // generate a short code
  const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
  const code = raw.slice(0, 6);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  try {
    const claimedAccountId = req.account?.accountId ?? null;
    const record = await Link.create({
      code,
      provider,
      expiresAt,
      claimedAccountId,
    });

    // compute deep-link URLs for mobile/web when possible
    let deepLinkMobile: string | null = null;
    let deepLinkWeb: string | null = null;
    try {
      if (provider === "whatsapp" && env.WHATSAPP_NUMBER) {
        const phone = env.WHATSAPP_NUMBER.replace(/[^0-9+]/g, "");
        deepLinkMobile = `whatsapp://send?phone=${encodeURIComponent(
          phone,
        )}&text=${encodeURIComponent("LINK " + record.code)}`;
        deepLinkWeb = `https://api.whatsapp.com/send?phone=${encodeURIComponent(
          phone,
        )}&text=${encodeURIComponent("LINK " + record.code)}`;
      }
      if (provider === "telegram" && env.TELEGRAM_BOT_USERNAME) {
        deepLinkMobile = `tg://resolve?domain=${encodeURIComponent(
          env.TELEGRAM_BOT_USERNAME,
        )}&start=${encodeURIComponent(record.code)}`;
        deepLinkWeb = `https://t.me/${encodeURIComponent(
          env.TELEGRAM_BOT_USERNAME,
        )}?start=${encodeURIComponent(record.code)}`;
      }
    } catch (e) {
      deepLinkMobile = null;
      deepLinkWeb = null;
    }

    res.status(200).json({
      ok: true,
      data: {
        code: record.code,
        provider: record.provider,
        expiresAt: record.expiresAt,
        deepLinkMobile,
        deepLinkWeb,
      },
    });
    return;
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});

linkRouter.get("/provider/link/status/:code", async (req, res) => {
  const code = String(req.params.code || "");
  if (!code) {
    res.status(400).json({ ok: false, error: "missing code" });
    return;
  }

  const record = await Link.findOne({ code }).lean();
  if (!record) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      code: record.code,
      provider: record.provider,
      completed: record.completed,
      providerChatId: record.providerChatId,
      providerDisplayName: record.providerDisplayName,
      expiresAt: record.expiresAt,
    },
  });
  return;
});

const requireAdmin = (req: any, res: any, next: any) => {
  const token = req.header("x-admin-token");
  if (!env.WEBHOOK_ADMIN_TOKEN || token !== env.WEBHOOK_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  return next();
};

const completeSchema = z.object({
  code: z.string().min(1),
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  providerChatId: z.string().min(1),
  providerDisplayName: z.string().optional(),
});

linkRouter.post("/provider/link/complete", requireAdmin, async (req, res) => {
  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const {
    code,
    provider = "telegram",
    providerChatId,
    providerDisplayName,
  } = parsed.data;

  const record = await Link.findOne({ code, provider });
  if (!record) {
    res.status(404).json({ ok: false, error: "link code not found" });
    return;
  }

  if (record.completed) {
    res.status(400).json({ ok: false, error: "already completed" });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(400).json({ ok: false, error: "link expired" });
    return;
  }

  record.completed = true;
  record.providerChatId = providerChatId;
  if (providerDisplayName) record.providerDisplayName = providerDisplayName;
  await record.save();

  // If this link is claimed by an account, persist a ProviderConnection
  try {
    if (record.claimedAccountId) {
      const existing = await ProviderConnection.findOne({
        accountId: record.claimedAccountId,
        provider,
        providerChatId,
      });
      if (!existing) {
        await ProviderConnection.create({
          accountId: record.claimedAccountId,
          provider,
          providerChatId,
          displayName: providerDisplayName,
        });
      }
    }
  } catch (err) {
    console.error(
      "Failed to create ProviderConnection in admin complete:",
      err,
    );
  }

  // If the account had a registered public key, copy it to the providerChatId
  try {
    if (record.claimedAccountId) {
      const account = await Account.findById(record.claimedAccountId).lean();
      const accountEmail = account?.email;
      if (accountEmail) {
        const existingKey = await Key.findOne({ ownerId: accountEmail }).lean();
        if (existingKey?.publicKey) {
          await Key.findOneAndUpdate(
            { ownerId: providerChatId },
            { publicKey: existingKey.publicKey },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }
      }
    }
  } catch (err) {
    console.error("Failed to copy public key to providerChatId:", err);
  }

  res.status(200).json({ ok: true });
  return;
});

export default linkRouter;
