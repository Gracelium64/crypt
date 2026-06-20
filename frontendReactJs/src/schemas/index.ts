import { z } from "zod";

export const ChatMessageSchema = z.object({
  _id: z.string().optional(),
  id: z.string().optional(),
  accountId: z.string().optional(),
  provider: z.enum(["telegram", "whatsapp"]),
  direction: z.enum(["inbound", "outbound"]),
  from: z.string(),
  to: z.string(),
  chatId: z.string(),
  encryptedText: z.string().optional(),
  attachments: z.array(z.object({ type: z.literal("image"), url: z.string() })),
  deliveryStatus: z.enum(["queued", "sent", "failed"]).optional(),
  createdAt: z.string(),
  bodyOmitted: z.boolean().optional(),
  decryptedText: z.string().optional(),
});

export const ConversationSummarySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  chatId: z.string(),
  counterpart: z.string().optional(),
  counterpartName: z.string().optional(),
  lastMessagePreview: z.string().optional(),
  lastMessageAt: z.string().nullable().optional(),
  messageCount: z.number().optional(),
  secureMessageCount: z.number().optional(),
  plainMessageCount: z.number().optional(),
  securityState: z.string().optional(),
  lastDirection: z.enum(["inbound", "outbound"]).optional(),
});

export const UserSchema = z.object({
  email: z.string(),
  displayName: z.string().optional(),
  id: z.string().optional(),
});

export const ConnectionSchema = z.object({
  _id: z.string(),
  provider: z.enum(["telegram", "whatsapp"]),
  providerChatId: z.string(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  active: z.boolean(),
});

export const ProviderStatusSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  label: z.string(),
  icon: z.string(),
  webUrl: z.string(),
  backendReady: z.boolean(),
  webhookReady: z.boolean(),
  setupNotes: z.array(z.string()),
  readiness: z.enum(["ready", "needs-setup"]),
});

export const LinkStatusDataSchema = z.object({
  completed: z.boolean(),
  providerChatId: z.string().nullable().optional(),
  providerDisplayName: z.string().nullable().optional(),
});

export const EcdhPrivateJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string(),
  y: z.string(),
  d: z.string(),
  key_ops: z.array(z.string()).optional(),
  ext: z.boolean().optional(),
});

export const TokenResponseSchema = z.object({ token: z.string() });

export const QrStatusSchema = z.object({
  token: z.string().optional(),
  step: z.string(),
  error: z.string().optional(),
});
