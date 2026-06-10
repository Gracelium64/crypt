export type Provider = "telegram" | "whatsapp";

export type MessageProvider = Provider;

export interface ChatMessage {
  _id?: string;
  id?: string;
  accountId?: string;
  provider: MessageProvider;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  chatId: string;
  encryptedText?: string;
  attachments: Array<{ type: "image"; url: string }>;
  deliveryStatus?: "queued" | "sent" | "failed";
  createdAt: string;
  bodyOmitted?: boolean;
  decryptedText?: string;
}

export interface ConversationSummary {
  provider: Provider;
  chatId: string;
  counterpart?: string;
  counterpartName?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string | null;
  messageCount?: number;
  secureMessageCount?: number;
  plainMessageCount?: number;
  securityState?: string;
}

export type User = {
  email: string;
  displayName?: string;
  id?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  displayName?: string;
};
