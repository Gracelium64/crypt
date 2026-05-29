import { Router } from "express";
import { z } from "zod";
import { Message } from "../models/message.model.js";
import {
  decryptMarkedText,
  isMarkedCiphertext,
} from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { env } from "../config/env.js";

const telegramInboundSchema = z.object({
  message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
    })
    .optional(),
});

const whatsappInboundSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z
                .array(
                  z.object({
                    id: z.string(),
                    from: z.string(),
                    text: z.object({ body: z.string() }).optional(),
                    image: z.object({ id: z.string().optional() }).optional(),
                  }),
                )
                .optional(),
              metadata: z
                .object({
                  display_phone_number: z.string().optional(),
                })
                .optional(),
            }),
          }),
        ),
      }),
    )
    .optional(),
});

export const providersRouter = Router();

providersRouter.post("/providers/telegram/webhook", async (req, res) => {
  const parsed = telegramInboundSchema.safeParse(req.body);

  if (!parsed.success || !parsed.data.message) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const msg = parsed.data.message;
  const incomingRaw = msg.text ?? "";

  const created = await Message.create({
    provider: "telegram",
    direction: "inbound",
    from: String(msg.from?.id ?? "unknown"),
    to: String(msg.chat.id),
    chatId: String(msg.chat.id),
    providerMessageId: String(msg.message_id),
    deliveryStatus: "sent",
    rawText: incomingRaw,
    encryptedText: incomingRaw,
    decryptedText: isMarkedCiphertext(incomingRaw)
      ? decryptMarkedText(incomingRaw)
      : incomingRaw,
    attachments: [],
  });

  broadcastMessage(created);

  return res.status(200).json({ ok: true });
});

providersRouter.get("/providers/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("forbidden");
});

providersRouter.post("/providers/whatsapp/webhook", async (req, res) => {
  const parsed = whatsappInboundSchema.safeParse(req.body);

  if (!parsed.success || !parsed.data.entry) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages ?? [];
      for (const msg of messages) {
        const incomingRaw = msg.text?.body ?? "";
        const created = await Message.create({
          provider: "whatsapp",
          direction: "inbound",
          from: msg.from,
          to: change.value.metadata?.display_phone_number ?? "unknown",
          chatId: msg.from,
          providerMessageId: msg.id,
          deliveryStatus: "sent",
          rawText: incomingRaw,
          encryptedText: incomingRaw,
          decryptedText: isMarkedCiphertext(incomingRaw)
            ? decryptMarkedText(incomingRaw)
            : incomingRaw,
          attachments: msg.image
            ? [{ type: "image", url: "whatsapp-media-id:" + msg.image.id }]
            : [],
        });

        broadcastMessage(created);
      }
    }
  }

  return res.status(200).json({ ok: true });
});
