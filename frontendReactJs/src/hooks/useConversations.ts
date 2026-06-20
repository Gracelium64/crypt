import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { apiFetch } from "../lib/api";
import { isSecureCiphertext, decryptFromSender } from "../lib/crypto";
import type { EcdhPrivateJwk } from "../lib/crypto";
import type { ChatMessage, ConversationSummary } from "../types";
import { ChatMessageSchema, ConversationSummarySchema, EcdhPrivateJwkSchema } from "../schemas";

export default function useConversations(token?: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSync, setLastSync] = useState<string>("");

  const loadConversations = useCallback(async (currentProvider: string) => {
    try {
      const resp = await apiFetch(
        `/conversations?provider=${currentProvider}&limit=200`,
        {},
        token,
      );
      if (!resp.ok) throw new Error("Could not load conversations");
      const payload = await resp.json();
      const parsed = z.array(ConversationSummarySchema).safeParse(payload.data ?? []);
      if (parsed.success) setConversations(parsed.data);
      else console.error("[Conversations] response shape mismatch:", parsed.error);
    } catch (_err) {
      console.error("loadConversations error", _err);
    }
  }, [token]);

  const loadMessages = useCallback(
    async (
      currentProvider: string,
      currentChatId: string,
      since?: string,
      privJwk?: EcdhPrivateJwk | null,
      localOwnerId?: string | null,
    ) => {
      try {
        if (!currentChatId) {
          setMessages([]);
          setLastSync("");
          return;
        }

        const params = new URLSearchParams({
          provider: currentProvider,
          chatId: currentChatId,
          limit: "100",
        });
        if (since) params.set("since", since);

        const resp = await apiFetch(`/messages?${params.toString()}`, {}, token);
        if (!resp.ok) throw new Error("Could not load messages");
        const payload = await resp.json();
        const parseResult = z.array(ChatMessageSchema).safeParse(payload.data ?? []);
        if (!parseResult.success) {
          console.error("[Messages] response shape mismatch:", parseResult.error);
          return;
        }
        const incoming = parseResult.data;

        // Attempt best-effort decryption per message when a private key is available
        const storedRaw = localOwnerId
          ? (() => { try { return JSON.parse(localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null"); } catch { /* non-fatal: corrupted localStorage key */ return null; } })()
          : null;
        const storedJwk = storedRaw ? EcdhPrivateJwkSchema.safeParse(storedRaw) : null;
        const priv: EcdhPrivateJwk | null = privJwk ?? (storedJwk?.success ? storedJwk.data : null);

        if (priv) {
          for (const item of incoming) {
            try {
              const ct = item.encryptedText ?? "";
              if (!isSecureCiphertext(ct)) continue;
              const ownerId =
                item.direction === "inbound" ? item.from : item.to;
              if (!ownerId) continue;

              const kresp = await apiFetch(
                `/keys/${encodeURIComponent(ownerId)}`,
              );
              if (!kresp.ok) continue;
              const kjson = await kresp.json();
              const theirPub = kjson?.data?.publicKey;
              if (!theirPub) continue;

              const plain = await decryptFromSender(ct, priv, theirPub);
              if (plain) item.decryptedText = plain;
            } catch { /* ignore per-message decrypt failures — message still rendered encrypted */ }
          }
        }

        setMessages(incoming);
        setLastSync(incoming[incoming.length - 1]?.createdAt ?? "");
      } catch (_err) {
        console.error("loadMessages error", _err);
      }
    },
    [token],
  );

  const handleIncomingMessage = useCallback(
    async (
      message: ChatMessage,
      privJwk?: EcdhPrivateJwk | null,
      localOwnerId?: string | null,
    ) => {
      try {
        const ct = message.encryptedText ?? "";
        if (isSecureCiphertext(ct)) {
          const incomingRaw = localOwnerId
            ? (() => { try { return JSON.parse(localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null"); } catch { /* non-fatal: corrupted localStorage key */ return null; } })()
            : null;
          const incomingJwk = incomingRaw ? EcdhPrivateJwkSchema.safeParse(incomingRaw) : null;
          const priv: EcdhPrivateJwk | null = privJwk ?? (incomingJwk?.success ? incomingJwk.data : null);
          if (priv) {
            const ownerId =
              message.direction === "inbound" ? message.from : message.to;
            if (ownerId) {
              const kresp = await apiFetch(
                `/keys/${encodeURIComponent(ownerId)}`,
              );
              if (kresp.ok) {
                const kjson = await kresp.json();
                const theirPub = kjson?.data?.publicKey;
                if (theirPub) {
                  const plain = await decryptFromSender(ct, priv, theirPub);
                  if (plain) message.decryptedText = plain;
                }
              }
            }
          }
        }
      } catch { /* ignore per-realtime-message decrypt failure — message still rendered encrypted */ }

      setMessages((current) => [...current, message]);
      setLastSync(message.createdAt);
    },
    [],
  );

  return useMemo(
    () => ({
      conversations,
      messages,
      lastSync,
      setMessages,
      loadConversations,
      loadMessages,
      handleIncomingMessage,
    }),
    [
      conversations,
      messages,
      lastSync,
      setMessages,
      loadConversations,
      loadMessages,
      handleIncomingMessage,
    ],
  );
}
