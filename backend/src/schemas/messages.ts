import { z } from "zod";

export const conversationSummarySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  chatId: z.string(),
  counterpart: z.string(),
  counterpartName: z.string(),
  messageCount: z.number(),
  secureMessageCount: z.number(),
  plainMessageCount: z.number(),
  lastMessageAt: z.string(),
  lastDirection: z.enum(["inbound", "outbound"]),
  lastMessagePreview: z.string(),
  securityState: z.enum(["secure", "plain", "mixed"]),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const sendMessageSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  from: z.string().min(1),
  to: z.string().min(1),
  chatId: z.string().min(1),
  text: z.string().optional(),
  encryptedText: z.string().optional(),
  encrypt: z.boolean().default(true),
  attachments: z
    .array(z.object({ type: z.literal("image"), url: z.string().url() }))
    .default([]),
});

export const messagesQuerySchema = z.object({
  since: z.string().optional(),
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  chatId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
});

export const conversationsQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(200),
});

export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
export type ConversationsQuery = z.infer<typeof conversationsQuerySchema>;

export const deleteConversationQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  chatId: z.string().min(1),
});

export const deleteAllMessagesQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]).optional(),
});

export type DeleteConversationQuery = z.infer<typeof deleteConversationQuerySchema>;
export type DeleteAllMessagesQuery = z.infer<typeof deleteAllMessagesQuerySchema>;
