import { Router } from "express";
import { authenticate, validateBody, authRateLimiter } from "#middleware";
import { register, login, me, nukeAccount } from "#controllers";
import { signupSchema, loginSchema } from "#schemas";

export const authRouter = Router();

authRouter.post("/auth/signup", authRateLimiter, validateBody(signupSchema), register);
authRouter.post("/auth/login", authRateLimiter, validateBody(loginSchema), login);
authRouter.get("/auth/me", authenticate, me);
authRouter.delete("/auth/account", authenticate, nukeAccount);
