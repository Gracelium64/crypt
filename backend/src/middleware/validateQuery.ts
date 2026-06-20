import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

export const validateQuery = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ ok: false, error: result.error.flatten() });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.query = result.data as any;
    next();
  };
};
