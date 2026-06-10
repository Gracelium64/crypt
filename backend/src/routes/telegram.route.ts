import { Router } from "express";
import { authenticate, validateBody } from "#middleware";
import {
  getTelegramStatus,
  requestCode,
  verifyCode,
  deleteTelegramSession,
} from "#controllers";
import { requestPhoneCodeSchema, verifyPhoneCodeSchema } from "#schemas";

const telegramRouter = Router();

telegramRouter.get("/telegram/direct/status", authenticate, getTelegramStatus);
telegramRouter.post("/telegram/direct/request-code", authenticate, validateBody(requestPhoneCodeSchema), requestCode);
telegramRouter.post("/telegram/direct/verify-code", authenticate, validateBody(verifyPhoneCodeSchema), verifyCode);
telegramRouter.delete("/telegram/direct/session", authenticate, deleteTelegramSession);

export default telegramRouter;
