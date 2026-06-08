import { Router } from "express";
import { z } from "zod";
import { Message, Link, ProviderConnection } from "#models";
import { isMarkedCiphertext } from "../services/crypto.service.js";
import { broadcastMessage } from "../services/realtime.service.js";
import { env } from "../config/env.js";
import { downloadAndUploadWhatsappMedia } from "../services/media.service.js";

const providerCards = [
  {
    provider: "telegram",
    label: "Telegram",
    icon: "✈",
    webUrl: "https://web.telegram.org/k/",
    backendReady: Boolean(env.TELEGRAM_BOT_TOKEN),
    webhookReady: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
    setupNotes: [
      "Bot token is still required for sending and receiving messages.",
      "Webhook verification stays enabled for live inbound updates.",
    ],
  },
  {
    provider: "whatsapp",
    label: "WhatsApp",
    icon: "◉",
    webUrl: "https://web.whatsapp.com/",
    backendReady: Boolean(
      env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID,
    ),
    webhookReady: Boolean(
      env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_VERIFY_TOKEN !== "replace_me",
    ),
    setupNotes: [
      "Cloud API credentials are still required for message delivery.",
      "Webhook verification remains the live inbound bridge.",
    ],
  },
];

const telegramInboundSchema = z.object({
  message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z
        .object({
          id: z.union([z.number(), z.string()]),
          username: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional(),
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

providersRouter.get("/providers/status", (_req, res) => {
  res.json({
    data: providerCards.map((card) => ({
      ...card,
      readiness: card.backendReady ? "ready" : "needs-setup",
    })),
  });
  return;
});

providersRouter.get("/providers/telegram/webhook", (req, res) => {
  // Verify Telegram's secret token header for GET requests (initial verification)
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
  res.status(200).json({ ok: true });
  return;
});

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

  // Detect a linking code — matches both "LINK CODE" (manual) and "/start CODE" (deep link)
  try {
    const match =
      incomingRaw.match(/^\/start\s+([A-Za-z0-9]{4,12})$/i) ??
      incomingRaw.match(/\bLINK\s+([A-Za-z0-9]{4,12})\b/i);
    if (match) {
      const code = match[1].toUpperCase();
      const link = await Link.findOne({
        code,
        provider: "telegram",
        completed: false,
        expiresAt: { $gt: new Date() },
      });
      if (link) {
        const tgUsername = msg.from?.username ?? null;
        const nameFromFields =
          [msg.from?.first_name, msg.from?.last_name]
            .filter(Boolean)
            .join(" ") || String(msg.from?.id ?? msg.chat?.id ?? "unknown");
        const tgDisplayName = tgUsername ?? nameFromFields;

        link.completed = true;
        link.providerChatId = String(msg.chat.id);
        link.providerDisplayName = tgDisplayName;
        await link.save();
        console.log(
          "Link code completed via Telegram webhook:",
          code,
          msg.chat.id,
        );

        // Persist provider connection for the claiming account if present
        try {
          if (link.claimedAccountId) {
            const existing = await ProviderConnection.findOne({
              accountId: link.claimedAccountId,
              provider: "telegram",
              providerChatId: String(msg.chat.id),
            });
            if (!existing) {
              await ProviderConnection.create({
                accountId: link.claimedAccountId,
                provider: "telegram",
                providerChatId: String(msg.chat.id),
                displayName: tgDisplayName,
                username: tgUsername ?? undefined,
              });
              console.log(
                "Created ProviderConnection for account",
                link.claimedAccountId.toString(),
              );
            } else if (tgUsername && !existing.username) {
              await ProviderConnection.updateOne(
                { _id: existing._id },
                { $set: { username: tgUsername, displayName: tgDisplayName } },
              );
            }
          }
        } catch (err) {
          console.error("Failed to create ProviderConnection:", err);
        }

        // Send in-Telegram confirmation so the user knows to switch back
        try {
          if (env.TELEGRAM_BOT_TOKEN) {
            await fetch(
              `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: msg.chat.id,
                  text: "✅ Linked! Switch back to the app.",
                }),
              },
            );
          }
        } catch (err) {
          console.error("Failed to send Telegram link confirmation:", err);
        }
      }
    }
  } catch (err) {
    console.error("Link code detection error (telegram):", err);
  }

  const isEncrypted = isMarkedCiphertext(incomingRaw);
  const created = await Message.create({
    provider: "telegram",
    direction: "inbound",
    from: String(msg.from?.id ?? "unknown"),
    to: String(msg.chat.id),
    chatId: String(msg.chat.id),
    providerMessageId: String(msg.message_id),
    deliveryStatus: "sent",
    encryptedText: isEncrypted ? incomingRaw : "",
    bodyOmitted: !isEncrypted,
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

        // Detect a linking code message for WhatsApp
        try {
          const match = incomingRaw.match(/\bLINK\s+([A-Za-z0-9]{4,12})\b/i);
          if (match) {
            const code = match[1].toUpperCase();
            const link = await Link.findOne({
              code,
              provider: "whatsapp",
              completed: false,
              expiresAt: { $gt: new Date() },
            });
            if (link) {
              link.completed = true;
              link.providerChatId = String(msg.from);
              link.providerDisplayName = String(
                change.value.metadata?.display_phone_number ??
                  msg.from ??
                  "unknown",
              );
              await link.save();
              console.log(
                "Link code completed via WhatsApp webhook:",
                code,
                msg.from,
              );

              try {
                if (link.claimedAccountId) {
                  const existing = await ProviderConnection.findOne({
                    accountId: link.claimedAccountId,
                    provider: "whatsapp",
                    providerChatId: String(msg.from),
                  });
                  if (!existing) {
                    await ProviderConnection.create({
                      accountId: link.claimedAccountId,
                      provider: "whatsapp",
                      providerChatId: String(msg.from),
                      displayName: link.providerDisplayName,
                    });
                    console.log(
                      "Created ProviderConnection for account",
                      link.claimedAccountId.toString(),
                    );
                  }
                }
              } catch (err) {
                console.error("Failed to create ProviderConnection:", err);
              }
            }
          }
        } catch (err) {
          console.error("Link code detection error (whatsapp):", err);
        }

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

        const isEncrypted = isMarkedCiphertext(incomingRaw);
        const created = await Message.create({
          provider: "whatsapp",
          direction: "inbound",
          from: msg.from,
          to: change.value.metadata?.display_phone_number ?? "unknown",
          chatId: msg.from,
          providerMessageId: msg.id,
          deliveryStatus: "sent",
          encryptedText: isEncrypted ? incomingRaw : "",
          bodyOmitted: !isEncrypted,
          attachments,
        });

        broadcastMessage(created);
      }
    }
  }

  res.status(200).json({ ok: true });
  return;
});
