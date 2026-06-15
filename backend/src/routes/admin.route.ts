import { Router } from "express";
import { requireAdmin } from "#middleware";
import { setWebhook, deleteWebhook, testProvider } from "#controllers";

export const adminRouter = Router();

adminRouter.post("/admin/telegram/set-webhook", requireAdmin, setWebhook);
adminRouter.post("/admin/telegram/delete-webhook", requireAdmin, deleteWebhook);
adminRouter.post("/admin/providers/test", requireAdmin, testProvider);
