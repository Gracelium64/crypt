import { Router } from "express";
import { authenticate, authorize, validateBody, authRateLimiter } from "#middleware";
import { register, login, me, nukeAccount } from "#controllers";
import { signupSchema, loginSchema } from "#schemas";

export const authRouter = Router();

authRouter.post("/auth/signup", authRateLimiter, validateBody(signupSchema), register);
authRouter.post("/auth/login", authRateLimiter, validateBody(loginSchema), login);
authRouter.get("/auth/me", authenticate, authorize(), me);
authRouter.delete("/auth/account", authenticate, authorize(), nukeAccount);
