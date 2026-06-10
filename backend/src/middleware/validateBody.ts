import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

export const validateBody = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ ok: false, error: result.error.flatten() });
      return;
    }
    req.body = result.data as Record<string, unknown>;
    next();
  };
};
