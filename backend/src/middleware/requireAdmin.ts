import type { RequestHandler } from "express";
import { env } from "#config";

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = req.header("x-admin-token");
  if (!env.WEBHOOK_ADMIN_TOKEN || token !== env.WEBHOOK_ADMIN_TOKEN) {
    next(new Error("Unauthorized", { cause: { status: 401 } }));
    return;
  }
  next();
};
