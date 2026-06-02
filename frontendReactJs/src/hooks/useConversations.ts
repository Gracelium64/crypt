import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api";
import { isSecureCiphertext, decryptFromSender } from "../lib/crypto";
import type { ChatMessage, ConversationSummary } from "../types";

export default function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSync, setLastSync] = useState<string>("");

  const loadConversations = useCallback(async (currentProvider: string) => {
    const response = await apiFetch(
      `/conversations?provider=${currentProvider}&limit=200`,
    );
    if (!response.ok) throw new Error("Could not load conversations");
    const payload = await response.json();
    setConversations(payload.data ?? []);
  }, []);

  const loadMessages = useCallback(
    async (
      currentProvider: string,
      currentChatId: string,
      since?: string,
      privJwk?: any | null,
      localOwnerId?: string | null,
    ) => {
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

      const response = await apiFetch(`/messages?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load messages");

      const payload = await response.json();
      const incoming = (payload.data ?? []) as any[];

      const tryDecrypt = async (items: any[]) => {
        const priv =
          privJwk ??
          (localOwnerId
            ? JSON.parse(
                localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null",
              )
            : null);
        if (!priv) return items;

        const pubCache: Record<string, string | null> = {};

        for (const item of items) {
          const ct = item.encryptedText ?? "";
          if (!isSecureCiphertext(ct)) continue;

          const ownerId = item.direction === "inbound" ? item.from : item.to;
          if (!ownerId) continue;

          if (pubCache[ownerId] === undefined) {
            try {
              const resp = await apiFetch(
                `/keys/${encodeURIComponent(ownerId)}`,
              );
              if (!resp.ok) {
                pubCache[ownerId] = null;
              } else {
                const j = await resp.json();
                pubCache[ownerId] = j?.data?.publicKey ?? null;
              }
            } catch (err) {
              pubCache[ownerId] = null;
            }
          }

          const theirPub = pubCache[ownerId];
          if (!theirPub) continue;

          try {
            const plain = await decryptFromSender(ct, priv, theirPub);
            if (plain) item.decryptedText = plain;
          } catch (err) {
            // ignore per-message decrypt failures
          }
        }

        return items;
      };

      await tryDecrypt(incoming);

      setMessages((current) => {
        const map = new Map(current.map((item) => [item._id ?? item.id, item]));
        for (const item of incoming) {
          map.set(item._id ?? item.id, item);
        }
        return Array.from(map.values()).sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        );
      });

      setLastSync(incoming[incoming.length - 1]?.createdAt ?? "");
    },
    [],
  );

  const handleIncomingMessage = useCallback(
    async (
      message: ChatMessage,
      privJwk?: any | null,
      localOwnerId?: string | null,
    ) => {
      try {
        const ct = message.encryptedText ?? "";
        if (!isSecureCiphertext(ct)) return;
        const priv =
          privJwk ??
          (localOwnerId
            ? JSON.parse(
                localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null",
              )
            : null);
        if (!priv) return;

        const ownerId =
          message.direction === "inbound" ? message.from : message.to;
        if (!ownerId) return;

        const resp = await apiFetch(`/keys/${encodeURIComponent(ownerId)}`);
        if (!resp.ok) return;
        const j = await resp.json();
        const theirPub = j?.data?.publicKey;
        if (!theirPub) return;

        const plain = await decryptFromSender(ct, priv, theirPub);
        if (plain) message.decryptedText = plain;
      } catch (err) {
        // ignore
      }

      setMessages((current) => [...current, message]);
      setLastSync(message.createdAt);
    },
    [],
  );

  return {
    conversations,
    messages,
    lastSync,
    setMessages,
    loadConversations,
    loadMessages,
    handleIncomingMessage,
  };
}
