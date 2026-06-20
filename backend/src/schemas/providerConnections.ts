import { z } from "zod";

export const searchContactQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  username: z.string().min(1),
});

export const resolveContactQuerySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  chatId: z.string().min(1),
});

export type SearchContactQuery = z.infer<typeof searchContactQuerySchema>;
export type ResolveContactQuery = z.infer<typeof resolveContactQuerySchema>;
