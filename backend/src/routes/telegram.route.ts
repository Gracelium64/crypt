import { Router } from "express";
import { authenticate, validateBody } from "#middleware";
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

telegramRouter.get("/telegram/direct/status", authenticate, getTelegramStatus);
telegramRouter.post("/telegram/direct/request-code", authenticate, validateBody(requestPhoneCodeSchema), requestCode);
telegramRouter.post("/telegram/direct/verify-code", authenticate, validateBody(verifyPhoneCodeSchema), verifyCode);
telegramRouter.delete("/telegram/direct/session", authenticate, deleteTelegramSession);

telegramRouter.post("/telegram/direct/request-qr", authenticate, requestQrLogin);
telegramRouter.get("/telegram/direct/qr-status", authenticate, getQrStatus);
telegramRouter.post("/telegram/direct/qr-2fa", authenticate, validateBody(qr2faSchema), submitQr2fa);

export default telegramRouter;
