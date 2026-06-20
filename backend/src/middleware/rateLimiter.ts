import rateLimit from "express-rate-limit";

const jsonRateLimitHandler: import("express-rate-limit").Options["handler"] = (
  _req,
  res,
) => {
  res.status(429).json({ ok: false, error: "Too many requests, try again later" });
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

export const linkRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});
