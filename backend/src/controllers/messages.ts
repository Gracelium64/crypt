import type { RequestHandler } from "express";
import { Message, ProviderConnection } from "#models";
import { isMarkedCiphertext, broadcastMessage, sendToProvider } from "#services";
import { hasActiveClient, sendViaMTProto } from "#services/telegram-mtproto.service.js";
import type { SendMessageBody, MessagesQuery, ConversationsQuery } from "#schemas";

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
  return text.length <= 96 ? text : `${text.slice(0, 93)}...`;
};

const isSecureMessage = (message: { encryptedText?: string | null }) =>
  isMarkedCiphertext(message.encryptedText ?? "");

export const getMessages: RequestHandler = async (req, res, next) => {
  const parsed = (req as any).validatedQuery as MessagesQuery | undefined;
  const query_raw = parsed ?? req.query;

  // Inline query validation fallback
  const since = query_raw.since as string | undefined;
  const provider = query_raw.provider as string | undefined;
  const chatId = query_raw.chatId as string | undefined;
  const limit = Number(query_raw.limit) || 40;

  const accountId = req.account!.accountId;
  const query: Record<string, unknown> = { accountId };
  if (provider) query.provider = provider;
  if (chatId) query.chatId = chatId;
  if (since) query.createdAt = { $gt: new Date(since) };

  try {
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();

    res.json({ data: messages.reverse() });
  } catch (error) {
    next(error);
  }
};

export const getConversations: RequestHandler = async (req, res, next) => {
  const provider = req.query.provider as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 200, 200);
  const accountId = req.account!.accountId;

  const query: Record<string, unknown> = { accountId };
  if (provider) query.provider = provider;

  try {
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

    // Enrich counterpart display names from ProviderConnection
    const byProvider = new Map<string, Set<string>>();
    for (const conv of conversations.values()) {
      const s = byProvider.get(conv.provider) ?? new Set<string>();
      s.add(conv.counterpart);
      byProvider.set(conv.provider, s);
    }

    for (const [prov, chatIds] of byProvider) {
      const conns = await ProviderConnection.find({
        provider: prov as "telegram" | "whatsapp",
        providerChatId: { $in: [...chatIds] },
      }).lean();
      for (const c of conns) {
        const name = c.displayName ?? c.username ?? null;
        if (name) {
          const conv = conversations.get(`${prov}:${c.providerChatId}`);
          if (conv) conv.counterpartName = name;
        }
      }
    }

    const data = Array.from(conversations.values()).sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt),
    );

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const sendMessage: RequestHandler = async (req, res, next) => {
  const payload = req.body as SendMessageBody;
  const accountId = req.account!.accountId;

  try {
    const conn = await ProviderConnection.findOne({
      accountId,
      provider: payload.provider,
      active: true,
    }).lean();

    if (!conn) {
      next(new Error(`You must link your ${payload.provider} account before sending.`, { cause: { status: 400 } }));
      return;
    }

    if (payload.encrypt && !payload.encryptedText) {
      next(new Error("encryptedText is required when encrypt=true (client-side E2E)", { cause: { status: 400 } }));
      return;
    }

    const storedText = payload.encryptedText ?? payload.text ?? "";
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

    const recipientConn = await ProviderConnection.findOne({
      provider: payload.provider,
      providerChatId: payload.chatId,
      active: true,
    }).lean();
    const recipientAccountId = recipientConn?.accountId?.toString();

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

      try {
        let outboundText = storedText;
        if (payload.provider === "whatsapp" && !isMarkedCiphertext(storedText)) {
          const senderConn = await ProviderConnection.findOne({
            provider: "whatsapp",
            providerChatId: senderChatId,
            active: true,
          }).lean();
          const senderLabel = senderConn?.displayName ?? senderChatId;
          outboundText = `[${senderLabel}]: ${storedText}`;
        }
        await sendToProvider({
          provider: payload.provider,
          chatId: payload.chatId,
          to: payload.to,
          text: outboundText,
          attachments: payload.attachments,
        });
      } catch (providerErr) {
        console.error("Failed to forward message to provider:", providerErr);
      }
    }

    res.status(201).json({ data: { message } });
  } catch (error) {
    next(error);
  }
};

export const deleteConversation: RequestHandler = async (req, res, next) => {
  const provider = String(req.query.provider || "");
  const chatId = String(req.query.chatId || "");

  if (!provider || !chatId) {
    next(new Error("Missing provider or chatId", { cause: { status: 400 } }));
    return;
  }

  const accountId = req.account!.accountId;
  try {
    const result = await Message.deleteMany({ accountId, provider: provider as "telegram" | "whatsapp", chatId });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (error) {
    next(error);
  }
};

export const deleteAllMessages: RequestHandler = async (req, res, next) => {
  const provider = String(req.query.provider || "");
  const accountId = req.account!.accountId;
  const query: Record<string, unknown> = { accountId };
  if (provider) query.provider = provider;

  try {
    const result = await Message.deleteMany(query);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (error) {
    next(error);
  }
};
