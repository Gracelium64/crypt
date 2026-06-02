import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import "./App.css";
import { useAuth } from "./context/useAuth";
import KeyManager from "./components/KeyManager";
import OnboardingPanel from "./components/OnboardingPanel";
import LinkWizard from "./components/LinkWizard";
import ConnectionsPanel from "./components/ConnectionsPanel";
import Composer from "./components/Composer";
import Timeline from "./components/Timeline";
import { apiFetch, apiJson } from "./lib/api";
import {
  isSecureCiphertext,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  fingerprintFromPubKey,
  deriveAesGcmKey,
  decryptFromSender,
} from "./lib/crypto";
import { sendMessageService } from "./services/messages";

type Provider = "telegram" | "whatsapp";
type MessageProvider = Provider;

type ChatMessage = {
  _id?: string;
  id?: string;
  provider: MessageProvider;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  chatId: string;
  encryptedText: string;
  // plaintext fields intentionally not stored on server for E2E
  attachments: Array<{ type: "image"; url: string }>;
  deliveryStatus?: "queued" | "sent" | "failed";
  createdAt: string;
  bodyOmitted?: boolean;
  decryptedText?: string;
};

type ConversationSummary = {
  provider: Provider;
  chatId: string;
  counterpart: string;
  messageCount: number;
  secureMessageCount: number;
  plainMessageCount: number;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  lastMessagePreview: string;
  securityState: "secure" | "plain" | "mixed";
};

type ProviderStatus = {
  provider: Provider;
  label: string;
  icon: string;
  webUrl: string;
  backendReady: boolean;
  webhookReady: boolean;
  readiness: "ready" | "needs-setup";
  setupNotes: string[];
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const socket = io(apiBase, {
  transports: ["websocket", "polling"],
  autoConnect: true,
});

const providerMeta: Record<
  Provider,
  {
    label: string;
    icon: string;
    webUrl: string;
    accent: string;
  }
> = {
  telegram: {
    label: "Telegram",
    icon: "✈",
    webUrl: "https://web.telegram.org/k/",
    accent: "#46a0f5",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: "◉",
    webUrl: "https://web.whatsapp.com/",
    accent: "#25d366",
  },
};

const supportedProviders: Provider[] = ["telegram", "whatsapp"];

const toHumanTime = (value?: string) => {
  if (!value) {
    return "Just now";
  }

  return new Date(value).toLocaleString();
};

const trimPreview = (text: string) => {
  if (text.length <= 96) {
    return text;
  }

  return `${text.slice(0, 93)}...`;
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
  const [isRealtime, setIsRealtime] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>(
    [],
  );
  const [lastSync, setLastSync] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [localOwnerId, setLocalOwnerId] = useState("");
  const [pubKeyB64, setPubKeyB64] = useState<string | null>(null);
  const [privJwk, setPrivJwk] = useState<any | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkProvider, setLinkProvider] = useState<Provider | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<{
    completed: boolean;
    providerChatId?: string;
    providerDisplayName?: string;
  } | null>(null);
  const [linkDeepMobile, setLinkDeepMobile] = useState<string | null>(null);
  const [linkDeepWeb, setLinkDeepWeb] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const auth = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyOwner, setVerifyOwner] = useState<string | null>(null);
  const [verifyPubKey, setVerifyPubKey] = useState<string | null>(null);
  const [verifyFingerprint, setVerifyFingerprint] = useState<string | null>(
    null,
  );
  const [verifyQr, setVerifyQr] = useState<string | null>(null);

  const [connections, setConnections] = useState<any[]>([]);
  const [connectionsBusy, setConnectionsBusy] = useState(false);
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

  const isMobileDevice = () =>
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(
      navigator.userAgent || "",
    );

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
      const kp = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"],
      );
      const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
      const pubB64 = arrayBufferToBase64(pubRaw);
      const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      localStorage.setItem(
        `crypt:priv:${localOwnerId}`,
        JSON.stringify(privJwk),
      );
      setPubKeyB64(pubB64);
      setPrivJwk(privJwk);
      const fp = await fingerprintFromPubKey(pubRaw);
      setFingerprint(fp);
      const qr = await QRCode.toDataURL(`${localOwnerId}:${pubB64}`);
      setQrDataUrl(qr);
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
      await apiJson(
        "/keys/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: pubKeyB64 }),
        },
        auth.token,
      );
      showToast("Public key registered");
      void loadConnectionsList();
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

  const loadProviderStatuses = async () => {
    const response = await apiFetch(`/providers/status`);
    if (!response.ok) {
      throw new Error("Could not load provider status");
    }

    const payload = await response.json();
    setProviderStatuses((payload.data ?? []) as ProviderStatus[]);
  };

  const loadConversations = async (currentProvider: Provider) => {
    const response = await apiFetch(
      `/conversations?provider=${currentProvider}&limit=200`,
    );
    if (!response.ok) {
      throw new Error("Could not load conversations");
    }

    const payload = await response.json();
    const data = (payload.data ?? []) as ConversationSummary[];
    setConversations(data);

    setSelectedChatId((currentChatId) => {
      if (currentChatId && data.some((item) => item.chatId === currentChatId)) {
        return currentChatId;
      }

      return data[0]?.chatId ?? "";
    });
  };

  const loadMessages = async (
    currentProvider: Provider,
    currentChatId: string,
    since?: string,
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
    if (since) {
      params.set("since", since);
    }

    const response = await apiFetch(`/messages?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Could not load messages");
    }

    const payload = await response.json();
    const incoming = (payload.data ?? []) as ChatMessage[];
    // Attempt client-side decryption when possible
    const tryDecrypt = async (items: ChatMessage[]) => {
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
            const resp = await apiFetch(`/keys/${encodeURIComponent(ownerId)}`);
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
          // ignore decryption failures per-message
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
  };

  useEffect(() => {
    void loadProviderStatuses();
  }, []);

  // Auth context manages the current account

  // Load provider connections for the signed-in account
  const loadConnectionsList = async () => {
    if (!auth?.token) {
      setConnections([]);
      return;
    }
    setConnectionsBusy(true);
    try {
      const j = await apiJson("/provider/connections", {}, auth.token);
      setConnections(j.data ?? []);
    } catch (err) {
      console.error(err);
      alert("Failed to load connections");
    } finally {
      setConnectionsBusy(false);
    }
  };

  useEffect(() => {
    void loadConnectionsList();
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
      await apiJson(
        `/provider/connections/${encodeURIComponent(connId)}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: editingTokenValue,
            phoneNumberId: editingPhoneNumberId || undefined,
          }),
        },
        auth.token,
      );
      alert("Stored token for connection");
      setEditingConnId(null);
      setEditingTokenValue("");
      setEditingPhoneNumberId("");
      await loadConnectionsList();
    } catch (err) {
      console.error(err);
      alert("Failed to store token for connection");
    }
  };

  // Polling for provider link status when a link code has been generated
  useEffect(() => {
    if (!linkCode) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const resp = await apiFetch(
          `/provider/link/status/${encodeURIComponent(linkCode)}`,
        );
        if (!resp.ok) return;
        const j = await resp.json();
        if (cancelled) return;
        const prev = linkStatus;
        setLinkStatus(j.data ?? null);
        if (j.data?.completed) {
          window.clearInterval(id);
          // Refresh connections and conversations, then select the new chat
          try {
            await loadConnectionsList();
            if (j.data.provider) {
              // switch provider to the linked provider so the inbox shows
              setProvider(j.data.provider as Provider);
              if (j.data.providerChatId) {
                setSelectedChatId(j.data.providerChatId);
                await loadConversations(j.data.provider);
                await loadMessages(j.data.provider, j.data.providerChatId);
              }
            }
          } catch (err) {
            // ignore refresh errors
          }

          // accessibility: move focus to main content and announce via toast
          try {
            const mainEl = document.querySelector(
              ".workspace-grid",
            ) as HTMLElement | null;
            if (mainEl) mainEl.focus();
          } catch (e) {
            /* ignore */
          }

          showToast(
            `Linked ${j.data.provider} — you can now send secure messages to this chat.`,
          );
        }
        // if just transitioned from not-completed to completed, show toast
        if (!prev?.completed && j.data?.completed) {
          showToast(
            `Linked ${j.data.provider} — you can now send secure messages to this chat.`,
          );
        }
      } catch (err) {
        // ignore polling errors
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [linkCode]);

  const startLink = async (providerToLink: Provider) => {
    setLinkBusy(true);
    try {
      const j = await apiJson(
        "/provider/link/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerToLink }),
        },
        auth.token,
      );
      setLinkCode(j.data.code);
      setLinkProvider(j.data.provider);
      setLinkExpiresAt(j.data.expiresAt);
      setLinkStatus({ completed: false });
      setLinkDeepMobile(j.data.deepLinkMobile ?? null);
      setLinkDeepWeb(j.data.deepLinkWeb ?? null);
      // copy code to clipboard and open deep-link if provided to streamline UX
      try {
        const text = `LINK ${j.data.code}`;
        navigator.clipboard?.writeText(text);
      } catch (e) {
        /* ignore clipboard failures */
      }
      // auto-open the most appropriate deep link for the device
      try {
        const preferMobile = isMobileDevice();
        const toOpen = preferMobile
          ? (j.data.deepLinkMobile ?? j.data.deepLinkWeb ?? null)
          : (j.data.deepLinkWeb ?? j.data.deepLinkMobile ?? null);
        if (toOpen) window.open(toOpen, "_blank");
      } catch (e) {
        // ignore popup failures
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create link code");
    } finally {
      setLinkBusy(false);
    }
  };

  const cancelLink = () => {
    setLinkCode(null);
    setLinkProvider(null);
    setLinkExpiresAt(null);
    setLinkStatus(null);
  };

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

  useEffect(() => {
    const onConnect = () => setIsRealtime(true);
    const onDisconnect = () => setIsRealtime(false);
    const onNewMessage = async (message: ChatMessage) => {
      if (message.provider !== providerRef.current) {
        return;
      }

      void loadConversations(providerRef.current);

      if (message.chatId !== selectedChatIdRef.current) {
        return;
      }

      // Try client-side decryption for the single incoming message
      try {
        const priv =
          privJwk ??
          (localOwnerId
            ? JSON.parse(
                localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null",
              )
            : null);
        if (priv && isSecureCiphertext(message.encryptedText ?? "")) {
          const ownerId =
            message.direction === "inbound" ? message.from : message.to;
          if (ownerId) {
            const keyResp = await apiFetch(
              `/keys/${encodeURIComponent(ownerId)}`,
            );
            if (keyResp.ok) {
              const kjson = await keyResp.json();
              const theirPub = kjson?.data?.publicKey;
              if (theirPub) {
                const plain = await decryptFromSender(
                  message.encryptedText ?? "",
                  priv,
                  theirPub,
                );
                if (plain) message.decryptedText = plain;
              }
            }
          }
        }
      } catch (err) {
        /* ignore decryption errors for live updates */
      }

      setMessages((current) => [...current, message]);
      setLastSync(message.createdAt);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onNewMessage);
    };
  }, []);

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

  const sendMessage = async () => {
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

    setBusy(true);
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

      await sendMessageService({
        provider,
        selectedChatId,
        conversationTarget,
        replyMode,
        text,
        file,
        imageUrl,
        authToken: auth.token,
        privJwk: localPriv,
        localOwnerId: localOwnerId || null,
      });

      setText("");
      setImageUrl("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      await loadConversations(provider);
      await loadMessages(provider, selectedChatId);
    } catch (err) {
      console.error(err);
      showToast("Failed to send message");
    } finally {
      setBusy(false);
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
          connectionsCount={connections.length}
          generateKeypair={generateKeypair}
          registerPublicKey={registerPublicKey}
          startLink={startLink}
          keyBusy={keyBusy}
          linkBusy={linkBusy}
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
          startLink={startLink}
          linkCode={linkCode}
          linkProvider={linkProvider}
          linkExpiresAt={linkExpiresAt}
          linkStatus={linkStatus}
          linkDeepMobile={linkDeepMobile}
          linkDeepWeb={linkDeepWeb}
          linkBusy={linkBusy}
          cancelLink={cancelLink}
        />

        <ConnectionsPanel
          connections={connections}
          connectionsBusy={connectionsBusy}
          loadConnectionsList={loadConnectionsList}
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
            ).map((note) => (
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
                      {trimPreview(conversation.lastMessagePreview)}
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

                <div className="selected-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setReplyMode("secure")}
                    disabled={!selectedConversation}
                  >
                    Start secure chat
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={async () => {
                      if (!selectedConversation) return;
                      setVerifyOpen(true);
                      setVerifyOwner(null);
                      setVerifyPubKey(null);
                      setVerifyFingerprint(null);
                      setVerifyQr(null);
                      try {
                        const resp = await apiFetch(
                          `/provider/resolve?provider=${encodeURIComponent(selectedConversation.provider)}&chatId=${encodeURIComponent(selectedConversation.chatId)}`,
                        );
                        if (!resp.ok) throw new Error("resolve failed");
                        const j = await resp.json();
                        const ownerEmail = j.data?.email ?? null;
                        setVerifyOwner(
                          ownerEmail ?? selectedConversation.chatId,
                        );
                        if (ownerEmail) {
                          const kresp = await apiFetch(
                            `/keys/${encodeURIComponent(ownerEmail)}`,
                          );
                          if (kresp.ok) {
                            const kj = await kresp.json();
                            const pub = kj?.data?.publicKey;
                            if (pub) {
                              setVerifyPubKey(pub);
                              const ab = base64ToArrayBuffer(pub);
                              const fp = await fingerprintFromPubKey(ab);
                              setVerifyFingerprint(fp);
                              const qr = await QRCode.toDataURL(
                                `${ownerEmail}:${pub}`,
                              );
                              setVerifyQr(qr);
                            }
                          }
                        }
                      } catch (err) {
                        console.error(err);
                        alert("Failed to load verification info");
                      }
                    }}
                    disabled={!selectedConversation}
                  >
                    Verify
                  </button>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Open your provider client to send the LINK code.
                  </div>
                </div>
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

              {verifyOpen && (
                <div className="panel verify-panel elevated">
                  <h4>Verify contact</h4>
                  <div>
                    <strong>Owner:</strong> {verifyOwner}
                  </div>
                  {verifyPubKey ? (
                    <div>
                      <div>
                        <strong>Fingerprint:</strong> {verifyFingerprint}
                      </div>
                      {verifyQr && (
                        <img src={verifyQr} alt="QR" style={{ width: 160 }} />
                      )}
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => {
                            // mark verified locally
                            if (!verifyOwner) return;
                            const key = `crypt:verified:${verifyOwner}`;
                            localStorage.setItem(key, "1");
                            alert("Marked as verified locally");
                          }}
                        >
                          Mark verified (local)
                        </button>
                        <button onClick={() => setVerifyOpen(false)}>
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>No public key found for this contact.</div>
                  )}
                </div>
              )}
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
                busy={busy}
                sendMessage={sendMessage}
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
