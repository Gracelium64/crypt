import { Router } from "express";
import { authenticate, authorize, validateBody, authRateLimiter } from "#middleware";
import {
  getTelegramStatus,
  requestCode,
  verifyCode,
  deleteTelegramSession,
  requestQrLogin,
  getQrStatus,
  submitQr2fa,
} from "#controllers";
import { requestPhoneCodeSchema, verifyPhoneCodeSchema, qr2faSchema } from "#schemas";

const telegramRouter = Router();

telegramRouter.get("/telegram/direct/status", authenticate, authorize(), getTelegramStatus);
telegramRouter.post("/telegram/direct/request-code", authRateLimiter, authenticate, authorize(), validateBody(requestPhoneCodeSchema), requestCode);
telegramRouter.post("/telegram/direct/verify-code", authRateLimiter, authenticate, authorize(), validateBody(verifyPhoneCodeSchema), verifyCode);
telegramRouter.delete("/telegram/direct/session", authenticate, authorize(), deleteTelegramSession);

telegramRouter.post("/telegram/direct/request-qr", authRateLimiter, authenticate, authorize(), requestQrLogin);
telegramRouter.get("/telegram/direct/qr-status", authenticate, authorize(), getQrStatus);
telegramRouter.post("/telegram/direct/qr-2fa", authRateLimiter, authenticate, authorize(), validateBody(qr2faSchema), submitQr2fa);

export default telegramRouter;
