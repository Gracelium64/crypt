import type { z } from "zod";
import type {
  ChatMessageSchema,
  ConversationSummarySchema,
  UserSchema,
  ConnectionSchema,
  ProviderStatusSchema,
  LinkStatusDataSchema,
  EcdhPrivateJwkSchema,
} from "../schemas";

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type User = z.infer<typeof UserSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type LinkStatusData = z.infer<typeof LinkStatusDataSchema>;
export type EcdhPrivateJwk = z.infer<typeof EcdhPrivateJwkSchema>;

export type Provider = "telegram" | "whatsapp";
export type MessageProvider = Provider;

export type LoginPayload = { email: string; password: string };
export type RegisterPayload = { email: string; password: string; displayName?: string };
