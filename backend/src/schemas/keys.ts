import { z } from "zod";

export const registerKeySchema = z.object({
  publicKey: z.string().min(1),
});

export type RegisterKeyBody = z.infer<typeof registerKeySchema>;
