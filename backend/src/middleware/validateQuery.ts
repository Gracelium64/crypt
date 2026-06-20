import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

export const validateQuery = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ ok: false, error: result.error.flatten() });
      return;
    }
    Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
    next();
  };
};
