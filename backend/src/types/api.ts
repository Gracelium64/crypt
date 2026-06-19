export type ConversationSummary = {
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
