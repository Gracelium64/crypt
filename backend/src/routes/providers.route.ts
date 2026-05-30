import { Router } from "express";
import { z } from "zod";
import { Message } from "../models/message.model.js";
import {
  decryptMarkedText,
  isMarkedCiphertext,
} from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { env } from "../config/env.js";
import { downloadAndUploadWhatsappMedia } from "../services/media.service.js";

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
  // If a webhook secret is configured, verify Telegram's secret header
  const incomingSecret =
    req.header("x-telegram-bot-api-secret-token") ??
    req.header("X-Telegram-Bot-Api-Secret-Token");
  if (
    env.TELEGRAM_WEBHOOK_SECRET &&
    incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const parsed = telegramInboundSchema.safeParse(req.body);

  if (!parsed.success || !parsed.data.message) {
    res.status(200).json({ ok: true, skipped: true });
    return;
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

  res.status(200).json({ ok: true });
  return;
});

providersRouter.get("/providers/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send("forbidden");
  return;
});

providersRouter.post("/providers/whatsapp/webhook", async (req, res) => {
  const parsed = whatsappInboundSchema.safeParse(req.body);

  if (!parsed.success || !parsed.data.entry) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages ?? [];
      for (const msg of messages) {
        const incomingRaw = msg.text?.body ?? "";

        let attachments: Array<{ type: "image"; url: string }> = [];
        if (msg.image?.id) {
          try {
            const hosted = await downloadAndUploadWhatsappMedia(msg.image.id);
            attachments = [{ type: "image", url: hosted }];
          } catch (error) {
            // fallback to media-id placeholder if download/upload fails
            attachments = [
              { type: "image", url: "whatsapp-media-id:" + msg.image.id },
            ];
          }
        }

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
          attachments,
        });

        broadcastMessage(created);
      }
    }
  }

  res.status(200).json({ ok: true });
  return;
});
