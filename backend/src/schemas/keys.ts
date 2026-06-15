import { z } from "zod";

export const registerKeySchema = z.object({
  publicKey: z.string().min(1),
  privateKeyJwk: z.string().optional(),
});

export type RegisterKeyBody = z.infer<typeof registerKeySchema>;
