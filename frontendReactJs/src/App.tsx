import { useEffect, useRef, useState, useCallback } from "react";
import "./styles/app-dialogs.css";
import { useAuth } from "@/context";
import { apiFetch } from "@/lib/api";
import { isSecureCiphertext, decryptFromSender } from "@/lib/crypto";
import { useConversations, useConnections, useProviders, useRealtime, useSend } from "@/hooks";
import { generateKeypair as generateKeypairService, registerPublicKey as registerPublicKeyService, fetchAndDecryptPrivateKey, resolveKeypairDisplay } from "@/services";
import { nukeAccountRequest, verifyPasswordRequest } from "@/data";
import { ProtectedLayout } from "@/layouts";
import { ChatsPage, FindPage, SettingsPage, ChatView } from "@/pages";
import { OnboardingModal } from "@/components";
import type { Provider, ChatMessage, EcdhPrivateJwk } from "@/types";
import { EcdhPrivateJwkSchema } from "@/schemas";

const providerMeta: Record<Provider, { label: string; icon: string; accent: string }> = {
  telegram: { label: "Telegram", icon: "✈️", accent: "#2CA5E0" },
  whatsapp: { label: "WhatsApp", icon: "💬", accent: "#25D366" },
};
const supportedProviders: Provider[] = ["telegram", "whatsapp"];

function AppContent() {
  const auth = useAuth();
  const [provider, setProvider] = useState<Provider>("telegram");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<"secure" | "plain">("secure");
  const [localOwnerId, setLocalOwnerId] = useState("");
  const [pubKeyB64, setPubKeyB64] = useState<string | null>(null);
  const [privJwk, setPrivJwk] = useState<EcdhPrivateJwk | null>(null);
  const keySetupInProgress = useRef(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nukeOpen, setNukeOpen] = useState(false);
  const [nukeCount, setNukeCount] = useState(10);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [tab, setTab] = useState<"chats" | "find" | "settings">("chats");
  const [chatOpen, setChatOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastsEnabled, setToastsEnabled] = useState(
    () => localStorage.getItem("crypt:toasts") !== "off",
  );
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState<Set<Provider>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);

  const convHook = useConversations(auth.token);
  const { handleIncomingMessage } = convHook;
  const { sendMessage: sendMessageHook, busy: sendBusy } = useSend(auth.token, convHook);
  const connectionsHook = useConnections(auth.token);
  const { providerStatuses, loadProviderStatuses } = useProviders(auth.token);

  const providerRef = useRef(provider);
  const selectedChatIdRef = useRef(selectedChatId);
  const lastSyncRef = useRef(convHook.lastSync);
  const conversationsRef = useRef(convHook.conversations);
  const readTimestamps = useRef<Map<string, string | undefined>>(new Map());

  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { selectedChatIdRef.current = selectedChatId; }, [selectedChatId]);
  useEffect(() => { lastSyncRef.current = convHook.lastSync; }, [convHook.lastSync]);
  useEffect(() => { conversationsRef.current = convHook.conversations; }, [convHook.conversations]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const showToast = useCallback((msg: string) => {
    if (toastsEnabled) setToastMessage(msg);
  }, [toastsEnabled]);

  const toggleToasts = () => {
    const next = !toastsEnabled;
    setToastsEnabled(next);
    localStorage.setItem("crypt:toasts", next ? "on" : "off");
  };

  const cancelNuke = useCallback(() => {
    setNukeOpen(false);
    setNukeCount(10);
  }, []);

  const executeNuke = useCallback(async () => {
    try {
      if (auth.token) await nukeAccountRequest(auth.token);
    } catch (err) {
      console.error("Nuke failed:", err);
    } finally {
      const email = auth.user?.email;
      if (email) {
        localStorage.removeItem(`crypt:priv:${email}`);
        localStorage.removeItem(`crypt:pub:${email}`);
      }
      setNukeOpen(false);
      setNukeCount(10);
      await auth.logout();
    }
  }, [auth]);

  useEffect(() => {
    if (!nukeOpen) return;
    const tick = setInterval(() => {
      setNukeCount((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [nukeOpen]);

  useEffect(() => {
    if (nukeOpen && nukeCount === 0) void executeNuke();
  }, [nukeOpen, nukeCount, executeNuke]);

  const openConversation = useCallback((chatId: string, prov?: Provider) => {
    if (prov) setProvider(prov);
    setSelectedChatId(chatId);
    setChatOpen(true);
    convHook.markConversationRead(chatId);
    const conv = conversationsRef.current.find((c) => c.chatId === chatId);
    readTimestamps.current.set(chatId, conv?.lastMessageAt);
  }, [convHook.markConversationRead]);

  useEffect(() => {
    if (!file) { setFilePreview(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectedConversation =
    convHook.conversations.find((c) => c.chatId === selectedChatId) ?? null;

  const selectedProviderStatus =
    providerStatuses.find((s) => s.provider === provider) ?? null;

  const loadConversations = useCallback(
    async (p: Provider) => {
      setLoadingProviders((prev) => new Set(prev).add(p));
      try {
        await convHook.loadConversations(p);
      } finally {
        setLoadingProviders((prev) => {
          const next = new Set(prev);
          next.delete(p);
          return next;
        });
      }
    },
    [convHook.loadConversations],
  );

  const loadMessages = useCallback(
    async (p: Provider, chatId: string, since?: string) => {
      if (!since) setMessagesLoading(true);
      try {
        await convHook.loadMessages(p, chatId, since, privJwk, localOwnerId);
      } finally {
        if (!since) setMessagesLoading(false);
      }
    },
    [convHook.loadMessages, privJwk, localOwnerId],
  );

  useEffect(() => { void loadProviderStatuses(); }, [loadProviderStatuses, auth.token]);
  useEffect(() => { void connectionsHook.loadConnectionsList(); }, [auth.token]);

  // Load all providers on login so cross-provider unread dots are populated.
  useEffect(() => {
    if (!auth.token) return;
    for (const p of supportedProviders) {
      void loadConversations(p);
    }
  }, [auth.token]);

  // Auto-derive owner id and silently set up E2E keypair when signed in
  useEffect(() => {
    if (!auth.user?.email || !auth.token) return;
    const email = auth.user.email;
    setLocalOwnerId(email);
    if (!window.isSecureContext) {
      showToast("Encryption requires HTTPS — key setup skipped");
      return;
    }

    const password = auth.consumePassword();

    const tryLoadJwk = async (jwk: unknown, pub: string): Promise<boolean> => {
      let j = jwk as Record<string, unknown>;
      if (!Array.isArray(j.key_ops) || !(j.key_ops as string[]).includes("deriveBits")) {
        j = { ...j, key_ops: ["deriveKey", "deriveBits"] };
        jwk = j;
      }
      try {
        await crypto.subtle.importKey(
          "jwk", jwk as JsonWebKey,
          { name: "ECDH", namedCurve: "P-256" },
          false, ["deriveKey", "deriveBits"],
        );
        setPrivJwk(jwk as EcdhPrivateJwk);
        setPubKeyB64(pub);
        localStorage.setItem(`crypt:priv:${email}`, JSON.stringify(jwk));
        localStorage.setItem(`crypt:pub:${email}`, pub);
        await registerPublicKeyService(pub, auth.token, jwk, password);
        try {
          const { fingerprint: fp } = await resolveKeypairDisplay(email, pub);
          setFingerprint(fp);
        } catch { /* non-fatal */ }
        return true;
      } catch (err) {
        console.error("[App] key import/registration failed:", err);
        return false;
      }
    };

    const autoSetupKey = async () => {
      // Guard against Strict Mode double-invocation running concurrently
      if (keySetupInProgress.current) return;
      keySetupInProgress.current = true;
      try {
        // 1. Try localStorage first (fastest path, already on this device)
        const storedPriv = localStorage.getItem(`crypt:priv:${email}`);
        const storedPub = localStorage.getItem(`crypt:pub:${email}`);
        if (storedPriv && storedPub) {
          const rawJwk = (() => { try { return JSON.parse(storedPriv); } catch { /* ignore */ return null; } })();
          const jwkParsed = EcdhPrivateJwkSchema.safeParse(rawJwk);
          if (jwkParsed.success && await tryLoadJwk(jwkParsed.data, storedPub)) return;
          else if (!jwkParsed.success && rawJwk) console.error("[App] stored private key failed validation:", jwkParsed.error);
          localStorage.removeItem(`crypt:priv:${email}`);
          localStorage.removeItem(`crypt:pub:${email}`);
        }

        // Without a password we can't decrypt the server blob or properly encrypt a new key.
        // This only happens in the Strict Mode duplicate run — skip it.
        if (!password) return;

        // 2. Try fetching from server, decrypting with login password (new device / cleared storage)
        const serverJwk = await fetchAndDecryptPrivateKey(auth.token, password);
        if (serverJwk) {
          const serverPubResp = await apiFetch(`/keys/${encodeURIComponent(auth.user?.id ?? "")}`, {}, auth.token).catch(() => null);
          if (serverPubResp?.ok) {
            const kj = await serverPubResp.json().catch(() => null);
            const serverPub: string | null = kj?.data?.publicKey ?? null;
            if (serverPub && await tryLoadJwk(serverJwk, serverPub)) return;
          }
        }

        // 3. Generate fresh keypair and encrypt onto server
        const r = await generateKeypairService(email);
        setPrivJwk(r.privJwk);
        setPubKeyB64(r.pubB64);
        setFingerprint(r.fingerprint);
        await registerPublicKeyService(r.pubB64, auth.token, r.privJwk, password);
      } catch (err) {
        console.error("Auto key setup failed:", err);
      } finally {
        keySetupInProgress.current = false;
      }
    };

    void autoSetupKey();
  }, [auth.user?.email, auth.token]);

  useEffect(() => {
    void loadConversations(provider);
    convHook.setMessages([]);
    setReplyMode("secure");
  }, [provider]);

  useEffect(() => {
    void loadMessages(provider, selectedChatId);
  }, [provider, selectedChatId, loadMessages]);

  // Re-decrypt messages that arrived before the private key was ready
  useEffect(() => {
    if (!privJwk || !localOwnerId || convHook.messages.length === 0) return;
    const reDecrypt = async () => {
      const toDecrypt = convHook.messages.filter(
        (msg) => !msg.decryptedText && isSecureCiphertext(msg.encryptedText ?? ""),
      );
      if (toDecrypt.length === 0) return;
      const updated = await Promise.all(
        convHook.messages.map(async (msg) => {
          if (msg.decryptedText) return msg;
          const ct = msg.encryptedText ?? "";
          if (!isSecureCiphertext(ct)) return msg;
          try {
            const ownerId = msg.direction === "inbound" ? msg.from : msg.to;
            if (!ownerId) return msg;
            const kresp = await apiFetch(`/keys/${encodeURIComponent(ownerId)}`, {}, auth.token);
            if (!kresp.ok) return msg;
            const kj = await kresp.json();
            const theirPub = kj?.data?.publicKey;
            if (!theirPub) return msg;
            const plain = await decryptFromSender(ct, privJwk, theirPub);
            if (!plain) return msg;
            return { ...msg, decryptedText: plain };
          } catch { return msg; }
        }),
      );
      convHook.setMessages(updated);
    };
    void reDecrypt();
  }, [privJwk, auth.token]);

  const onNewMessage = useCallback(
    (message: ChatMessage) => {
      // Ignore broadcasts that belong to another account
      if (message.accountId && auth.user?.id && message.accountId !== auth.user.id) return;
      if (message.provider !== providerRef.current) {
        void loadConversations(message.provider as Provider);
        return;
      }
      void loadConversations(providerRef.current);
      if (message.chatId !== selectedChatIdRef.current) return;
      if (handleIncomingMessage) {
        void handleIncomingMessage(message, privJwk, localOwnerId);
      } else {
        convHook.setMessages((current) => [...current, message]);
      }
    },
    [handleIncomingMessage, privJwk, localOwnerId, loadConversations, convHook.setMessages, auth.user?.id],
  );

  const { isRealtime } = useRealtime(auth.user?.id ?? null, onNewMessage);

  // Catch-up refresh whenever Socket.IO (re)connects — covers messages that
  // arrived while the tab was backgrounded / the connection was dead.
  const prevIsRealtime = useRef(false);
  useEffect(() => {
    if (isRealtime && !prevIsRealtime.current) {
      void loadConversations(provider);
      if (selectedChatId) void loadMessages(provider, selectedChatId);
    }
    prevIsRealtime.current = isRealtime;
  }, [isRealtime, provider, selectedChatId, loadConversations, loadMessages]);

  // Keep a background poll even when Socket.IO is live so mobile users who
  // miss real-time events (backgrounded tab, dropped connection) still see
  // messages within 30 s. When not connected, poll every 10 s.
  useEffect(() => {
    const interval = isRealtime ? 30_000 : 10_000;
    const timer = window.setInterval(() => {
      for (const p of supportedProviders) {
        void loadConversations(p);
      }
      void loadMessages(providerRef.current, selectedChatIdRef.current, lastSyncRef.current || undefined);
    }, interval);
    return () => window.clearInterval(timer);
  }, [isRealtime, loadConversations, loadMessages]);

  const generateAndRegisterKeypair = async (password: string) => {
    if (!localOwnerId) { setKeyError("Enter your local ID first"); return; }
    if (!window.isSecureContext) {
      setKeyError("Key generation requires HTTPS — use the Cloudflare tunnel URL.");
      return;
    }
    setKeyError(null);
    setKeyBusy(true);
    try {
      const passwordOk = await verifyPasswordRequest(auth.token ?? "", password);
      if (!passwordOk) {
        setKeyError("Incorrect password.");
        return;
      }
      const r = await generateKeypairService(localOwnerId);
      setPubKeyB64(r.pubB64);
      setPrivJwk(r.privJwk);
      setFingerprint(r.fingerprint);
      await registerPublicKeyService(r.pubB64, auth.token, r.privJwk, password);
      await connectionsHook.loadConnectionsList();
    } catch (err) {
      setKeyError(`Key setup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setKeyBusy(false);
    }
  };

  const deleteConversation = useCallback(async () => {
    setDeleteBusy(true);
    try {
      const resp = await apiFetch(
        `/messages/conversation?provider=${encodeURIComponent(provider)}&chatId=${encodeURIComponent(selectedChatId)}`,
        { method: "DELETE" },
        auth.token,
      );
      if (!resp.ok) throw new Error("delete failed");
      setChatOpen(false);
      setSelectedChatId("");
      await convHook.loadConversations(provider);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteBusy(false);
    }
  }, [auth.token, provider, selectedChatId, convHook.loadConversations]);

  const handleSend = async () => {
    try {
      let localPriv = privJwk;
      if (replyMode === "secure" && !localPriv && localOwnerId) {
        const stored = localStorage.getItem(`crypt:priv:${localOwnerId}`);
        if (stored) {
          const rawStored = (() => { try { return JSON.parse(stored); } catch { /* ignore */ return null; } })();
          const storedParsed = EcdhPrivateJwkSchema.safeParse(rawStored);
          if (storedParsed.success) { localPriv = storedParsed.data; setPrivJwk(storedParsed.data); }
          else if (rawStored) console.error("[App] handleSend stored key failed validation:", storedParsed.error);
        }
      }

      await sendMessageHook({
        provider,
        selectedChatId,
        conversationTarget: selectedChatId,
        replyMode,
        text,
        file,
        privJwk: localPriv,
        localOwnerId: localOwnerId || null,
      });

      setText("");
      setFile(null);
    } catch (err) {
      showToast(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="app-shell">
      {onboardingOpen && <OnboardingModal onClose={() => setOnboardingOpen(false)} />}

      {toastMessage && (
        <div className="toast" role="status">
          <span className="toast-text">{toastMessage}</span>
          <button className="toast-close" type="button" onClick={() => setToastMessage(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {chatOpen ? (
        <ChatView
          provider={provider}
          selectedConversation={selectedConversation}
          selectedChatId={selectedChatId}
          messages={convHook.messages}
          messagesLoading={messagesLoading}
          isRealtime={isRealtime}
          privJwk={privJwk}
          localOwnerId={localOwnerId}
          text={text}
          setText={setText}
          file={file}
          setFile={setFile}
          filePreview={filePreview}
          replyMode={replyMode}
          setReplyMode={setReplyMode}
          sendBusy={sendBusy}
          selectedProviderStatus={selectedProviderStatus}
          onBack={() => setChatOpen(false)}
          deleteBusy={deleteBusy}
          onDelete={() => void deleteConversation()}
          onSend={() => void handleSend()}
        />
      ) : (
        <>
          <header className="app-header">
            {tab === "chats" && (
              <button
                type="button"
                className="btn-ghost nuke-trigger"
                onClick={() => { setNukeCount(10); setNukeOpen(true); }}
                aria-label="Nuke account"
                title="Nuke account"
              >
                ☢️
              </button>
            )}
            {tab === "settings" && (
              <button
                type="button"
                className="btn-ghost nuke-trigger"
                onClick={() => setOnboardingOpen(true)}
                aria-label="How to use Crypt"
              >
                ⁈
              </button>
            )}
            <h1>Crypt</h1>
            {tab === "chats" && (
              <div className="provider-pills">
                {supportedProviders.map((p) => {
                  const pillHasUnread = p !== provider && convHook.conversations.some(
                    (c) => c.provider === p && c.lastDirection === "inbound",
                  );
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`provider-pill${p === provider ? " active" : ""}`}
                      onClick={() => setProvider(p)}
                    >
                      {providerMeta[p].icon} {providerMeta[p].label}
                      {pillHasUnread && <span className="provider-pill-dot" />}
                    </button>
                  );
                })}
              </div>
            )}
            <span className={`header-status${isRealtime ? " live" : ""}`} />
          </header>

          <div className="screen">
            {tab === "chats" && (
              <ChatsPage
                conversations={convHook.conversations
                  .filter((c) => c.provider === provider)
                  .map((c) => {
                    const readAt = readTimestamps.current.get(c.chatId);
                    const isRead =
                      (chatOpen && c.chatId === selectedChatId) ||
                      (readTimestamps.current.has(c.chatId) && readAt === c.lastMessageAt);
                    return isRead ? { ...c, lastDirection: undefined } : c;
                  })}
                conversationsLoading={loadingProviders.has(provider)}
                hasConnections={connectionsHook.connections.some((c) => c.provider === provider)}
                connectionsLoading={connectionsHook.connectionsBusy}
                selectedChatId={selectedChatId}
                onOpenConversation={openConversation}
                onGoToSettings={() => setTab("settings")}
              />
            )}
            {tab === "find" && (
              <FindPage
                provider={provider}
                onStartConversation={(chatId, contactProvider) => openConversation(chatId, contactProvider)}
                token={auth.token}
              />
            )}
            {tab === "settings" && (
              <SettingsPage
                localOwnerId={localOwnerId}
                setLocalOwnerId={setLocalOwnerId}
                pubKeyB64={pubKeyB64}
                privJwk={privJwk}
                fingerprint={fingerprint}
                keyBusy={keyBusy}
                keyError={keyError}
                generateAndRegisterKeypair={generateAndRegisterKeypair}
                setPrivJwk={setPrivJwk}
                connections={connectionsHook.connections}
                connectionsBusy={connectionsHook.connectionsBusy}
                loadConnectionsList={connectionsHook.loadConnectionsList}
                deleteConnection={connectionsHook.deleteConnection}
                providerStatuses={providerStatuses}
                toastsEnabled={toastsEnabled}
                toggleToasts={toggleToasts}
                onConnectionsRefreshed={() => showToast("Telegram connected")}
              />
            )}
          </div>

          <nav className="bottom-nav" aria-label="Main navigation">
            <button type="button" className={`nav-tab${tab === "chats" ? " active" : ""}`} onClick={() => setTab("chats")}>
              <span className="nav-icon">💬</span>Chats
            </button>
            <button type="button" className={`nav-tab${tab === "find" ? " active" : ""}`} onClick={() => setTab("find")}>
              <span className="nav-icon">🔍</span>Find
            </button>
            <button type="button" className={`nav-tab${tab === "settings" ? " active" : ""}`} onClick={() => setTab("settings")}>
              <span className="nav-icon">⚙️</span>Settings
            </button>
          </nav>
        </>
      )}
      {nukeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nuke account confirmation"
          className="nuke-backdrop"
        >
          <div className="nuke-dialog">
            <div className="nuke-icon">☢️</div>
            <h2 className="nuke-title">Nuke Account</h2>
            <p className="nuke-description">
              All messages, connections, keys and your account will be permanently deleted.
            </p>
            <div className="nuke-countdown-label">
              Account will be nuked in
            </div>
            <div className="nuke-count">
              {nukeCount}
            </div>
            <div className="nuke-seconds">seconds</div>
            <div className="nuke-progress-track">
              <div className="nuke-progress-bar" style={{ width: `${(nukeCount / 10) * 100}%` }} />
            </div>
            <button
              type="button"
              onClick={cancelNuke}
              className="nuke-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ProtectedLayout>
      <AppContent />
    </ProtectedLayout>
  );
}
