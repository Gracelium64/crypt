import type { RequestHandler } from "express";
import { TelegramSession } from "#models";
import {
  requestPhoneCode,
  verifyPhoneCode,
  hasActiveClient,
  disconnectMTProtoSession,
  resetOtherSessions,
  startQrLogin,
  getQrLoginStatus,
  resolveQr2fa,
  decryptSrvText,
} from "#services";
import type { RequestPhoneCodeBody, VerifyPhoneCodeBody } from "#schemas";

export const getTelegramStatus: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  try {
    const session = await TelegramSession.findOne({ accountId }).lean();
    res.json({
      ok: true,
      data: {
        active: session?.active ?? false,
        connected: hasActiveClient(accountId),
        phoneNumber: session?.phoneNumber
          ? decryptSrvText(session.phoneNumber).replace(/(\+?\d{1,3})\d+(\d{2})$/, "$1***$2")
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const requestCode: RequestHandler = async (req, res, next) => {
  const { phoneNumber } = req.body as RequestPhoneCodeBody;
  const accountId = req.account!.accountId;
  try {
    const { codeType } = await requestPhoneCode(accountId, phoneNumber);
    res.json({ ok: true, codeType });
  } catch (err) {
    next(new Error((err as Error)?.message ?? "Failed to send code", { cause: { status: 500 } }));
  }
};

export const verifyCode: RequestHandler = async (req, res, next) => {
  const { code, password } = req.body as VerifyPhoneCodeBody;
  const accountId = req.account!.accountId;
  try {
    await verifyPhoneCode(accountId, code, password);
    res.json({ ok: true });
  } catch (err) {
    next(new Error((err as Error)?.message ?? "Verification failed", { cause: { status: 400 } }));
  }
};

export const requestQrLogin: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  try {
    await startQrLogin(accountId);
    res.json({ ok: true });
  } catch (err) {
    next(new Error((err as Error)?.message ?? "Failed to start QR login", { cause: { status: 500 } }));
  }
};

export const getQrStatus: RequestHandler = (req, res) => {
  const accountId = req.account!.accountId;
  res.json({ ok: true, data: getQrLoginStatus(accountId) });
};

export const submitQr2fa: RequestHandler = (req, res, next) => {
  const { password } = req.body as { password: string };
  const accountId = req.account!.accountId;
  try {
    resolveQr2fa(accountId, password);
    res.json({ ok: true });
  } catch (err) {
    next(new Error((err as Error)?.message ?? "Failed to submit 2FA", { cause: { status: 400 } }));
  }
};

export const deleteTelegramSession: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  try {
    await disconnectMTProtoSession(accountId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const resetTelegramSessions: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  try {
    const { cleared } = await resetOtherSessions(accountId);
    res.json({ ok: true, cleared });
  } catch (err) {
    next(new Error((err as Error)?.message ?? "Failed to reset sessions", { cause: { status: 400 } }));
  }
};
