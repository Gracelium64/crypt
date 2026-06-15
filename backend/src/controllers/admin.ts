import type { RequestHandler } from "express";
import { env } from "#config";
import { sendToProvider } from "#services";

export const setWebhook: RequestHandler = async (req, res, next) => {
  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    next(new Error("Missing url", { cause: { status: 400 } }));
    return;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    next(new Error("TELEGRAM_BOT_TOKEN not set", { cause: { status: 400 } }));
    return;
  }

  const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  const body: Record<string, unknown> = { url };
  if (env.TELEGRAM_WEBHOOK_SECRET) body.secret_token = env.TELEGRAM_WEBHOOK_SECRET;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !(data as Record<string, unknown>).ok) {
      next(new Error(JSON.stringify(data), { cause: { status: 500 } }));
      return;
    }
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
};

export const deleteWebhook: RequestHandler = async (req, res, next) => {
  if (!env.TELEGRAM_BOT_TOKEN) {
    next(new Error("TELEGRAM_BOT_TOKEN not set", { cause: { status: 400 } }));
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`,
      { method: "POST" },
    );
    const data = await response.json();
    if (!response.ok || !(data as Record<string, unknown>).ok) {
      next(new Error(JSON.stringify(data), { cause: { status: 500 } }));
      return;
    }
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
};

export const testProvider: RequestHandler = async (req, res, next) => {
  const { provider, chatId, text } = req.body ?? {};
  if (!provider || !chatId) {
    next(new Error("Missing provider or chatId", { cause: { status: 400 } }));
    return;
  }

  try {
    const result = await sendToProvider({
      provider,
      chatId,
      to: chatId,
      text: text ?? "test message",
      attachments: [],
    });
    res.status(200).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
};
