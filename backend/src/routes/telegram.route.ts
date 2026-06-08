import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth.route.js";
import {
  requestPhoneCode,
  verifyPhoneCode,
  hasActiveClient,
  disconnectMTProtoSession,
} from "../services/telegram-mtproto.service.js";
import { TelegramSession } from "#models";

const telegramRouter = Router();

telegramRouter.get("/telegram/direct/status", requireAuth, async (req: any, res) => {
  const accountId = req.account?.accountId;
  const session = await TelegramSession.findOne({ accountId }).lean();
  res.json({
    ok: true,
    data: {
      active: session?.active ?? false,
      connected: hasActiveClient(accountId),
      phoneNumber: session?.phoneNumber
        ? session.phoneNumber.replace(/(\+?\d{1,3})\d+(\d{2})$/, "$1***$2")
        : null,
    },
  });
});

telegramRouter.post("/telegram/direct/request-code", requireAuth, async (req: any, res) => {
  const parsed = z.object({ phoneNumber: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    await requestPhoneCode(req.account.accountId, parsed.data.phoneNumber);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[MTProto] request-code error:", err);
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to send code" });
  }
});

telegramRouter.post("/telegram/direct/verify-code", requireAuth, async (req: any, res) => {
  const parsed = z
    .object({ code: z.string().min(1), password: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    await verifyPhoneCode(
      req.account.accountId,
      parsed.data.code,
      parsed.data.password,
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[MTProto] verify-code error:", err);
    res.status(400).json({ ok: false, error: err?.message ?? "Verification failed" });
  }
});

telegramRouter.delete("/telegram/direct/session", requireAuth, async (req: any, res) => {
  await disconnectMTProtoSession(req.account.accountId);
  res.json({ ok: true });
});

export default telegramRouter;
