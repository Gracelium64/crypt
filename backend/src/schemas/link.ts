import { z } from "zod";

export const initLinkSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  ttlMinutes: z.number().int().positive().optional(),
});

export const completeLinkSchema = z.object({
  code: z.string().min(1),
  provider: z.enum(["telegram", "whatsapp"]).optional(),
  providerChatId: z.string().min(1),
  providerDisplayName: z.string().optional(),
});

export type InitLinkBody = z.infer<typeof initLinkSchema>;
export type CompleteLinkBody = z.infer<typeof completeLinkSchema>;
