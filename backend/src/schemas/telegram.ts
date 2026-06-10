import { z } from "zod";

export const requestPhoneCodeSchema = z.object({
  phoneNumber: z.string().min(6),
});

export const verifyPhoneCodeSchema = z.object({
  code: z.string().min(1),
  password: z.string().optional(),
});

export type RequestPhoneCodeBody = z.infer<typeof requestPhoneCodeSchema>;
export type VerifyPhoneCodeBody = z.infer<typeof verifyPhoneCodeSchema>;
