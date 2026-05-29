import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DEMO_ENCRYPTION_KEY: z
    .string()
    .min(32, "DEMO_ENCRYPTION_KEY must be at least 32 characters"),
  WHATSAPP_VERIFY_TOKEN: z.string().default("replace_me"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
