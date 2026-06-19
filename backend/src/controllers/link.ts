import type { RequestHandler } from "express";
import crypto from "crypto";
import { Link, ProviderConnection, Key } from "#models";
import { logEvent } from "#services";
import { env } from "#config";
import type { InitLinkBody, CompleteLinkBody } from "#schemas";

export const initLink: RequestHandler = async (req, res, next) => {
  const { provider = "telegram", ttlMinutes = 15 } = req.body as InitLinkBody;
  const code = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  try {
    const claimedAccountId = req.account?.accountId ?? null;
    const record = await Link.create({ code, provider, expiresAt, claimedAccountId });

    let deepLinkMobile: string | null = null;
    let deepLinkWeb: string | null = null;
    try {
      if (provider === "whatsapp" && env.WHATSAPP_NUMBER) {
        const phone = env.WHATSAPP_NUMBER.replace(/[^0-9+]/g, "");
        deepLinkMobile = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent("LINK " + record.code)}`;
        deepLinkWeb = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent("LINK " + record.code)}`;
      }
      if (provider === "telegram" && env.TELEGRAM_BOT_USERNAME) {
        deepLinkMobile = `tg://resolve?domain=${encodeURIComponent(env.TELEGRAM_BOT_USERNAME)}&start=${encodeURIComponent(record.code)}`;
        deepLinkWeb = `https://t.me/${encodeURIComponent(env.TELEGRAM_BOT_USERNAME)}?start=${encodeURIComponent(record.code)}`;
      }
    } catch (deepLinkErr) {
      console.error("Failed to build deep link:", deepLinkErr);
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
  } catch (error) {
    next(error);
  }
};

export const getLinkStatus: RequestHandler = async (req, res, next) => {
  const code = String(req.params.code || "");
  const accountId = req.account!.accountId;
  if (!code) {
    next(new Error("Missing link code", { cause: { status: 400 } }));
    return;
  }

  try {
    const record = await Link.findOne({ code }).lean();
    if (!record) {
      next(new Error("Link not found", { cause: { status: 404 } }));
      return;
    }

    if (record.claimedAccountId && record.claimedAccountId.toString() !== accountId) {
      next(new Error("Forbidden", { cause: { status: 403 } }));
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
  } catch (error) {
    next(error);
  }
};

export const completeLink: RequestHandler = async (req, res, next) => {
  const { code, provider = "telegram", providerChatId, providerDisplayName } = req.body as CompleteLinkBody;

  try {
    const record = await Link.findOne({ code, provider });
    if (!record) {
      next(new Error("Link code not found", { cause: { status: 404 } }));
      return;
    }
    if (record.completed) {
      next(new Error("Link already completed", { cause: { status: 400 } }));
      return;
    }
    if (record.expiresAt < new Date()) {
      next(new Error("Link expired", { cause: { status: 400 } }));
      return;
    }

    record.completed = true;
    void logEvent("info", "link:completed", {
      provider,
      providerChatId,
      accountId: record.claimedAccountId?.toString() ?? null,
    });
    record.providerChatId = providerChatId;
    if (providerDisplayName) record.providerDisplayName = providerDisplayName;
    await record.save();

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
      console.error("Failed to create ProviderConnection in admin complete:", err);
    }

    try {
      if (record.claimedAccountId) {
        const existingKey = await Key.findOne({ ownerId: record.claimedAccountId.toString() }).lean();
        if (existingKey?.publicKey) {
          await Key.findOneAndUpdate(
            { ownerId: providerChatId },
            { publicKey: existingKey.publicKey },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }
      }
    } catch (err) {
      console.error("Failed to copy public key to providerChatId:", err);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
};
