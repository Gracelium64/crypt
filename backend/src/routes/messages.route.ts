import { Router } from "express";
import { z } from "zod";
import { Message } from "../models/message.model.js";
import {
  decryptMarkedText,
  encryptText,
  isMarkedCiphertext,
} from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { sendToProvider } from "../services/providers.service.js";

const sendSchema = z.object({
  provider: z.enum(["telegram", "whatsapp", "mock"]),
  from: z.string().min(1),
  to: z.string().min(1),
  chatId: z.string().min(1),
  text: z.string().default(""),
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
  provider: z.enum(["telegram", "whatsapp", "mock"]).optional(),
  chatId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
});

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

messagesRouter.post("/messages/send", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const encryptedText = payload.encrypt
    ? encryptText(payload.text)
    : payload.text;
  const decryptedText = payload.encrypt
    ? payload.text
    : decryptMarkedText(payload.text);

  const providerResult = await sendToProvider({
    provider: payload.provider,
    to: payload.to,
    chatId: payload.chatId,
    text: encryptedText,
    attachments: payload.attachments,
  });

  const message = await Message.create({
    provider: payload.provider,
    direction: "outbound",
    from: payload.from,
    to: payload.to,
    chatId: payload.chatId,
    providerMessageId: providerResult.providerMessageId,
    deliveryStatus: providerResult.deliveryStatus,
    providerResponse: providerResult.providerResponse,
    rawText: payload.text,
    encryptedText,
    decryptedText,
    attachments: payload.attachments,
  });

  broadcastMessage(message);

  res.status(201).json({
    data: {
      message,
      providerPayloadPreview: {
        text: encryptedText,
        attachments: payload.attachments,
      },
      providerResult,
    },
  });
  return;
});

messagesRouter.post("/messages/mock-inbound", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const incomingRaw = payload.encrypt
    ? encryptText(payload.text)
    : payload.text;

  const message = await Message.create({
    provider: payload.provider,
    direction: "inbound",
    from: payload.to,
    to: payload.from,
    chatId: payload.chatId,
    rawText: incomingRaw,
    encryptedText: incomingRaw,
    deliveryStatus: "sent",
    decryptedText: isMarkedCiphertext(incomingRaw)
      ? decryptMarkedText(incomingRaw)
      : incomingRaw,
    attachments: payload.attachments,
  });

  broadcastMessage(message);

  res.status(201).json({ data: message });
  return;
});
