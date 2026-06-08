import { Router } from "express";
import { z } from "zod";
import { Message, ProviderConnection } from "#models";
import { isMarkedCiphertext } from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { requireAuth } from "./auth.route.js";

const sendSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  from: z.string().min(1),
  to: z.string().min(1),
  chatId: z.string().min(1),
  // Either client-provided ciphertext or plaintext (plaintext will not be persisted)
  text: z.string().optional(),
  encryptedText: z.string().optional(),
  encrypt: z.boolean().default(true),
  attachments: z
    .array(
      z.object({
        type: z.literal("image"),
        url: z.string().url(),
      }),
    )
    .default([]),
});

const querySchema = z.object({
  since: z.string().optional(),
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  chatId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
});

const conversationQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(200),
});

type ConversationSummary = {
  provider: "telegram" | "whatsapp";
  chatId: string;
  counterpart: string;
  messageCount: number;
  secureMessageCount: number;
  plainMessageCount: number;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  lastMessagePreview: string;
  securityState: "secure" | "plain" | "mixed";
};

const previewMessage = (message: {
  encryptedText?: string | null;
  bodyOmitted?: boolean | null;
}) => {
  if (message.bodyOmitted) return "(content omitted for privacy)";
  const candidate = message.encryptedText?.trim() || "(empty)";
  if (candidate.length <= 96) return candidate;
  return `${candidate.slice(0, 93)}...`;
};

const isSecureMessage = (message: { encryptedText?: string | null }) =>
  isMarkedCiphertext(message.encryptedText ?? "");

export const messagesRouter = Router();

messagesRouter.get("/messages", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { since, provider, chatId, limit } = parsed.data;
  const query: Record<string, unknown> = {};

  if (provider) query.provider = provider;
  if (chatId) query.chatId = chatId;
  if (since) query.createdAt = { $gt: new Date(since) };

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ data: messages.reverse() });
  return;
});

messagesRouter.get("/conversations", async (req, res) => {
  const parsed = conversationQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { provider, limit } = parsed.data;
  const query: Record<string, unknown> = {};

  if (provider) {
    query.provider = provider;
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const conversations = new Map<string, ConversationSummary>();

  for (const message of messages) {
    const key = `${message.provider}:${message.chatId}`;
    const secure = isSecureMessage(message);
    const timestamp = new Date(message.createdAt).toISOString();

    const existing = conversations.get(key);
    if (!existing) {
      conversations.set(key, {
        provider: message.provider,
        chatId: message.chatId,
        counterpart:
          message.direction === "inbound" ? message.from : message.to,
        messageCount: 1,
        secureMessageCount: secure ? 1 : 0,
        plainMessageCount: secure ? 0 : 1,
        lastMessageAt: timestamp,
        lastDirection: message.direction,
        lastMessagePreview: previewMessage(message),
        securityState: secure ? "secure" : "plain",
      });
      continue;
    }

    existing.messageCount += 1;
    existing.secureMessageCount += secure ? 1 : 0;
    existing.plainMessageCount += secure ? 0 : 1;
    existing.securityState =
      existing.secureMessageCount > 0 && existing.plainMessageCount > 0
        ? "mixed"
        : secure
          ? "secure"
          : "plain";
  }

  const data = Array.from(conversations.values()).sort((left, right) =>
    right.lastMessageAt.localeCompare(left.lastMessageAt),
  );

  res.json({ data });
  return;
});

messagesRouter.post("/messages/send", requireAuth, async (req: any, res) => {
  const parsed = sendSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;

  // Ensure sender has linked the requested provider
  const accountId = req.account?.accountId;
  if (!accountId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const conn = await ProviderConnection.findOne({
    accountId,
    provider: payload.provider,
    active: true,
  }).lean();
  if (!conn) {
    res.status(400).json({
      ok: false,
      error: `You must link your ${payload.provider} account before sending.`,
    });
    return;
  }
  // If encrypt=true, require client-provided ciphertext (E2E). Do not persist plaintext.
  if (payload.encrypt && !payload.encryptedText) {
    res.status(400).json({
      error: "encryptedText is required when encrypt=true (client-side E2E)",
    });
    return;
  }

  const storedCipher = payload.encryptedText ?? "";
  const bodyOmitted = !payload.encryptedText;

  // Messages are delivered Crypt-internally via Socket.IO only.
  // The provider (Telegram/WhatsApp) is used for auth/linking and inbound,
  // not for outbound message transport — so messages never appear in the bot chat.
  const message = await Message.create({
    provider: payload.provider,
    direction: "outbound",
    from: payload.from,
    to: payload.to,
    chatId: payload.chatId,
    deliveryStatus: "sent",
    encryptedText: storedCipher,
    bodyOmitted,
    attachments: payload.attachments,
  });

  broadcastMessage(message);

  res.status(201).json({ data: { message } });
  return;
});

// Delete all messages for a given conversation (provider + chatId)
messagesRouter.delete("/messages/conversation", requireAuth, async (req: any, res) => {
  const provider = String(req.query.provider || "");
  const chatId = String(req.query.chatId || "");
  if (!provider || !chatId) {
    res.status(400).json({ ok: false, error: "missing provider or chatId" });
    return;
  }
  const result = await Message.deleteMany({ provider: provider as any, chatId });
  res.json({ ok: true, deleted: result.deletedCount });
  return;
});

// Delete all messages (clear inbox) for the calling account's linked provider
messagesRouter.delete("/messages/all", requireAuth, async (req: any, res) => {
  const provider = String(req.query.provider || "");
  const query: Record<string, unknown> = {};
  if (provider) query.provider = provider;
  const result = await Message.deleteMany(query);
  res.json({ ok: true, deleted: result.deletedCount });
  return;
});
