import type { RequestHandler } from "express";
import { ProviderConnection, Key } from "#models";
import type { SearchContactQuery, ResolveContactQuery } from "#schemas";

export const getConnections: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  try {
    const connections = await ProviderConnection.find({ accountId }).lean();
    res.status(200).json({ ok: true, data: connections });
  } catch (error) {
    next(error);
  }
};

export const searchContact: RequestHandler = async (req, res, next) => {
  const { provider, username } = req.query as unknown as SearchContactQuery;
  const rawUsername = username.replace(/^@/, "").trim();

  try {
    const escapedUsername = rawUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usernameRegex = new RegExp(`^${escapedUsername}$`, "i");
    const normalizedPhone = rawUsername.replace(/[^0-9]/g, "");
    const orClauses: object[] = [{ username: usernameRegex }, { displayName: usernameRegex }];
    if (provider === "whatsapp" && normalizedPhone.length >= 7) {
      orClauses.push({ providerChatId: normalizedPhone });
    }
    const conn = await ProviderConnection.findOne({
      provider: provider as "telegram" | "whatsapp",
      $or: orClauses,
      active: true,
    }).lean();

    if (!conn) {
      next(new Error("User not found — they may need to re-link their account", { cause: { status: 404 } }));
      return;
    }

    let keyRecord = await Key.findOne({ ownerId: conn.providerChatId }).lean();
    if (!keyRecord && conn.accountId) {
      keyRecord = await Key.findOne({ ownerId: conn.accountId.toString() }).lean();
    }

    res.status(200).json({
      ok: true,
      data: {
        provider: conn.provider,
        providerChatId: conn.providerChatId,
        username: conn.username ?? null,
        displayName: conn.displayName ?? null,
        publicKey: keyRecord?.publicKey ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resolveContact: RequestHandler = async (req, res, next) => {
  const { provider, chatId } = req.query as unknown as ResolveContactQuery;

  try {
    const conn = await ProviderConnection.findOne({
      provider,
      providerChatId: chatId,
    }).lean();

    if (!conn) {
      next(new Error("Connection not found", { cause: { status: 404 } }));
      return;
    }

    res.status(200).json({
      ok: true,
      data: { accountId: conn.accountId ?? null },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteConnection: RequestHandler = async (req, res, next) => {
  const accountId = req.account!.accountId;
  const id = req.params.id;

  try {
    const conn = await ProviderConnection.findById(id);
    if (!conn) {
      next(new Error("Connection not found", { cause: { status: 404 } }));
      return;
    }

    if (!conn.accountId || conn.accountId.toString() !== accountId) {
      next(new Error("Forbidden", { cause: { status: 403 } }));
      return;
    }

    await conn.deleteOne();
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
};
