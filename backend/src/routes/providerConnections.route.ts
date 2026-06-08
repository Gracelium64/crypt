import { Router } from "express";
import { ProviderConnection, Key } from "#models";
import { requireAuth } from "./auth.route.js";

const router = Router();

router.get("/provider/connections", requireAuth, async (req: any, res) => {
  const accountId = req.account?.accountId;
  if (!accountId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const connections = await ProviderConnection.find({ accountId }).lean();
  res.status(200).json({ ok: true, data: connections });
  return;
});

// Find a contact by @username within a provider (public endpoint)
router.get("/provider/contact/search", async (req, res) => {
  const provider = String(req.query.provider || "");
  const rawUsername = String(req.query.username || "").replace(/^@/, "").trim();

  if (!provider || !rawUsername) {
    res.status(400).json({ ok: false, error: "missing provider or username" });
    return;
  }

  const usernameRegex = new RegExp(`^${rawUsername}$`, "i");
  // Search by username field first; fall back to displayName for connections
  // created before the username field was added (re-linking fixes this permanently).
  const conn = await ProviderConnection.findOne({
    provider: provider as any,
    $or: [
      { username: usernameRegex },
      // displayName fallback: only consider it a username match when it starts
      // with a letter (i.e. not an old numeric-id display name)
      { displayName: usernameRegex },
    ],
    active: true,
  }).lean();

  if (!conn) {
    res.status(404).json({ ok: false, error: "user not found — they may need to re-link their account" });
    return;
  }

  const keyRecord = await Key.findOne({ ownerId: conn.providerChatId }).lean();

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
  return;
});

// Resolve a provider chatId to the owning account (public endpoint)
router.get("/provider/resolve", async (req, res) => {
  const provider = String(req.query.provider || "");
  const chatId = String(req.query.chatId || "");
  if (!provider || !chatId) {
    res.status(400).json({ ok: false, error: "missing provider or chatId" });
    return;
  }

  const conn = await ProviderConnection.findOne({
    provider: provider as any,
    providerChatId: chatId,
  } as any).lean();
  if (!conn) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }

  // Attempt to populate account email
  try {
    // Lazy require to avoid circular dep issues
    const { Account } = await import("#models");
    const account = await Account.findById(conn.accountId).lean();
    res.status(200).json({
      ok: true,
      data: { accountId: conn.accountId, email: account?.email ?? null },
    });
    return;
  } catch (err) {
    res.status(200).json({ ok: true, data: { accountId: conn.accountId } });
    return;
  }
});

router.delete(
  "/provider/connections/:id",
  requireAuth,
  async (req: any, res) => {
    const accountId = req.account?.accountId;
    const id = req.params.id;
    if (!accountId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const conn = await ProviderConnection.findById(id);
    if (!conn) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }

    if (conn.accountId.toString() !== accountId) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    await conn.deleteOne();
    res.status(200).json({ ok: true });
    return;
  },
);

export default router;
