import type { ProviderName } from "#models";

export type SendPayload = {
  provider: ProviderName;
  chatId: string;
  to: string;
  text: string;
  attachments: Array<{ type: "image"; url: string }>;
};

export type SendResult = {
  providerMessageId?: string;
  deliveryStatus: "sent" | "failed";
  providerResponse?: unknown;
  error?: string;
};

export type SendOpts = {
  tokenOverride?: string;
  phoneNumberIdOverride?: string;
};
