import type { RequestHandler } from "express";
import crypto from "node:crypto";
import { Message, Link, ProviderConnection, Key, Account } from "#models";
import { isMarkedCiphertext, broadcastMessage, downloadAndUploadWhatsappMedia, sendToProvider, joinPersonName, logEvent } from "#services";
import { env } from "#config";
import { telegramInboundSchema, whatsappInboundSchema } from "#schemas";

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
    backendReady: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    webhookReady: Boolean(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_VERIFY_TOKEN !== "replace_me"),
    setupNotes: [
      "Cloud API credentials are still required for message delivery.",
      "Webhook verification remains the live inbound bridge.",
    ],
  },
];

export const getProviderStatus: RequestHandler = (_req, res) => {
  res.json({
    data: providerCards.map((card) => ({
      ...card,
      readiness: card.backendReady ? "ready" : "needs-setup",
    })),
  });
};

export const telegramWebhookVerify: RequestHandler = (req, res) => {
  const incomingSecret =
    req.header("x-telegram-bot-api-secret-token") ??
    req.header("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  res.status(200).json({ ok: true });
};

export const telegramWebhook: RequestHandler = async (req, res) => {
  const incomingSecret =
    req.header("x-telegram-bot-api-secret-token") ??
    req.header("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
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
          joinPersonName(msg.from?.first_name, msg.from?.last_name) ??
          String(msg.from?.id ?? msg.chat?.id ?? "unknown");
        const tgDisplayName = tgUsername ?? nameFromFields;

        link.completed = true;
        link.providerChatId = String(msg.chat.id);
        link.providerDisplayName = tgDisplayName;
        await link.save();

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
              try {
                const account = await Account.findById(link.claimedAccountId).lean();
                if (account?.email) {
                  const keyRecord = await Key.findOne({ ownerId: account.email }).lean();
                  if (keyRecord?.publicKey) {
                    await Key.findOneAndUpdate(
                      { ownerId: String(msg.chat.id) },
                      { publicKey: keyRecord.publicKey },
                      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
                    );
                  }
                }
              } catch (mirrorErr) {
                console.error("Failed to mirror key on link:", mirrorErr);
              }
            } else if (tgUsername && !existing.username) {
              await ProviderConnection.updateOne(
                { _id: existing._id },
                { $set: { username: tgUsername, displayName: tgDisplayName } },
              );
            }
          }
        } catch (err) {
          console.error("Failed to create ProviderConnection:", err);
          void logEvent("error", "provider:connection_create_failed", { provider: "telegram" }, err);
        }

        try {
          if (env.TELEGRAM_BOT_TOKEN) {
            await fetch(
              `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: msg.chat.id, text: "✅ Linked! Switch back to the app." }),
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

  let inboundAccountId: string | undefined = undefined;
  try {
    const ownerConn = await ProviderConnection.findOne({
      provider: "telegram",
      providerChatId: String(msg.chat.id),
      active: true,
    }).lean();
    if (ownerConn?.accountId) {
      const accountExists = await Account.exists({ _id: ownerConn.accountId });
      if (accountExists) inboundAccountId = ownerConn.accountId.toString();
    }
  } catch { /* non-fatal */ }

  const created = await Message.create({
    provider: "telegram",
    direction: "inbound",
    accountId: inboundAccountId,
    from: String(msg.from?.id ?? "unknown"),
    to: String(msg.chat.id),
    chatId: String(msg.chat.id),
    providerMessageId: String(msg.message_id),
    deliveryStatus: "sent",
    encryptedText: incomingRaw,
    bodyOmitted: false,
    attachments: [],
  });

  broadcastMessage(created);

  // Upsert a contact record for the sender so their name appears in the UI
  if (msg.from?.id) {
    const senderId = String(msg.from.id);
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ").trim() || null;
    const senderUsername: string | null = (msg.from as any).username ?? null;
    ProviderConnection.findOneAndUpdate(
      { provider: "telegram", providerChatId: senderId, accountId: null },
      { $setOnInsert: { provider: "telegram", providerChatId: senderId, accountId: null, active: false },
        $set: { ...(senderName ? { displayName: senderName } : {}), ...(senderUsername ? { username: senderUsername } : {}) } },
      { upsert: true },
    ).catch(() => { /* non-fatal */ });
  }

  res.status(200).json({ ok: true });
};

export const whatsappWebhookVerify: RequestHandler = (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send("forbidden");
};

export const whatsappWebhook: RequestHandler = async (req, res) => {
  if (env.WHATSAPP_APP_SECRET) {
    const sig = req.header("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", env.WHATSAPP_APP_SECRET)
        .update((req as unknown as { rawBody: Buffer }).rawBody ?? Buffer.alloc(0))
        .digest("hex");
    let valid = false;
    try {
      valid =
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch { /* length mismatch */ }
    if (!valid) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
  }

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
        const senderPhone = String(msg.from);
        const contactEntry = change.value.contacts?.find((c) => c.wa_id === senderPhone);
        const senderDisplayName = contactEntry?.profile?.name ?? senderPhone;

        // Keep ProviderConnection display name up to date on every inbound message
        try {
          await ProviderConnection.updateOne(
            { provider: "whatsapp", providerChatId: senderPhone, active: true },
            { $set: { displayName: senderDisplayName } },
          );
        } catch { /* non-fatal */ }

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
              link.providerChatId = senderPhone;
              link.providerDisplayName = senderDisplayName;
              await link.save();

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
                      providerChatId: senderPhone,
                      displayName: senderDisplayName,
                    });
                  } else {
                    await ProviderConnection.updateOne(
                      { _id: existing._id },
                      { $set: { displayName: senderDisplayName } },
                    );
                  }
                }
              } catch (err) {
                console.error("Failed to create ProviderConnection:", err);
                void logEvent("error", "provider:connection_create_failed", { provider: "whatsapp" }, err);
              }

              try {
                await sendToProvider({
                  provider: "whatsapp",
                  to: String(msg.from),
                  chatId: String(msg.from),
                  text: "Your WhatsApp account has been linked to Crypt.",
                  attachments: [],
                });
              } catch (err) {
                console.error("Failed to send WhatsApp link confirmation:", err);
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
          } catch (mediaErr) {
            console.error("Failed to download/upload WhatsApp media:", mediaErr);
            attachments = [{ type: "image", url: "whatsapp-media-id:" + msg.image.id }];
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
};
