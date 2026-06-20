import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "#config";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : undefined;

  if (!token) {
    next(new Error("Missing authorization token", { cause: { status: 401 } }));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      accountId: string;
      iat?: number;
      exp?: number;
    };
    req.account = payload;
    next();
  } catch {
    next(new Error("Invalid or expired token", { cause: { status: 401 } }));
  }
};
