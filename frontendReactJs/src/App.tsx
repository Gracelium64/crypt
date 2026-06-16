import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import { useAuth } from "@/context";
import { apiFetch } from "@/lib/api";
import { isSecureCiphertext, decryptFromSender } from "@/lib/crypto";
import { useConversations, useConnections, useProviders, useRealtime, useSend } from "@/hooks";
import { generateKeypair as generateKeypairService, registerPublicKey as registerPublicKeyService, fetchAndDecryptPrivateKey, resolveKeypairDisplay } from "@/services";
import { nukeAccountRequest } from "@/data";
import { ProtectedLayout } from "@/layouts";
import { ChatsPage, FindPage, SettingsPage, ChatView } from "@/pages";
import { OnboardingModal } from "@/components";
import type { Provider, ChatMessage } from "@/types";

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
  const [privJwk, setPrivJwk] = useState<unknown>(null);
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

  const convHook = useConversations(auth.token);
  const { handleIncomingMessage } = convHook;
  const { sendMessage: sendMessageHook, busy: sendBusy } = useSend(auth.token, convHook);
  const connectionsHook = useConnections(auth.token);
  const { providerStatuses, loadProviderStatuses } = useProviders();

  const providerRef = useRef(provider);
  const selectedChatIdRef = useRef(selectedChatId);

  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { selectedChatIdRef.current = selectedChatId; }, [selectedChatId]);

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
  }, []);

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
    async (p: Provider) => { await convHook.loadConversations(p); },
    [convHook.loadConversations],
  );

  const loadMessages = useCallback(
    async (p: Provider, chatId: string, since?: string) => {
      await convHook.loadMessages(p, chatId, since, privJwk, localOwnerId);
    },
    [convHook.loadMessages, privJwk, localOwnerId],
  );

  useEffect(() => { void loadProviderStatuses(); }, [loadProviderStatuses]);
  useEffect(() => { void connectionsHook.loadConnectionsList(); }, [auth.token]);

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
        setPrivJwk(jwk);
        setPubKeyB64(pub);
        localStorage.setItem(`crypt:priv:${email}`, JSON.stringify(jwk));
        localStorage.setItem(`crypt:pub:${email}`, pub);
        await registerPublicKeyService(pub, auth.token, jwk, password);
        try {
          const { fingerprint: fp } = await resolveKeypairDisplay(email, pub);
          setFingerprint(fp);
        } catch { /* non-fatal */ }
        return true;
      } catch {
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
          let jwk: unknown;
          try { jwk = JSON.parse(storedPriv); } catch { jwk = null; }
          if (jwk && await tryLoadJwk(jwk, storedPub)) return;
          localStorage.removeItem(`crypt:priv:${email}`);
          localStorage.removeItem(`crypt:pub:${email}`);
        }

        // Without a password we can't decrypt the server blob or properly encrypt a new key.
        // This only happens in the Strict Mode duplicate run — skip it.
        if (!password) return;

        // 2. Try fetching from server, decrypting with login password (new device / cleared storage)
        const serverJwk = await fetchAndDecryptPrivateKey(auth.token, password);
        if (serverJwk) {
          const serverPubResp = await apiFetch(`/keys/${encodeURIComponent(email)}`).catch(() => null);
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
  }, [provider, selectedChatId]);

  // Re-decrypt messages when private key becomes available
  useEffect(() => {
    if (!privJwk || !localOwnerId || convHook.messages.length === 0) return;
    const reDecrypt = async () => {
      const updated = await Promise.all(
        convHook.messages.map(async (msg) => {
          if (msg.decryptedText) return msg;
          const ct = msg.encryptedText ?? "";
          if (!isSecureCiphertext(ct)) return msg;
          try {
            const ownerId = msg.direction === "inbound" ? msg.from : msg.to;
            if (!ownerId) return msg;
            const kresp = await apiFetch(`/keys/${encodeURIComponent(ownerId)}`);
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
  }, [privJwk]);

  const onNewMessage = useCallback(
    (message: ChatMessage) => {
      if (message.provider !== providerRef.current) return;
      // Ignore broadcasts that belong to another account
      if (message.accountId && auth.user?.id && message.accountId !== auth.user.id) return;
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

  const { isRealtime } = useRealtime(onNewMessage);

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
      void loadConversations(provider);
      void loadMessages(provider, selectedChatId, convHook.lastSync || undefined);
    }, interval);
    return () => window.clearInterval(timer);
  }, [isRealtime, convHook.lastSync, provider, selectedChatId, loadConversations, loadMessages]);

  const generateAndRegisterKeypair = async () => {
    if (!localOwnerId) { setKeyError("Enter your local ID first"); return; }
    if (!window.isSecureContext) {
      setKeyError("Key generation requires HTTPS — use the Cloudflare tunnel URL.");
      return;
    }
    setKeyError(null);
    setKeyBusy(true);
    try {
      const r = await generateKeypairService(localOwnerId);
      setPubKeyB64(r.pubB64);
      setPrivJwk(r.privJwk);
      setFingerprint(r.fingerprint);
      await registerPublicKeyService(r.pubB64, auth.token);
      await connectionsHook.loadConnectionsList();
    } catch (err) {
      setKeyError(`Key setup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setKeyBusy(false);
    }
  };

  const deleteConversation = useCallback(async () => {
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
    }
  }, [auth.token, provider, selectedChatId, convHook.loadConversations]);

  const handleSend = async () => {
    try {
      let localPriv = privJwk;
      if (replyMode === "secure" && !localPriv && localOwnerId) {
        const stored = localStorage.getItem(`crypt:priv:${localOwnerId}`);
        if (stored) {
          try { localPriv = JSON.parse(stored); setPrivJwk(localPriv); } catch { /* ignore */ }
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
          <span style={{ flex: 1 }}>{toastMessage}</span>
          <button className="toast-close" type="button" onClick={() => setToastMessage(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {chatOpen ? (
        <ChatView
          provider={provider}
          selectedConversation={selectedConversation}
          selectedChatId={selectedChatId}
          messages={convHook.messages}
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
          onDelete={() => void deleteConversation()}
          onSend={() => void handleSend()}
        />
      ) : (
        <>
          <header className="app-header">
            {tab === "chats" && (
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 18, padding: "2px 6px", lineHeight: 1 }}
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
                className="btn-ghost"
                style={{ fontSize: 18, padding: "2px 6px", lineHeight: 1 }}
                onClick={() => setOnboardingOpen(true)}
                aria-label="How to use Crypt"
              >
                ⁈
              </button>
            )}
            <h1>Crypt</h1>
            {tab === "chats" && (
              <div className="provider-pills">
                {supportedProviders.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`provider-pill${p === provider ? " active" : ""}`}
                    onClick={() => setProvider(p)}
                  >
                    {providerMeta[p].icon} {providerMeta[p].label}
                  </button>
                ))}
              </div>
            )}
            <span className={`header-status${isRealtime ? " live" : ""}`} />
          </header>

          <div className="screen">
            {tab === "chats" && (
              <ChatsPage
                conversations={convHook.conversations}
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
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.82)",
            zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            background: "var(--surface, #1a1a1a)",
            border: "2px solid #e53e3e",
            borderRadius: 14,
            padding: "32px 28px",
            maxWidth: 320,
            width: "90%",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 52, lineHeight: 1 }}>☢️</div>
            <h2 style={{ color: "#e53e3e", margin: "14px 0 8px", fontSize: 20 }}>Nuke Account</h2>
            <p style={{ color: "var(--fg-muted, #888)", fontSize: 13, margin: "0 0 20px" }}>
              All messages, connections, keys and your account will be permanently deleted.
            </p>
            <div style={{ fontSize: 13, color: "var(--fg-muted, #aaa)", marginBottom: 4 }}>
              Account will be nuked in
            </div>
            <div style={{ fontSize: 72, fontWeight: 700, color: "#e53e3e", lineHeight: 1, margin: "4px 0" }}>
              {nukeCount}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted, #888)", marginBottom: 20 }}>seconds</div>
            <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 4, marginBottom: 24, overflow: "hidden" }}>
              <div style={{
                background: "#e53e3e",
                height: 4,
                width: `${(nukeCount / 10) * 100}%`,
                transition: "width 0.95s linear",
                borderRadius: 4,
              }} />
            </div>
            <button
              type="button"
              onClick={cancelNuke}
              style={{
                width: "100%", padding: "12px",
                background: "transparent",
                border: "1px solid var(--fg-muted, #666)",
                borderRadius: 8,
                color: "var(--fg, #eee)",
                fontSize: 15, cursor: "pointer",
              }}
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
