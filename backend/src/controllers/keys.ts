import type { RequestHandler } from "express";
import { Key, ProviderConnection } from "#models";
import type { RegisterKeyBody } from "#schemas";

export const registerKey: RequestHandler = async (req, res, next) => {
  const { publicKey } = req.body as RegisterKeyBody;
  const ownerId = req.account!.email;
  const accountId = req.account!.accountId;

  try {
    const record = await Key.findOneAndUpdate(
      { ownerId },
      { publicKey },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    try {
      const conns = await ProviderConnection.find({ accountId }).lean();
      for (const c of conns) {
        if (c?.providerChatId) {
          await Key.findOneAndUpdate(
            { ownerId: c.providerChatId },
            { publicKey },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
          );
        }
      }
    } catch (mirrorErr) {
      console.error("Failed to mirror public key to provider connections:", mirrorErr);
    }

    res.status(200).json({
      ok: true,
      data: { ownerId: record.ownerId, publicKey: record.publicKey },
    });
  } catch (error) {
    next(error);
  }
};

export const getKey: RequestHandler = async (req, res, next) => {
  const ownerId = req.params.ownerId;

  if (!ownerId) {
    next(new Error("Missing ownerId", { cause: { status: 400 } }));
    return;
  }

  try {
    const record = await Key.findOne({ ownerId }).lean();
    if (!record) {
      next(new Error("Key not found", { cause: { status: 404 } }));
      return;
    }

    res.status(200).json({
      ok: true,
      data: { ownerId: record.ownerId, publicKey: record.publicKey },
    });
  } catch (error) {
    next(error);
  }
};
