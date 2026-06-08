import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import { useAuth } from "./context/useAuth";
import KeyManager from "./components/KeyManager";
import ConnectionsPanel from "./components/ConnectionsPanel";
import Timeline from "./components/Timeline";
import { apiFetch } from "./lib/api";
import { deriveAesGcmKey } from "./lib/crypto";
import useProviders from "./hooks/useProviders";
import useConversations from "./hooks/useConversations";
import useConnections from "./hooks/useConnections";
import useRealtime from "./hooks/useRealtime";
import useSend from "./hooks/useSend";
import FindContact from "./components/FindContact";
import ConnectTelegram from "./components/ConnectTelegram";
import type { Provider, ChatMessage } from "./types";
import {
  generateKeypair as generateKeypairService,
  registerPublicKey as registerPublicKeyService,
} from "./services/keys";

// Types are imported from ./types

const trimPreview = (text: string) => {
  if (text.length <= 96) {
    return text;
  }

  return `${text.slice(0, 93)}...`;
};

const providerMeta: Record<
  Provider,
  { label: string; icon: string; accent: string }
> = {
  telegram: { label: "Telegram", icon: "✈️", accent: "#2CA5E0" },
  whatsapp: { label: "WhatsApp", icon: "💬", accent: "#25D366" },
};

const supportedProviders: Provider[] = ["telegram", "whatsapp"];

// upload helper types moved to `src/services/messages.ts`

// uploadSelectedImage moved to `src/services/messages.ts` and used by sendMessageService

// (moved to src/lib/crypto.ts)

const getProviderLabel = (provider: Provider) => providerMeta[provider].label;

function App() {
  const [provider, setProvider] = useState<Provider>("telegram");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<"secure" | "plain">("secure");
  // realtime connectivity handled by useRealtime hook
  const [localOwnerId, setLocalOwnerId] = useState("");
  const [pubKeyB64, setPubKeyB64] = useState<string | null>(null);
  const [privJwk, setPrivJwk] = useState<any | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const auth = useAuth();
  // hooks/services
  const convHook = useConversations(auth.token);
  const { handleIncomingMessage } = convHook;
  const { sendMessage: sendMessageHook, busy: sendBusy } = useSend(
    auth.token,
    convHook,
  );
  const connectionsHook = useConnections(auth.token);
  const { providerStatuses, loadProviderStatuses } = useProviders();
  const [tab, setTab] = useState<"chats" | "find" | "settings">("chats");
  const [chatOpen, setChatOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastsEnabled, setToastsEnabled] = useState(
    () => localStorage.getItem("crypt:toasts") !== "off",
  );

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const showToast = (msg: string) => {
    if (toastsEnabled) setToastMessage(msg);
  };

  const toggleToasts = () => {
    const next = !toastsEnabled;
    setToastsEnabled(next);
    localStorage.setItem("crypt:toasts", next ? "on" : "off");
  };

  const openConversation = (chatId: string, prov?: Provider) => {
    if (prov) setProvider(prov);
    setSelectedChatId(chatId);
    setChatOpen(true);
  };

  const generateKeypair = async () => {
    if (!localOwnerId) return alert("Enter local ID first");
    if (!window.isSecureContext) {
      alert(
        "Key generation requires HTTPS.\n\nPlease access the app via the Cloudflare tunnel URL (https://...) instead of the local network address.",
      );
      return;
    }
    setKeyBusy(true);
    try {
      const r = await generateKeypairService(localOwnerId);
      setPubKeyB64(r.pubB64);
      setPrivJwk(r.privJwk);
      setFingerprint(r.fingerprint);
      setQrDataUrl(r.qrDataUrl);
    } catch (_err) {
      console.error(_err);
      alert(`Key generation failed: ${_err instanceof Error ? _err.message : String(_err)}`);
    } finally {
      setKeyBusy(false);
    }
  };

  const deleteConversation = useCallback(
    async (convProvider: Provider, convChatId: string) => {
      if (!confirm("Delete all messages in this conversation?")) return;
      try {
        const resp = await apiFetch(
          `/messages/conversation?provider=${encodeURIComponent(convProvider)}&chatId=${encodeURIComponent(convChatId)}`,
          { method: "DELETE" },
          auth.token,
        );
        if (!resp.ok) throw new Error("delete failed");
        setChatOpen(false);
        setSelectedChatId("");
        await convHook.loadConversations(convProvider);
      } catch (_err) {
        console.error(_err);
      }
    },
    [auth.token, convHook.loadConversations],
  );

  const registerPublicKey = async () => {
    if (!pubKeyB64) return alert("Generate a key first");
    try {
      if (!auth.user?.email && !localOwnerId)
        return alert("No owner ID available (log in or enter a local ID)");
      await registerPublicKeyService(pubKeyB64, auth.token);
      await connectionsHook.loadConnectionsList();
    } catch (_err) {
      console.error(_err);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const providerRef = useRef(provider);
  const selectedChatIdRef = useRef(selectedChatId);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const selectedConversation =
    convHook.conversations.find(
      (conversation) => conversation.chatId === selectedChatId,
    ) ?? null;

  const selectedProviderStatus =
    providerStatuses.find((item) => item.provider === provider) ?? null;

  // provider statuses handled by useProviders hook

  const loadConversations = useCallback(
    async (currentProvider: Provider) => {
      await convHook.loadConversations(currentProvider);
    },
    [convHook.loadConversations],
  );

  useEffect(() => {
    setSelectedChatId((currentChatId) => {
      if (
        currentChatId &&
        convHook.conversations.some((item) => item.chatId === currentChatId)
      ) {
        return currentChatId;
      }
      return convHook.conversations[0]?.chatId ?? "";
    });
  }, [convHook.conversations]);

  const loadMessages = useCallback(
    async (
      currentProvider: Provider,
      currentChatId: string,
      since?: string,
    ) => {
      await convHook.loadMessages(
        currentProvider,
        currentChatId,
        since,
        privJwk,
        localOwnerId,
      );
    },
    [convHook.loadMessages, privJwk, localOwnerId],
  );

  useEffect(() => {
    void loadProviderStatuses();
  }, [loadProviderStatuses]);

  // Auth context manages the current account

  // Load provider connections for the signed-in account (useConnections hook)
  useEffect(() => {
    void connectionsHook.loadConnectionsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  // Auto-derive local owner id and auto-setup E2E keypair when signed in
  useEffect(() => {
    if (!auth.user?.email || !auth.token) return;
    const email = auth.user.email;
    setLocalOwnerId(email);

    if (!window.isSecureContext) return;

    const autoSetupKey = async () => {
      const { generateKeypair, registerPublicKey } = await import("./services/keys");

      const storedPriv = localStorage.getItem(`crypt:priv:${email}`);
      const storedPub = localStorage.getItem(`crypt:pub:${email}`);

      if (storedPriv && storedPub) {
        let jwk: any;
        try { jwk = JSON.parse(storedPriv); } catch { jwk = null; }

        if (jwk) {
          // Patch key_ops in-place if needed — avoids regenerating and breaking old messages
          if (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes("deriveBits")) {
            jwk = { ...jwk, key_ops: ["deriveKey", "deriveBits"] };
            localStorage.setItem(`crypt:priv:${email}`, JSON.stringify(jwk));
          }

          try {
            await crypto.subtle.importKey(
              "jwk", jwk,
              { name: "ECDH", namedCurve: "P-256" },
              false,
              ["deriveKey", "deriveBits"],
            );
            setPrivJwk(jwk);
            setPubKeyB64(storedPub);
            await registerPublicKey(storedPub, auth.token);
            return;
          } catch {
            // Truly corrupted — fall through to regenerate
            localStorage.removeItem(`crypt:priv:${email}`);
            localStorage.removeItem(`crypt:pub:${email}`);
          }
        }
      }

      // No key yet — generate silently and register
      try {
        const r = await generateKeypair(email);
        setPrivJwk(r.privJwk);
        setPubKeyB64(r.pubB64);
        setFingerprint(r.fingerprint);
        setQrDataUrl(r.qrDataUrl);
        localStorage.setItem(`crypt:pub:${email}`, r.pubB64);
        await registerPublicKey(r.pubB64, auth.token);
      } catch (err) {
        console.error("Auto key setup failed:", err);
      }
    };

    void autoSetupKey();
  }, [auth.user?.email, auth.token]);



  useEffect(() => {
    void loadConversations(provider);
    convHook.setMessages([]);
    setReplyMode("secure");
  }, [provider, loadConversations, convHook.setMessages]);

  useEffect(() => {
    void loadMessages(provider, selectedChatId);
  }, [provider, selectedChatId, loadMessages]);

  // Re-decrypt already-loaded messages when the private key becomes available
  // (handles the race where messages loaded before autoSetupKey completed)
  useEffect(() => {
    if (!privJwk || !localOwnerId || convHook.messages.length === 0) return;
    const reDecrypt = async () => {
      const { isSecureCiphertext, decryptFromSender } = await import("./lib/crypto");
      const updated = await Promise.all(
        convHook.messages.map(async (msg) => {
          if (msg.decryptedText) return msg; // already decrypted
          const ct = msg.encryptedText ?? "";
          if (!isSecureCiphertext(ct)) return msg;
          try {
            const ownerId = msg.direction === "inbound" ? msg.from : msg.to;
            if (!ownerId) return msg;
            const kresp = await fetch(`/api/keys/${encodeURIComponent(ownerId)}`);
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

      void loadConversations(providerRef.current);

      if (message.chatId !== selectedChatIdRef.current) return;

      if (handleIncomingMessage) {
        void handleIncomingMessage(message, privJwk, localOwnerId);
      } else {
        convHook.setMessages((current) => [...current, message]);
      }
    },
    [handleIncomingMessage, privJwk, localOwnerId, loadConversations, convHook.setMessages],
  );

  const { isRealtime } = useRealtime(onNewMessage);

  useEffect(() => {
    if (isRealtime) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadConversations(provider);
      void loadMessages(provider, selectedChatId, convHook.lastSync || undefined);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [
    isRealtime,
    convHook.lastSync,
    provider,
    selectedChatId,
    loadConversations,
    loadMessages,
  ]);

  const handleSend = async () => {
    if (!selectedChatId) {
      alert("Pick a chat from the provider inbox first.");
      return;
    }

    if (!selectedProviderStatus?.backendReady) {
      alert(
        "Provider backend not configured. Ask the operator to set provider credentials in the backend before sending.",
      );
      return;
    }

    try {
      const conversationTarget = selectedChatId;

      let localPriv = privJwk;
      if (replyMode === "secure" && !localPriv && localOwnerId) {
        const stored = localStorage.getItem(`crypt:priv:${localOwnerId}`);
        if (stored) {
          try {
            localPriv = JSON.parse(stored);
            setPrivJwk(localPriv);
          } catch {
            // ignore parse errors
          }
        }
      }

      await sendMessageHook({
        provider,
        selectedChatId,
        conversationTarget,
        replyMode,
        text,
        file,
        privJwk: localPriv,
        localOwnerId: localOwnerId || null,
      });

      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

    } catch (_err) {
      console.error(_err);
      showToast(`Send failed: ${_err instanceof Error ? _err.message : String(_err)}`);
    }
  };

  return (
    <div className="app-shell">
      {toastMessage && (
        <div className="toast" role="status">
          <span style={{ flex: 1 }}>{toastMessage}</span>
          <button className="toast-close" type="button" onClick={() => setToastMessage(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {chatOpen ? (
        /* ── Chat view ── */
        <>
          <header className="app-header">
            <button className="header-back" type="button" onClick={() => setChatOpen(false)} aria-label="Back">‹</button>
            <div className="header-title">
              <strong>{selectedConversation?.counterpartName || selectedConversation?.counterpart || selectedChatId}</strong>
              <span>{getProviderLabel(provider)}</span>
            </div>
            <span className={`header-status${isRealtime ? " live" : ""}`} title={isRealtime ? "Live" : "Polling"} />
            <button
              className="header-action btn-danger"
              type="button"
              title="Delete conversation"
              onClick={() => void deleteConversation(provider, selectedChatId)}
              style={{ fontSize: 16 }}
            >
              🗑
            </button>
          </header>

          <div className="chat-screen">
            <div className="timeline">
              <Timeline
                messages={convHook.messages}
                privJwk={privJwk}
                localOwnerId={localOwnerId}
                deriveAesGcmKey={deriveAesGcmKey}
              />
            </div>

            <div className="composer">
              <div className="composer-toolbar">
                <div className="composer-mode">
                  <button
                    type="button"
                    className={`mode-btn${replyMode === "secure" ? " active" : ""}`}
                    onClick={() => setReplyMode("secure")}
                  >
                    Secure
                  </button>
                  <button
                    type="button"
                    className={`mode-btn${replyMode === "plain" ? " active" : ""}`}
                    onClick={() => setReplyMode("plain")}
                  >
                    Plain
                  </button>
                </div>
              </div>

              {file && (
                <div className="file-preview">
                  {filePreview && <img src={filePreview} alt="" />}
                  <span>{file.name} ({Math.round(file.size / 1024)} KB)</span>
                  <button className="btn-danger btn-sm" type="button" onClick={removeFile}>✕</button>
                </div>
              )}

              <div className="composer-row">
                <label className="composer-attach" style={{ cursor: "pointer" }} title="Attach image">
                  📎
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    disabled={!selectedChatId}
                  />
                </label>
                <textarea
                  className="composer-input"
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={selectedChatId ? "Type a message…" : "Pick a chat first"}
                  disabled={!selectedChatId}
                />
                <button
                  className="composer-send"
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={
                    sendBusy ||
                    !selectedChatId ||
                    (!text && !file) ||
                    !selectedProviderStatus?.backendReady
                  }
                  aria-label="Send"
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── Main app with tabs ── */
        <>
          <header className="app-header">
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

          {/* Chats tab */}
          {tab === "chats" && (
            <div className="screen">
              {convHook.conversations.length === 0 ? (
                <div className="empty-screen">
                  <div className="empty-icon">💬</div>
                  <h3>No chats yet</h3>
                  <p>Link your Telegram or WhatsApp account in Settings to see conversations here.</p>
                  <button type="button" onClick={() => setTab("settings")}>Go to Settings</button>
                </div>
              ) : (
                <div className="conv-list">
                  {convHook.conversations.map((conv) => (
                    <button
                      key={`${conv.provider}:${conv.chatId}`}
                      type="button"
                      className={`conv-item${conv.chatId === selectedChatId ? " active" : ""}`}
                      onClick={() => openConversation(conv.chatId, conv.provider)}
                    >
                      <div className="conv-avatar">
                        {(conv.counterpartName || conv.counterpart || conv.chatId || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="conv-body">
                        <div className="conv-top">
                          <span className="conv-name">{conv.counterpartName || conv.counterpart || conv.chatId}</span>
                          {conv.lastMessageAt && (
                            <span className="conv-time">
                              {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span className="conv-preview">{trimPreview(conv.lastMessagePreview ?? "")}</span>
                          <span className={`conv-badge ${conv.securityState}`}>{conv.securityState}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Find tab */}
          {tab === "find" && (
            <div className="screen">
              <FindContact
                provider={provider}
                onStartConversation={(chatId, contactProvider) => {
                  openConversation(chatId, contactProvider);
                }}
              />
            </div>
          )}

          {/* Settings tab */}
          {tab === "settings" && (
            <div className="screen settings-screen">
              {/* Account */}
              <div className="settings-section">
                <div className="settings-section-title">Account</div>
                {auth.user ? (
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <strong>{auth.user.displayName || auth.user.email}</strong>
                      <span>{auth.user.email}</span>
                    </div>
                    <button className="btn-ghost btn-sm" type="button" onClick={() => void auth.logout()}>
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="auth-form">
                    <div style={{ padding: "12px 0 4px" }}>
                      <label>Email</label>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <label>Password</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div>
                      <label>Display name</label>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <div className="auth-actions">
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={async () => {
                          setAuthBusy(true);
                          try { await auth.register({ email, password, displayName }); }
                          catch { alert("Signup failed"); }
                          finally { setAuthBusy(false); }
                        }}
                      >
                        Sign up
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={authBusy}
                        onClick={async () => {
                          setAuthBusy(true);
                          try { await auth.login({ email, password }); }
                          catch { alert("Login failed"); }
                          finally { setAuthBusy(false); }
                        }}
                      >
                        Sign in
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Security & Keys */}
              {auth.user && (
                <div className="settings-section">
                  <div className="settings-section-title">Security & Keys</div>
                  <div style={{ padding: "0 16px 12px" }}>
                    <KeyManager
                      localOwnerId={localOwnerId}
                      setLocalOwnerId={setLocalOwnerId}
                      pubKeyB64={pubKeyB64}
                      privJwk={privJwk}
                      fingerprint={fingerprint}
                      qrDataUrl={qrDataUrl}
                      keyBusy={keyBusy}
                      generateKeypair={generateKeypair}
                      registerPublicKey={registerPublicKey}
                      setPrivJwk={setPrivJwk}
                      authUserEmail={auth.user?.email}
                    />
                  </div>
                </div>
              )}

              {/* Connect Telegram */}
              {auth.user && (
                <div className="settings-section">
                  <div className="settings-section-title">Connect Telegram</div>
                  <div style={{ padding: "4px 16px 12px" }}>
                    <ConnectTelegram
                      token={auth.token}
                      onConnected={() => {
                        void connectionsHook.loadConnectionsList();
                        showToast("Telegram connected");
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Connections */}
              {auth.user && (
                <div className="settings-section">
                  <div className="settings-section-title">Connections</div>
                  <ConnectionsPanel
                    connections={connectionsHook.connections}
                    connectionsBusy={connectionsHook.connectionsBusy}
                    loadConnectionsList={connectionsHook.loadConnectionsList}
                    deleteConnection={connectionsHook.deleteConnection}
                  />
                </div>
              )}

              {/* Notifications */}
              <div className="settings-section">
                <div className="settings-section-title">Notifications</div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Toast messages</strong>
                    <span>Brief pop-up notifications</span>
                  </div>
                  <button
                    type="button"
                    className={toastsEnabled ? "btn-ghost btn-sm" : "btn-sm"}
                    style={toastsEnabled ? { color: "var(--green)" } : {}}
                    onClick={toggleToasts}
                  >
                    {toastsEnabled ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* Provider Status */}
              <div className="settings-section">
                <div className="settings-section-title">Provider Status</div>
                {supportedProviders.map((p) => {
                  const st = providerStatuses.find((s) => s.provider === p);
                  const ready = st?.readiness === "ready";
                  return (
                    <div key={p} className="settings-row">
                      <div className="settings-row-label">
                        <strong>{providerMeta[p].icon} {providerMeta[p].label}</strong>
                        <span>{ready ? "Backend ready" : "Needs setup — add credentials"}</span>
                      </div>
                      <span className={`chip ${ready ? "green" : "warn"}`}>{ready ? "✓" : "!"}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ height: 24 }} />
            </div>
          )}

          {/* Bottom navigation */}
          <nav className="bottom-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`nav-tab${tab === "chats" ? " active" : ""}`}
              onClick={() => setTab("chats")}
            >
              <span className="nav-icon">💬</span>
              Chats
            </button>
            <button
              type="button"
              className={`nav-tab${tab === "find" ? " active" : ""}`}
              onClick={() => setTab("find")}
            >
              <span className="nav-icon">🔍</span>
              Find
            </button>
            <button
              type="button"
              className={`nav-tab${tab === "settings" ? " active" : ""}`}
              onClick={() => setTab("settings")}
            >
              <span className="nav-icon">⚙️</span>
              Settings
            </button>
          </nav>
        </>
      )}

    </div>
  );
}

export default App;
