import { Router } from "express";
import { authenticate, authorize } from "#middleware";
import {
  getProviderStatus,
  telegramWebhookVerify,
  telegramWebhook,
  whatsappWebhookVerify,
  whatsappWebhook,
} from "#controllers";

export const providersRouter = Router();

providersRouter.get("/providers/status", authenticate, authorize(), getProviderStatus);
providersRouter.get("/providers/telegram/webhook", telegramWebhookVerify);
providersRouter.post("/providers/telegram/webhook", telegramWebhook);
providersRouter.get("/providers/whatsapp/webhook", whatsappWebhookVerify);
providersRouter.post("/providers/whatsapp/webhook", whatsappWebhook);
