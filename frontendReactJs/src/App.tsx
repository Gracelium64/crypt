import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import "./App.css";
import { useAuth } from "./context/useAuth";
import KeyManager from "./components/KeyManager";
import OnboardingPanel from "./components/OnboardingPanel";
import LinkWizard from "./components/LinkWizard";
import ConnectionsPanel from "./components/ConnectionsPanel";
import Composer from "./components/Composer";
import Timeline from "./components/Timeline";
import { apiFetch } from "./lib/api";
import { deriveAesGcmKey } from "./lib/crypto";
import useProviders from "./hooks/useProviders";
import useConversations from "./hooks/useConversations";
import useConnections from "./hooks/useConnections";
import useLink from "./hooks/useLink";
import useRealtime from "./hooks/useRealtime";
import useSend from "./hooks/useSend";
import SelectedConversationPanel from "./components/SelectedConversationPanel";
import type { Provider, ChatMessage, ConversationSummary } from "./types";
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

const toHumanTime = (iso?: string | null) => {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
};

// upload helper types moved to `src/services/messages.ts`

// uploadSelectedImage moved to `src/services/messages.ts` and used by sendMessageService

// (moved to src/lib/crypto.ts)

const getProviderLabel = (provider: Provider) => providerMeta[provider].label;

function App() {
  const [provider, setProvider] = useState<Provider>("telegram");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<"secure" | "plain">("secure");
  // realtime connectivity handled by useRealtime hook
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const [lastSync, setLastSync] = useState<string>("");
  const [localOwnerId, setLocalOwnerId] = useState("");
  const [localOwnerId, setLocalOwnerId] = useState("");
  const [pubKeyB64, setPubKeyB64] = useState<string | null>(null);
  const [privJwk, setPrivJwk] = useState<any | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  // link state managed by useLink hook (hookLinkCode, hookLinkProvider, ...)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const auth = useAuth();
  // hooks/services
  const convHook = useConversations();
  const { sendMessage: sendMessageHook, busy: sendBusy } = useSend(
    auth.token,
    convHook,
  );
  const connectionsHook = useConnections(auth.token);
  const { providerStatuses, loadProviderStatuses } = useProviders();
  const {
    linkCode: hookLinkCode,
    linkProvider: hookLinkProvider,
    linkExpiresAt: hookLinkExpiresAt,
    linkStatus: hookLinkStatus,
    linkDeepMobile: hookLinkDeepMobile,
    linkDeepWeb: hookLinkDeepWeb,
    linkBusy: hookLinkBusy,
    startLink: startLinkFn,
    cancelLink: cancelLinkFn,
  } = useLink(auth.token, async (data) => {
    try {
      await connectionsHook.loadConnectionsList();
      if (data.provider) {
        setProvider(data.provider as Provider);
        if (data.providerChatId) {
          setSelectedChatId(data.providerChatId);
          await convHook.loadConversations(data.provider);
          await convHook.loadMessages(
            data.provider,
            data.providerChatId,
            undefined,
            privJwk,
            localOwnerId,
          );
        }
      }
    } catch (e) {
      // ignore
    }
    showToast(
      `Linked ${data.provider} — you can now send secure messages to this chat.`,
    );
  });
  const [verifyOpen, setVerifyOpen] = useState(false);
  // verification UI moved into SelectedConversationPanel

  const [editingConnId, setEditingConnId] = useState<string | null>(null);
  const [editingTokenValue, setEditingTokenValue] = useState("");
  const [editingPhoneNumberId, setEditingPhoneNumberId] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string, ms = 4000) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), ms);
  };

  // onboarding checks
  const [keyRegistered, setKeyRegistered] = useState<boolean>(false);
  const checkKeyRegistered = async () => {
    if (!localOwnerId || !pubKeyB64) return setKeyRegistered(false);
    try {
      const resp = await apiFetch(`/keys/${encodeURIComponent(localOwnerId)}`);
      if (!resp.ok) return setKeyRegistered(false);
      const j = await resp.json();
      const remote = j?.data?.publicKey ?? null;
      setKeyRegistered(remote === pubKeyB64);
    } catch (err) {
      setKeyRegistered(false);
    }
  };

  const generateKeypair = async () => {
    if (!localOwnerId) return alert("Enter local ID first");
    setKeyBusy(true);
    try {
      const r = await generateKeypairService(localOwnerId);
      setPubKeyB64(r.pubB64);
      setPrivJwk(r.privJwk);
      setFingerprint(r.fingerprint);
      setQrDataUrl(r.qrDataUrl);
      showToast("Keypair generated locally");
    } catch (err) {
      console.error(err);
      alert("Key generation failed");
    } finally {
      setKeyBusy(false);
    }
  };

  const registerPublicKey = async () => {
    if (!pubKeyB64) return alert("Generate a key first");
    try {
      if (!auth.user?.email && !localOwnerId)
        return alert("No owner ID available (log in or enter a local ID)");
      await registerPublicKeyService(pubKeyB64, auth.token);
      showToast("Public key registered");
      await connectionsHook.loadConnectionsList();
      await checkKeyRegistered();
    } catch (err) {
      console.error(err);
      showToast("Failed to register key");
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
    conversations.find(
      (conversation) => conversation.chatId === selectedChatId,
    ) ?? null;

  const selectedProviderStatus =
    providerStatuses.find((item) => item.provider === provider) ?? null;

  // provider statuses handled by useProviders hook

  const loadConversations = async (currentProvider: Provider) => {
    await convHook.loadConversations(currentProvider);
    setConversations(convHook.conversations);
    setSelectedChatId((currentChatId) => {
      if (
        currentChatId &&
        convHook.conversations.some((item) => item.chatId === currentChatId)
      ) {
        return currentChatId;
      }

      return convHook.conversations[0]?.chatId ?? "";
    });
  };

  const loadMessages = async (
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
    setMessages(convHook.messages);
    setLastSync(convHook.lastSync);
  };

  useEffect(() => {
    void loadProviderStatuses();
  }, [loadProviderStatuses]);

  // Auth context manages the current account

  // Load provider connections for the signed-in account (useConnections hook)
  useEffect(() => {
    void connectionsHook.loadConnectionsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  // Auto-derive local owner id from signed-in account
  useEffect(() => {
    if (auth.user?.email) setLocalOwnerId(auth.user.email);
  }, [auth.user]);

  useEffect(() => {
    void checkKeyRegistered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOwnerId, pubKeyB64]);

  const submitConnectionToken = async (connId: string) => {
    if (!editingTokenValue) return alert("Enter the provider token");
    try {
      await connectionsHook.submitConnectionToken(
        connId,
        editingTokenValue,
        editingPhoneNumberId || undefined,
      );
      alert("Stored token for connection");
      setEditingConnId(null);
      setEditingTokenValue("");
      setEditingPhoneNumberId("");
    } catch (err) {
      console.error(err);
      alert("Failed to store token for connection");
    }
  };

  // Link polling and init handled by `useLink` hook (startLinkFn / cancelLinkFn)

  useEffect(() => {
    void loadConversations(provider);
    setMessages([]);
    setLastSync("");
    setReplyMode("secure");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    void loadMessages(provider, selectedChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, selectedChatId]);

  const onNewMessage = useCallback(
    (message: ChatMessage) => {
      if (message.provider !== providerRef.current) return;

      void loadConversations(providerRef.current);

      if (message.chatId !== selectedChatIdRef.current) return;

      if (convHook?.handleIncomingMessage) {
        void convHook.handleIncomingMessage(message, privJwk, localOwnerId);
      } else {
        // fallback: append raw message
        setMessages((current) => [...current, message]);
        setLastSync(message.createdAt);
      }
    },
    [convHook, privJwk, localOwnerId],
  );

  const { isRealtime } = useRealtime(onNewMessage, [onNewMessage]);

  useEffect(() => {
    if (isRealtime) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadConversations(provider);
      void loadMessages(provider, selectedChatId, lastSync || undefined);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [isRealtime, lastSync, provider, selectedChatId]);

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
      const conversationTarget =
        selectedConversation?.counterpart || selectedChatId || "unknown";

      // Ensure we surface a loaded private key in UI when possible
      let localPriv = privJwk;
      if (replyMode === "secure" && !localPriv && localOwnerId) {
        const stored = localStorage.getItem(`crypt:priv:${localOwnerId}`);
        if (stored) {
          try {
            localPriv = JSON.parse(stored);
            setPrivJwk(localPriv);
          } catch (e) {
            // ignore parse errors
          }
        }
      }

      const ok = await sendMessageHook({
        provider,
        selectedChatId,
        conversationTarget,
        replyMode,
        text,
        file,
        imageUrl,
        privJwk: localPriv,
        localOwnerId: localOwnerId || null,
      });

      if (!ok) throw new Error("send failed");

      setText("");
      setImageUrl("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Sync App state with convHook results
      setConversations(convHook.conversations);
      setMessages(convHook.messages);
      setLastSync(convHook.lastSync);
    } catch (err) {
      console.error(err);
      showToast("Failed to send message");
    }
  };

  return (
    <div className="app-shell">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            background: "#333",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 9999,
          }}
        >
          {toastMessage}
        </div>
      )}
      <aside className="provider-sidebar">
        <div className="brand-block panel elevated">
          <span className="eyebrow">Crypt Companion</span>
          <h1>Provider-first demo workspace</h1>
          <p>
            Open Telegram Web or WhatsApp Web, then use the inbox here to review
            secure and plain threads.
          </p>
        </div>

        <div className="panel account-panel">
          <h3>Account</h3>
          {auth.user ? (
            <div>
              <div>Signed in as {auth.user?.email}</div>
              <div>{auth.user?.displayName}</div>
              <button
                onClick={() => {
                  void auth.logout();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div>
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={authBusy}
                  onClick={async () => {
                    setAuthBusy(true);
                    try {
                      await auth.register({ email, password, displayName });
                    } catch (err) {
                      console.error(err);
                      alert("Signup failed");
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  Sign up
                </button>

                <button
                  disabled={authBusy}
                  onClick={async () => {
                    setAuthBusy(true);
                    try {
                      await auth.login({ email, password });
                    } catch (err) {
                      console.error(err);
                      alert("Login failed");
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  Sign in
                </button>
              </div>
            </div>
          )}
        </div>

        <OnboardingPanel
          authUserEmail={auth.user?.email}
          pubKeyB64={pubKeyB64}
          keyRegistered={keyRegistered}
          connectionsCount={connectionsHook.connections.length}
          generateKeypair={generateKeypair}
          registerPublicKey={registerPublicKey}
          startLink={startLinkFn}
          keyBusy={keyBusy}
          linkBusy={hookLinkBusy}
        />

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

        <LinkWizard
          startLink={startLinkFn}
          linkCode={hookLinkCode}
          linkProvider={hookLinkProvider as Provider | null}
          linkExpiresAt={hookLinkExpiresAt}
          linkStatus={hookLinkStatus}
          linkDeepMobile={hookLinkDeepMobile}
          linkDeepWeb={hookLinkDeepWeb}
          linkBusy={hookLinkBusy}
          cancelLink={cancelLinkFn}
        />

        <ConnectionsPanel
          connections={connectionsHook.connections}
          connectionsBusy={connectionsHook.connectionsBusy}
          loadConnectionsList={connectionsHook.loadConnectionsList}
          editingConnId={editingConnId}
          setEditingConnId={setEditingConnId}
          editingTokenValue={editingTokenValue}
          setEditingTokenValue={setEditingTokenValue}
          editingPhoneNumberId={editingPhoneNumberId}
          setEditingPhoneNumberId={setEditingPhoneNumberId}
          submitConnectionToken={submitConnectionToken}
        />

        <nav className="provider-nav" aria-label="Provider navigation">
          {supportedProviders.map((item) => {
            const isActive = item === provider;
            const status = providerStatuses.find(
              (entry) => entry.provider === item,
            );

            return (
              <button
                key={item}
                type="button"
                className={`provider-tab ${isActive ? "active" : ""}`}
                onClick={() => setProvider(item)}
                style={{ ["--accent" as string]: providerMeta[item].accent }}
              >
                <span className="provider-icon">{providerMeta[item].icon}</span>
                <span className="provider-copy">
                  <strong>{providerMeta[item].label}</strong>
                  <span>
                    {status?.readiness === "ready"
                      ? "Backend ready"
                      : "Needs setup"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="panel status-card">
          <div className="status-row-top">
            <span className={isRealtime ? "status good" : "status warn"}>
              {isRealtime ? "Realtime connected" : "Polling fallback active"}
            </span>
            <span className="status subtle">API ready</span>
          </div>

          <div className="provider-status-copy">
            <h2>{getProviderLabel(provider)}</h2>
            <p>
              {providerMeta[provider].label} Web opens in a separate tab for the
              provider login session.
            </p>
            <div style={{ fontSize: 13, color: "#666" }}>
              Use your {providerMeta[provider].label} client to send and receive
              messages — linking works from web or mobile clients.
            </div>
          </div>

          <div className="status-detail-grid">
            <div>
              <span className="label">Backend</span>
              <strong>
                {selectedProviderStatus?.backendReady ? "Ready" : "Needs setup"}
              </strong>
            </div>
            <div>
              <span className="label">Webhook</span>
              <strong>
                {selectedProviderStatus?.webhookReady ? "Verified" : "Pending"}
              </strong>
            </div>
          </div>

          <ul className="status-notes">
            {(
              selectedProviderStatus?.setupNotes ?? [
                "Open the provider web client to authenticate the browser session.",
              ]
            ).map((note: string) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="workspace-grid" tabIndex={-1}>
        <header className="workspace-header panel elevated">
          <div>
            <span className="eyebrow">Inbox</span>
            <h2>{getProviderLabel(provider)} conversations</h2>
            <p>
              Chats are listed from stored messages. Secure threads are derived
              from encrypted traffic, plain threads from unencrypted traffic.
            </p>
          </div>
          <div className="header-meta">
            <span className="pill">{conversations.length} threads</span>
            <span className="pill">{messages.length} messages loaded</span>
          </div>
        </header>

        <section className="inbox-layout">
          <aside className="panel inbox-list elevated">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Available chats</span>
                <h3>Secure and plain threads</h3>
              </div>
            </div>

            {conversations.length === 0 ? (
              <div className="empty-state">
                <p>No chats yet for this provider.</p>
                <p>
                  Start a conversation in {getProviderLabel(provider)} Web, or
                  wait for the webhook to land a message here.
                </p>
              </div>
            ) : (
              conversations.map((conversation) => {
                const isSelected = conversation.chatId === selectedChatId;

                return (
                  <button
                    key={`${conversation.provider}:${conversation.chatId}`}
                    type="button"
                    className={`conversation-item ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedChatId(conversation.chatId)}
                  >
                    <div className="conversation-item-top">
                      <strong>{conversation.chatId}</strong>
                      <span className={`pill ${conversation.securityState}`}>
                        {conversation.securityState}
                      </span>
                    </div>
                    <p className="conversation-preview">
                      {trimPreview(conversation.lastMessagePreview ?? "")}
                    </p>
                    <div className="conversation-item-meta">
                      <span>{conversation.counterpart}</span>
                      <span>{conversation.messageCount} msgs</span>
                    </div>
                  </button>
                );
              })
            )}
          </aside>

          <section className="workspace-main">
            <section className="panel elevated selected-conversation">
              <div className="selected-header">
                <div>
                  <span className="eyebrow">Current thread</span>
                  <h3>
                    {selectedConversation
                      ? selectedConversation.chatId
                      : "Select a chat"}
                  </h3>
                  <p>
                    {selectedConversation
                      ? `Counterpart: ${selectedConversation.counterpart} • last updated ${toHumanTime(selectedConversation.lastMessageAt)}`
                      : "Pick a chat from the inbox to review the timeline and reply securely."}
                  </p>
                </div>

                <SelectedConversationPanel
                  selectedConversation={selectedConversation}
                />
              </div>

              {selectedConversation && (
                <div className="conversation-stats">
                  <span className="pill">
                    {selectedConversation.messageCount} total
                  </span>
                  <span className="pill secure">
                    {selectedConversation.secureMessageCount} secure
                  </span>
                  <span className="pill plain">
                    {selectedConversation.plainMessageCount} plain
                  </span>
                  <span
                    className={`pill ${selectedConversation.securityState}`}
                  >
                    {selectedConversation.securityState} thread
                  </span>
                </div>
              )}

              {/* verification UI handled by SelectedConversationPanel */}
            </section>

            <section className="panel composer elevated">
              <div className="composer-header">
                <div>
                  <span className="eyebrow">Reply composer</span>
                  <h3>
                    {replyMode === "secure" ? "Secure reply" : "Plain reply"}
                  </h3>
                </div>
                <div
                  className="mode-toggle"
                  role="group"
                  aria-label="Reply mode"
                >
                  <button
                    type="button"
                    className={
                      replyMode === "secure"
                        ? "mode-button active"
                        : "mode-button"
                    }
                    onClick={() => setReplyMode("secure")}
                    disabled={!selectedConversation}
                  >
                    Secure
                  </button>
                  <button
                    type="button"
                    className={
                      replyMode === "plain"
                        ? "mode-button active"
                        : "mode-button"
                    }
                    onClick={() => setReplyMode("plain")}
                    disabled={!selectedConversation}
                  >
                    Plain
                  </button>
                </div>
              </div>

              <Composer
                text={text}
                setText={setText}
                imageUrl={imageUrl}
                setImageUrl={setImageUrl}
                file={file}
                setFile={setFile}
                filePreview={filePreview}
                fileInputRef={fileInputRef}
                removeFile={removeFile}
                replyMode={replyMode}
                busy={sendBusy}
                sendMessage={handleSend}
                selectedConversation={selectedConversation}
                selectedProviderStatus={selectedProviderStatus}
              />
            </section>

            <section className="panel timeline elevated">
              <div className="section-heading timeline-heading">
                <div>
                  <span className="eyebrow">Timeline</span>
                  <h3>
                    {selectedConversation
                      ? "Conversation history"
                      : "No thread selected"}
                  </h3>
                </div>
                <span className={isRealtime ? "status good" : "status warn"}>
                  {isRealtime
                    ? "Realtime connected"
                    : "Polling fallback active"}
                </span>
              </div>

              <Timeline
                messages={messages}
                privJwk={privJwk}
                localOwnerId={localOwnerId}
                deriveAesGcmKey={deriveAesGcmKey}
              />
            </section>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
