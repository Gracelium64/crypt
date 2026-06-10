import { Router } from "express";
import { authenticate, validateBody } from "#middleware";
import { register, login, me, nukeAccount } from "#controllers";
import { signupSchema, loginSchema } from "#schemas";

export const authRouter = Router();

authRouter.post("/auth/signup", validateBody(signupSchema), register);
authRouter.post("/auth/login", validateBody(loginSchema), login);
authRouter.get("/auth/me", authenticate, me);
authRouter.delete("/auth/account", authenticate, nukeAccount);
