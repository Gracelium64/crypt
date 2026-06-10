import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Account, Key, Link, Message, ProviderConnection, TelegramSession } from "#models";
import { env } from "#config";
import type { SignupBody, LoginBody } from "#schemas";

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
      { accountId: account._id.toString(), email: account.email },
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
    const passwordMatch = account && bcrypt.compareSync(password, account.passwordHash);

    if (!account || !passwordMatch) {
      next(new Error("Invalid credentials", { cause: { status: 401 } }));
      return;
    }

    const token = jwt.sign(
      { accountId: account._id.toString(), email: account.email },
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
  const email = req.account?.email;
  if (!accountId || !email) {
    next(new Error("Unauthorized", { cause: { status: 401 } }));
    return;
  }
  try {
    await Message.deleteMany({ accountId });
    await ProviderConnection.deleteMany({ accountId });
    await TelegramSession.deleteMany({ accountId });
    await Link.deleteMany({ claimedAccountId: accountId });
    await Key.deleteMany({ ownerId: email });
    await Account.findByIdAndDelete(accountId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
