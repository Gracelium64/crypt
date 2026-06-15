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

export const qr2faSchema = z.object({
  password: z.string().min(1),
});
export type Qr2faBody = z.infer<typeof qr2faSchema>;
