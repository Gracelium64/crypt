import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Account } from "../models/account.model.js";
import { env } from "../config/env.js";

const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

authRouter.post("/auth/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { email, password, displayName } = parsed.data;
  try {
    const existing = await Account.findOne({ email }).lean();
    if (existing) {
      res.status(400).json({ ok: false, error: "email in use" });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const account = await Account.create({ email, displayName, passwordHash });

    const token = jwt.sign(
      { accountId: account._id.toString(), email: account.email },
      env.JWT_SECRET ?? env.DEMO_ENCRYPTION_KEY,
      { expiresIn: "7d" },
    );

    res.status(200).json({ ok: true, data: { token } });
    return;
  } catch (error) {
    res
      .status(500)
      .json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    return;
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  try {
    const account = await Account.findOne({ email });
    if (!account) {
      res.status(401).json({ ok: false, error: "invalid credentials" });
      return;
    }

    const ok = bcrypt.compareSync(password, account.passwordHash);
    if (!ok) {
      res.status(401).json({ ok: false, error: "invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { accountId: account._id.toString(), email: account.email },
      env.JWT_SECRET ?? env.DEMO_ENCRYPTION_KEY,
      { expiresIn: "7d" },
    );

    res.status(200).json({ ok: true, data: { token } });
    return;
  } catch (error) {
    res
      .status(500)
      .json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    return;
  }
});

const requireAuth = (req: any, res: any, next: any) => {
  const header = req.header("authorization");
  if (!header) {
    res.status(401).json({ ok: false, error: "missing authorization" });
    return;
  }
  const parts = header.split(" ");
  const token = parts[1];
  try {
    const payload = jwt.verify(
      token,
      env.JWT_SECRET ?? env.DEMO_ENCRYPTION_KEY,
    );
    req.account = payload;
    return next();
  } catch (err) {
    res.status(401).json({ ok: false, error: "invalid token" });
    return;
  }
};

authRouter.get("/auth/me", requireAuth, async (req: any, res) => {
  const accountId = req.account?.accountId;
  if (!accountId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const account = await Account.findById(accountId).lean();
  if (!account) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }

  res
    .status(200)
    .json({
      ok: true,
      data: {
        email: account.email,
        displayName: account.displayName,
        id: account._id,
      },
    });
  return;
});

export default authRouter;
export { requireAuth };
