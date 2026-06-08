import { Router } from "express";
import { z } from "zod";
import { Key, ProviderConnection } from "#models";
import { requireAuth } from "./auth.route.js";

const keysRouter = Router();

const registerSchema = z.object({
  publicKey: z.string().min(1),
});

keysRouter.post("/keys/register", requireAuth, async (req: any, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { publicKey } = parsed.data;
  const ownerId = req.account?.email as string | undefined;
  if (!ownerId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    const record = await Key.findOneAndUpdate(
      { ownerId },
      { publicKey },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    // Mirror this public key to any provider connections owned by this account
    try {
      const accountId = req.account?.accountId;
      if (accountId) {
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
      }
    } catch (mirrorErr) {
      console.error(
        "Failed to mirror public key to provider connections:",
        mirrorErr,
      );
    }
    res.status(200).json({
      ok: true,
      data: { ownerId: record.ownerId, publicKey: record.publicKey },
    });
    return;
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});

keysRouter.get("/keys/:ownerId", async (req, res) => {
  const ownerId = req.params.ownerId;
  if (!ownerId) {
    res.status(400).json({ ok: false, error: "missing ownerId" });
    return;
  }

  const record = await Key.findOne({ ownerId }).lean();
  if (!record) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }

  res.status(200).json({
    ok: true,
    data: { ownerId: record.ownerId, publicKey: record.publicKey },
  });
  return;
});

export default keysRouter;
