import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Account, Key, Link, Message, ProviderConnection, TelegramSession } from "#models";
import { logEvent } from "#services";
import { env } from "#config";
import type { SignupBody, LoginBody } from "#schemas";

const MAX_LOGIN_ATTEMPTS = 8;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const register: RequestHandler = async (req, res, next) => {
  const { email, password, displayName } = req.body as SignupBody;
  try {
    const existing = await Account.findOne({ email }).lean();
    if (existing) {
      next(new Error("Email already in use", { cause: { status: 400 } }));
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const account = await Account.create({ email, displayName, passwordHash });

    const token = jwt.sign(
      { accountId: account._id.toString() },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({ ok: true, data: { token } });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  const { email, password } = req.body as LoginBody;
  try {
    const account = await Account.findOne({ email });

    if (account?.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      next(
        new Error("Account temporarily locked due to repeated failed login attempts. Try again later.", {
          cause: { status: 423 },
        }),
      );
      return;
    }

    const passwordMatch = account && bcrypt.compareSync(password, account.passwordHash);

    if (!account || !passwordMatch) {
      if (account) {
        account.failedLoginAttempts = (account.failedLoginAttempts ?? 0) + 1;
        if (account.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          account.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
          account.failedLoginAttempts = 0;
        }
        await account.save();
      }
      void logEvent("warn", "auth:login_failed", { email });
      next(new Error("Invalid credentials", { cause: { status: 401 } }));
      return;
    }

    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    await account.save();

    const token = jwt.sign(
      { accountId: account._id.toString() },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(200).json({ ok: true, data: { token } });
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  const accountId = req.account?.accountId;
  try {
    const account = await Account.findById(accountId).lean();
    if (!account) {
      next(new Error("Account not found", { cause: { status: 404 } }));
      return;
    }

    res.status(200).json({
      ok: true,
      data: { email: account.email, displayName: account.displayName, id: account._id },
    });
  } catch (error) {
    next(error);
  }
};

export const nukeAccount: RequestHandler = async (req, res, next) => {
  const accountId = req.account?.accountId;
  if (!accountId) {
    next(new Error("Unauthorized", { cause: { status: 401 } }));
    return;
  }
  try {
    await Message.deleteMany({ accountId });
    await ProviderConnection.deleteMany({ accountId });
    await TelegramSession.deleteMany({ accountId });
    await Link.deleteMany({ claimedAccountId: accountId });
    await Key.deleteMany({ ownerId: accountId });
    await Account.findByIdAndDelete(accountId);
    void logEvent("warn", "auth:nuke_account", { accountId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
