import { z } from "zod";

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
