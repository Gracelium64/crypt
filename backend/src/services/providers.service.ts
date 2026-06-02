import { env } from "../config/env.js";
import type { ProviderName } from "../models/message.model.js";

type SendPayload = {
  provider: ProviderName;
  chatId: string;
  to: string;
  text: string;
  attachments: Array<{ type: "image"; url: string }>;
};

type SendResult = {
  providerMessageId?: string;
  deliveryStatus: "sent" | "failed";
  providerResponse?: unknown;
  error?: string;
};

type SendOpts = {
  tokenOverride?: string;
  phoneNumberIdOverride?: string;
};

const sendTelegram = async (
  payload: SendPayload,
  opts?: SendOpts,
): Promise<SendResult> => {
  const token = opts?.tokenOverride ?? env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      deliveryStatus: "failed",
      error: "TELEGRAM_BOT_TOKEN not configured",
    };
  }

  const endpointBase = `https://api.telegram.org/bot${token}`;

  try {
    let response: Response;
    if (payload.attachments.length > 0) {
      response = await fetch(`${endpointBase}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: payload.chatId,
          photo: payload.attachments[0].url,
          caption: payload.text,
        }),
      });
    } else {
      response = await fetch(`${endpointBase}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: payload.chatId,
          text: payload.text,
        }),
      });
    }

    const data = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number | string };
      description?: string;
    };

    if (!response.ok || !data.ok) {
      return {
        deliveryStatus: "failed",
        error: data.description ?? "Telegram send failed",
        providerResponse: data,
      };
    }

    return {
      deliveryStatus: "sent",
      providerMessageId: String(data.result?.message_id ?? ""),
      providerResponse: data,
    };
  } catch (error) {
    return {
      deliveryStatus: "failed",
      error: error instanceof Error ? error.message : "Unknown Telegram error",
    };
  }
};

const sendWhatsApp = async (
  payload: SendPayload,
  opts?: SendOpts,
): Promise<SendResult> => {
  const token = opts?.tokenOverride ?? env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    opts?.phoneNumberIdOverride ?? env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return {
      deliveryStatus: "failed",
      error: "WhatsApp credentials not configured",
    };
  }

  const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const body = payload.attachments.length
    ? {
        messaging_product: "whatsapp",
        to: payload.to,
        type: "image",
        image: {
          link: payload.attachments[0].url,
          caption: payload.text,
        },
      }
    : {
        messaging_product: "whatsapp",
        to: payload.to,
        type: "text",
        text: {
          body: payload.text,
        },
      };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };

    if (!response.ok || data.error) {
      return {
        deliveryStatus: "failed",
        error: data.error?.message ?? "WhatsApp send failed",
        providerResponse: data,
      };
    }

    return {
      deliveryStatus: "sent",
      providerMessageId: data.messages?.[0]?.id,
      providerResponse: data,
    };
  } catch (error) {
    return {
      deliveryStatus: "failed",
      error: error instanceof Error ? error.message : "Unknown WhatsApp error",
    };
  }
};

export const sendToProvider = async (
  payload: SendPayload,
  opts?: SendOpts,
): Promise<SendResult> => {
  if (payload.provider === "telegram") {
    return sendTelegram(payload, opts);
  }

  if (payload.provider === "whatsapp") {
    return sendWhatsApp(payload, opts);
  }

  return {
    deliveryStatus: "failed",
    error: "Unknown provider",
  };
};
