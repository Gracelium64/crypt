import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { Api } from "telegram";
import { Message, ProviderConnection, TelegramSession, Key, Account } from "#models";
import { broadcastMessage } from "./realtime.service.js";
import { env } from "../config/env.js";

const API_ID = env.TELEGRAM_API_ID ?? 0;
const API_HASH = env.TELEGRAM_API_HASH ?? "";

// Derive the CryptBot's own Telegram user ID from the bot token ("id:hash")
// so we can filter out bot-echoed messages in subscribeToMessages.
const BOT_USER_ID = env.TELEGRAM_BOT_TOKEN?.split(":")[0] ?? "";

// Shared "first + last name" joining logic for Telegram contacts — used
// wherever a display name is derived from a Telegram entity/message sender.
// Each call site still applies its own fallback priority on top of this.
export function joinPersonName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

// In-memory registry: accountId → connected client
const clients = new Map<string, TelegramClient>();

interface PendingAuth {
  client: TelegramClient;
  phoneCodeHash: string;
  phoneNumber: string;
}
const pendingAuth = new Map<string, PendingAuth>();

function createClient(sessionStr: string): TelegramClient {
  return new TelegramClient(new StringSession(sessionStr), API_ID, API_HASH, {
    connectionRetries: 3,
  });
}

function subscribeToMessages(client: TelegramClient, accountId: string): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const msg = event.message as any;
      const text: string = msg.message ?? "";
      if (!text && !msg.media) return;

      // Sender's Telegram user ID
      const fromId: string =
        msg.fromId?.userId?.toString() ??
        msg.peerId?.userId?.toString() ??
        "";
      if (!fromId) return;

      // Ignore messages sent by the CryptBot itself (happens when bot-delivery
      // echoes back to an MTProto-linked account, creating spurious conversations).
      if (BOT_USER_ID && fromId === BOT_USER_ID) return;

      // Own connection to get this account's providerChatId
      const ownerConn = await ProviderConnection.findOne({
        accountId,
        provider: "telegram",
        active: true,
      }).lean();

      const created = await Message.create({
        provider: "telegram",
        direction: "inbound",
        accountId,
        from: fromId,
        to: ownerConn?.providerChatId ?? accountId,
        chatId: fromId,
        deliveryStatus: "sent",
        encryptedText: text,
        bodyOmitted: false,
        attachments: [],
      });

      broadcastMessage(created);

      // Async upsert sender contact info (non-blocking)
      (async () => {
        try {
          const sender = await client.getEntity(fromId) as any;
          const displayName = joinPersonName(sender?.firstName, sender?.lastName);
          const username: string | null = sender?.username ?? null;
          if (displayName || username) {
            await ProviderConnection.findOneAndUpdate(
              { provider: "telegram", providerChatId: fromId, accountId: null },
              { $setOnInsert: { provider: "telegram", providerChatId: fromId, accountId: null, active: false },
                $set: { ...(displayName ? { displayName } : {}), ...(username ? { username } : {}) } },
              { upsert: true },
            );
          }
        } catch { /* non-fatal */ }
      })();
    } catch (err) {
      console.error("[MTProto] inbound handler error:", err);
    }
  }, new NewMessage({ incoming: true }));
}

export async function loadAllMTProtoSessions(): Promise<void> {
  if (!API_ID || !API_HASH) {
    console.log("[MTProto] TELEGRAM_API_ID/HASH not set — MTProto disabled");
    return;
  }

  const sessions = await TelegramSession.find({
    active: true,
    sessionString: { $ne: "" },
  }).lean();

  for (const s of sessions) {
    const accountId = s.accountId.toString();
    try {
      const client = createClient(s.sessionString);
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        await TelegramSession.updateOne({ _id: s._id }, { active: false });
        console.log("[MTProto] stale session cleared for", accountId);
        continue;
      }
      clients.set(accountId, client);
      subscribeToMessages(client, accountId);
      console.log("[MTProto] session restored for account", accountId);
    } catch (err) {
      console.error("[MTProto] failed to restore session for", accountId, err);
    }
  }
}

export function hasActiveClient(accountId: string): boolean {
  const client = clients.get(accountId);
  // Check both presence AND an active TCP connection. A client that is in the
  // map but has dropped its Telegram connection would otherwise suppress the
  // fan-out copy, leaving the recipient with no inbound message in Crypt.
  return client !== undefined && (client.connected ?? false);
}

export async function requestPhoneCode(
  accountId: string,
  phoneNumber: string,
): Promise<void> {
  if (!API_ID || !API_HASH) {
    throw new Error("Telegram MTProto not configured (set TELEGRAM_API_ID + TELEGRAM_API_HASH)");
  }

  const existing = pendingAuth.get(accountId);
  if (existing) {
    try { await existing.client.disconnect(); } catch { /* ignore */ }
    pendingAuth.delete(accountId);
  }

  const client = createClient("");

  // Suppress unhandled error events on this client — errors are surfaced via thrown promises
  (client as any).on?.("error", (err: unknown) => {
    console.error("[MTProto] client error event:", err);
  });

  await client.connect();

  const result = await client.sendCode(
    { apiId: API_ID, apiHash: API_HASH },
    phoneNumber,
  ) as any;

  console.log("[MTProto] phoneCodeHash present:", !!result?.phoneCodeHash);
  console.log("[MTProto] result keys:", Object.keys(result ?? {}));
  console.log("[MTProto] isCodeViaApp:", result?.isCodeViaApp);

  const phoneCodeHash: string = result?.phoneCodeHash ?? "";
  if (!phoneCodeHash) {
    throw new Error("sendCode returned no phoneCodeHash — check API_ID/API_HASH and phone number format");
  }

  console.log("[MTProto] code sent successfully to", phoneNumber);
  pendingAuth.set(accountId, { client, phoneCodeHash, phoneNumber });
}

export async function verifyPhoneCode(
  accountId: string,
  phoneCode: string,
  password?: string,
): Promise<void> {
  const pending = pendingAuth.get(accountId);
  if (!pending) throw new Error("No pending auth — request a code first");

  const { client, phoneCodeHash, phoneNumber } = pending;

  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }),
    );
  } catch (err: any) {
    const msg: string = err?.errorMessage ?? err?.message ?? "";
    if (msg.includes("SESSION_PASSWORD_NEEDED")) {
      if (!password) throw new Error("Two-factor authentication required — provide your Telegram password");
      const { computeCheck } = await import("telegram/Password.js");
      const pwdInfo = await client.invoke(new Api.account.GetPassword());
      const check = await computeCheck(pwdInfo as any, password);
      await client.invoke(new Api.auth.CheckPassword({ password: check as any }));
    } else {
      throw err;
    }
  }

  const sessionString = (client.session as StringSession).save() as string;

  await TelegramSession.findOneAndUpdate(
    { accountId },
    { accountId, phoneNumber, sessionString, active: true },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  // Auto-create ProviderConnection from the MTProto identity — no bot link needed
  try {
    const me = await client.getMe() as any;
    const userId = me?.id?.toString() ?? null;
    const username: string | null = me?.username ?? null;
    const displayName =
      joinPersonName(me?.firstName, me?.lastName) ||
      username ||
      userId ||
      phoneNumber;

    if (userId) {
      await ProviderConnection.findOneAndUpdate(
        { accountId, provider: "telegram" },
        { accountId, provider: "telegram", providerChatId: userId, displayName, username, active: true },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      // Mirror key from account email to providerChatId
      const account = await Account.findById(accountId).lean();
      if (account?.email) {
        const keyRecord = await Key.findOne({ ownerId: account.email }).lean();
        if (keyRecord?.publicKey) {
          await Key.findOneAndUpdate(
            { ownerId: userId },
            { publicKey: keyRecord.publicKey },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
          );
        }
      }

      console.log("[MTProto] ProviderConnection upserted for", userId, username ? `(@${username})` : "");
    }
  } catch (err) {
    console.error("[MTProto] Failed to upsert ProviderConnection:", err);
  }

  const oldClient = clients.get(accountId);
  if (oldClient) {
    try { await oldClient.disconnect(); } catch { /* ignore */ }
  }

  clients.set(accountId, client);
  subscribeToMessages(client, accountId);
  pendingAuth.delete(accountId);
}

export async function sendViaMTProto(
  senderAccountId: string,
  recipientProviderChatId: string,
): Promise<((text: string) => Promise<boolean>)> {
  const client = clients.get(senderAccountId);
  if (!client) return async () => false;

  return async (text: string): Promise<boolean> => {
    try {
      if (!client.connected) await client.connect();

      const recipientId = BigInt(recipientProviderChatId);

      // Try numeric ID first; if entity not cached, fall back to @username.
      let peer: any;
      try {
        peer = await client.getInputEntity(recipientId as any);
      } catch {
        const conn = await ProviderConnection.findOne({
          provider: "telegram",
          providerChatId: recipientProviderChatId,
        }).lean();
        if (!conn?.username) throw new Error("Cannot resolve Telegram entity — no username available");
        peer = await client.getInputEntity(`@${conn.username}`);
      }

      await client.invoke(
        new Api.messages.SendMessage({
          peer,
          message: text,
          randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) as any,
          noWebpage: true,
        }),
      );
      return true;
    } catch (err) {
      console.error("[MTProto] send failed:", err);
      return false;
    }
  };
}

// ── QR-code login ────────────────────────────────────────────────────────────

interface PendingQr {
  client: TelegramClient;
  token: string;
  step: "qr" | "2fa" | "done" | "error";
  twoFaResolver?: (password: string) => void;
  error?: string;
}
const pendingQr = new Map<string, PendingQr>();

export function getQrLoginStatus(accountId: string): { token: string; step: string; error?: string } {
  const entry = pendingQr.get(accountId);
  if (!entry) return { token: "", step: "idle" };
  return { token: entry.token, step: entry.step, error: entry.error };
}

export function resolveQr2fa(accountId: string, password: string): void {
  const entry = pendingQr.get(accountId);
  if (!entry?.twoFaResolver) throw new Error("No pending 2FA for this session");
  entry.twoFaResolver(password);
  entry.step = "qr";
  entry.twoFaResolver = undefined;
}

export async function startQrLogin(accountId: string): Promise<void> {
  if (!API_ID || !API_HASH) {
    throw new Error("Telegram MTProto not configured (set TELEGRAM_API_ID + TELEGRAM_API_HASH)");
  }

  const existing = pendingQr.get(accountId);
  if (existing) {
    try { await existing.client.disconnect(); } catch { /* ignore */ }
    pendingQr.delete(accountId);
  }

  const client = createClient("");
  (client as any).on?.("error", (err: unknown) => {
    console.error("[MTProto QR] client error:", err);
  });

  await client.connect();

  const entry: PendingQr = { client, token: "", step: "qr" };
  pendingQr.set(accountId, entry);

  void (async () => {
    try {
      await client.signInUserWithQrCode(
        { apiId: API_ID, apiHash: API_HASH },
        {
          qrCode: async (code: { token: Buffer; expires: number }) => {
            const token = `tg://login?token=${code.token.toString("base64url")}`;
            const e = pendingQr.get(accountId);
            if (e) e.token = token;
            console.log("[MTProto QR] token refreshed for", accountId);
          },
          onError: async (err: Error) => {
            console.error("[MTProto QR] error:", err);
            const e = pendingQr.get(accountId);
            if (e) { e.step = "error"; e.error = err.message; }
            return false;
          },
          password: async (_hint?: string) => {
            const e = pendingQr.get(accountId);
            if (!e) throw new Error("No pending QR session");
            e.step = "2fa";
            console.log("[MTProto QR] 2FA required for", accountId);
            return new Promise<string>((resolve) => { e.twoFaResolver = resolve; });
          },
        },
      );

      const sessionString = (client.session as StringSession).save() as string;
      const me = await client.getMe() as any;
      const userId: string | null = me?.id?.toString() ?? null;
      const username: string | null = me?.username ?? null;
      const phoneNumber: string = me?.phone ?? "qr-login";
      const displayName =
        joinPersonName(me?.firstName, me?.lastName) ||
        username || phoneNumber || userId;

      await TelegramSession.findOneAndUpdate(
        { accountId },
        { accountId, phoneNumber, sessionString, active: true },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      if (userId) {
        await ProviderConnection.findOneAndUpdate(
          { accountId, provider: "telegram" },
          { accountId, provider: "telegram", providerChatId: userId, displayName, username, active: true },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        );

        const account = await Account.findById(accountId).lean();
        if (account?.email) {
          const keyRecord = await Key.findOne({ ownerId: account.email }).lean();
          if (keyRecord?.publicKey) {
            await Key.findOneAndUpdate(
              { ownerId: userId },
              { publicKey: keyRecord.publicKey },
              { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
            );
          }
        }
      }

      const oldClient = clients.get(accountId);
      if (oldClient) {
        try { await oldClient.disconnect(); } catch { /* ignore */ }
      }
      clients.set(accountId, client);
      subscribeToMessages(client, accountId);

      const e = pendingQr.get(accountId);
      if (e) e.step = "done";
      console.log("[MTProto QR] auth complete for", accountId);
    } catch (err) {
      console.error("[MTProto QR] auth failed:", err);
      const e = pendingQr.get(accountId);
      if (e) { e.step = "error"; e.error = (err as Error).message; }
    }
  })();
}

// ─────────────────────────────────────────────────────────────────────────────

export async function disconnectMTProtoSession(accountId: string): Promise<void> {
  const client = clients.get(accountId);
  if (client) {
    try { await client.invoke(new Api.auth.LogOut()); } catch { /* ignore */ }
    try { await client.disconnect(); } catch { /* ignore */ }
    clients.delete(accountId);
  }
  await TelegramSession.findOneAndUpdate({ accountId }, { active: false, sessionString: "" });
}
