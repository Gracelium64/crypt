import { Router } from "express";
import { z } from "zod";
import { Message, ProviderConnection } from "#models";
import { isMarkedCiphertext } from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { sendToProvider } from "../services/index.js";
import { hasActiveClient, sendViaMTProto } from "../services/telegram-mtproto.service.js";
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
  counterpartName: string;
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
  const text = message.encryptedText?.trim() || "";
  if (!text) return "(empty)";
  if (isMarkedCiphertext(text)) return "[Encrypted message]";
  if (text.length <= 96) return text;
  return `${text.slice(0, 93)}...`;
};

const isSecureMessage = (message: { encryptedText?: string | null }) =>
  isMarkedCiphertext(message.encryptedText ?? "");

export const messagesRouter = Router();

messagesRouter.get("/messages", requireAuth, async (req: any, res) => {
  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { since, provider, chatId, limit } = parsed.data;
  const accountId = req.account?.accountId;
  const query: Record<string, unknown> = { accountId };

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

messagesRouter.get("/conversations", requireAuth, async (req: any, res) => {
  const parsed = conversationQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { provider, limit } = parsed.data;
  const accountId = req.account?.accountId;
  const query: Record<string, unknown> = { accountId };

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
      const rawCounterpart = message.direction === "inbound" ? message.from : message.to;
      conversations.set(key, {
        provider: message.provider,
        chatId: message.chatId,
        counterpart: rawCounterpart,
        counterpartName: rawCounterpart,
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

  // Enrich counterpart with display names from ProviderConnection
  const byProvider = new Map<string, Set<string>>();
  for (const conv of conversations.values()) {
    const s = byProvider.get(conv.provider) ?? new Set<string>();
    s.add(conv.counterpart);
    byProvider.set(conv.provider, s);
  }
  const nameMap = new Map<string, string>();
  for (const [prov, chatIds] of byProvider) {
    const conns = await ProviderConnection.find({
      provider: prov as any,
      providerChatId: { $in: [...chatIds] },
    }).lean();
    for (const c of conns) {
      const name = c.displayName ?? c.username ?? null;
      if (name) nameMap.set(`${prov}:${c.providerChatId}`, name);
    }
  }
  for (const conv of conversations.values()) {
    const name = nameMap.get(`${conv.provider}:${conv.counterpart}`);
    if (name) conv.counterpartName = name;
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

  const storedText = payload.encryptedText ?? payload.text ?? "";
  // Use sender's providerChatId so recipient can look up sender's public key
  const senderChatId = conn.providerChatId;

  const message = await Message.create({
    provider: payload.provider,
    direction: "outbound",
    accountId,
    from: senderChatId,
    to: payload.to,
    chatId: payload.chatId,
    deliveryStatus: "sent",
    encryptedText: storedText,
    bodyOmitted: false,
    attachments: payload.attachments,
  });

  broadcastMessage(message);

  // Look up recipient's account for fan-out / MTProto delivery
  const recipientConn = await ProviderConnection.findOne({
    provider: payload.provider,
    providerChatId: payload.chatId,
    active: true,
  }).lean();
  const recipientAccountId = recipientConn?.accountId?.toString();

  // Try MTProto direct send first (requires both sender and recipient to have active sessions)
  let mtprotoSent = false;
  if (
    payload.provider === "telegram" &&
    hasActiveClient(accountId) &&
    recipientAccountId &&
    hasActiveClient(recipientAccountId)
  ) {
    try {
      const sendFn = await sendViaMTProto(accountId, payload.chatId);
      mtprotoSent = await sendFn(storedText);
    } catch (mtprotoErr) {
      console.error("[MTProto] send error:", mtprotoErr);
    }
  }

  if (!mtprotoSent) {
    // Fan-out: create an inbound copy for the recipient so they see the message in Crypt
    if (recipientAccountId && recipientAccountId !== accountId) {
      try {
        const inboundCopy = await Message.create({
          provider: payload.provider,
          direction: "inbound",
          accountId: recipientAccountId,
          from: senderChatId,
          to: payload.chatId,
          chatId: senderChatId,
          deliveryStatus: "sent",
          encryptedText: storedText,
          bodyOmitted: false,
          attachments: payload.attachments,
        });
        broadcastMessage(inboundCopy);
      } catch (fanoutErr) {
        console.error("Fan-out copy failed:", fanoutErr);
      }
    }

    // Forward via provider bot so the message appears in the native Telegram/WhatsApp app
    try {
      await sendToProvider({
        provider: payload.provider,
        chatId: payload.chatId,
        to: payload.to,
        text: storedText,
        attachments: payload.attachments,
      });
    } catch (providerErr) {
      console.error("Failed to forward message to provider:", providerErr);
    }
  }

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
