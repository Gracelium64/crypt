import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import "./App.css";

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

const secureMarker = "[CRYPT:v1]";

const isSecureCiphertext = (value: string) => value.startsWith(secureMarker);

// Helpers for WebCrypto key operations and fingerprinting
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToHex = (b64: string) => {
  const bin = atob(b64);
  const arr = [];
  for (let i = 0; i < bin.length; i++) {
    arr.push(bin.charCodeAt(i).toString(16).padStart(2, "0"));
  }
  return arr.join("");
};

const fingerprintFromPubKey = async (pubRaw: ArrayBuffer) => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", pubRaw);
  const b64 = arrayBufferToBase64(hashBuffer);
  // short, human-friendly: first 12 hex chars grouped
  const hex = base64ToHex(b64).toUpperCase();
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)}`;
};

// base64 -> ArrayBuffer
const base64ToArrayBuffer = (b64: string) => {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Import public raw key (base64 raw format) into CryptoKey
const importPublicKeyFromBase64 = async (b64: string) => {
  const ab = base64ToArrayBuffer(b64);
  return await crypto.subtle.importKey(
    "raw",
    ab,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
};

const importPrivateJwkKey = async (jwk: any) =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );

// Derive an AES-GCM CryptoKey from our private JWK and their public key (base64 raw)
const deriveAesGcmKey = async (privJwkObj: any, otherPubB64: string) => {
  const privKey = await importPrivateJwkKey(privJwkObj);
  const pubKey = await importPublicKeyFromBase64(otherPubB64);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const salt = new Uint8Array([]);
  const info = new TextEncoder().encode("crypt-companion v1");

  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return aesKey;
};

const encryptForRecipient = async (
  plaintext: string,
  privJwkObj: any,
  recipientPubB64: string,
) => {
  const aesKey = await deriveAesGcmKey(privJwkObj, recipientPubB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded,
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);
  return secureMarker + arrayBufferToBase64(combined.buffer);
};

const decryptFromSender = async (
  secureText: string,
  privJwkObj: any,
  senderPubB64: string,
) => {
  if (!secureText || !secureText.startsWith(secureMarker)) return null;
  try {
    const payload = secureText.slice(secureMarker.length);
    const ab = base64ToArrayBuffer(payload);
    const arr = new Uint8Array(ab);
    const iv = arr.slice(0, 12);
    const cipher = arr.slice(12);
    const aesKey = await deriveAesGcmKey(privJwkObj, senderPubB64);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      cipher,
    );
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.error("decrypt failed", err);
    return null;
  }
};

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

type UploadOpts = {
  resourceType?: "image" | "raw" | "auto";
  encrypted?: boolean;
  filename?: string;
};

const uploadSelectedImage = async (
  fileOrBlob: File | Blob,
  opts?: UploadOpts,
) => {
  // Use multipart/form-data upload handled by Formidable on the backend
  const form = new FormData();
  const filename =
    opts?.filename ??
    (fileOrBlob instanceof File ? fileOrBlob.name : "upload.bin");
  form.append("file", fileOrBlob as Blob, filename);
  if (opts?.resourceType) form.append("resourceType", opts.resourceType);
  if (opts?.encrypted) form.append("encrypted", "1");

  const resp = await fetch(`${apiBase}/api/uploads/formidable`, {
    method: "POST",
    body: form,
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.error || "upload failed");
  }

  return json.url as string;
};

// Encrypt a File for a recipient using the ECDH-derived AES-GCM key.
const encryptFileForRecipient = async (
  file: File,
  privJwkObj: any,
  recipientPubB64: string,
) => {
  const aesKey = await deriveAesGcmKey(privJwkObj, recipientPubB64);
  const fileBuf = await file.arrayBuffer();

  const header = JSON.stringify({
    filename: file.name,
    contentType: file.type,
  });
  const headerBytes = new TextEncoder().encode(header);
  const headerLen = headerBytes.length;

  const wrapper = new Uint8Array(4 + headerLen + fileBuf.byteLength);
  const view = new DataView(wrapper.buffer);
  view.setUint32(0, headerLen);
  wrapper.set(headerBytes, 4);
  wrapper.set(new Uint8Array(fileBuf), 4 + headerLen);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    wrapper.buffer,
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  const blob = new Blob([combined.buffer], {
    type: "application/octet-stream",
  });
  return { blob, filename: `${file.name}.enc` };
};

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
  const [authToken, setAuthToken] = useState<string | null>(
    () => localStorage.getItem("crypt:token") ?? null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [me, setMe] = useState<{
    email: string;
    displayName?: string;
    id?: string;
  } | null>(null);
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
      const resp = await fetch(
        `${apiBase}/api/keys/${encodeURIComponent(localOwnerId)}`,
      );
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      if (!me?.email && !localOwnerId)
        return alert("No owner ID available (log in or enter a local ID)");
      const resp = await fetch(`${apiBase}/api/keys/register`, {
        method: "POST",
        headers,
        body: JSON.stringify({ publicKey: pubKeyB64 }),
      });
      if (!resp.ok) throw new Error("register failed");
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
    const response = await fetch(`${apiBase}/api/providers/status`);
    if (!response.ok) {
      throw new Error("Could not load provider status");
    }

    const payload = await response.json();
    setProviderStatuses((payload.data ?? []) as ProviderStatus[]);
  };

  const loadConversations = async (currentProvider: Provider) => {
    const response = await fetch(
      `${apiBase}/api/conversations?provider=${currentProvider}&limit=200`,
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

    const response = await fetch(
      `${apiBase}/api/messages?${params.toString()}`,
    );
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
            const resp = await fetch(
              `${apiBase}/api/keys/${encodeURIComponent(ownerId)}`,
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

  // Load current account when token is present
  useEffect(() => {
    if (!authToken) {
      setMe(null);
      return;
    }

    (async () => {
      try {
        const resp = await fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!resp.ok) {
          setMe(null);
          return;
        }
        const j = await resp.json();
        setMe(j.data ?? null);
      } catch (err) {
        setMe(null);
      }
    })();
  }, [authToken]);

  // Load provider connections for the signed-in account
  const loadConnectionsList = async () => {
    if (!authToken) {
      setConnections([]);
      return;
    }
    setConnectionsBusy(true);
    try {
      const resp = await fetch(`${apiBase}/api/provider/connections`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!resp.ok) throw new Error("failed");
      const j = await resp.json();
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
  }, [authToken]);

  // Auto-derive local owner id from signed-in account
  useEffect(() => {
    if (me?.email) setLocalOwnerId(me.email);
  }, [me]);

  useEffect(() => {
    void checkKeyRegistered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOwnerId, pubKeyB64]);

  const submitConnectionToken = async (connId: string) => {
    if (!editingTokenValue) return alert("Enter the provider token");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const resp = await fetch(
        `${apiBase}/api/provider/connections/${encodeURIComponent(connId)}/credentials`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            token: editingTokenValue,
            phoneNumberId: editingPhoneNumberId || undefined,
          }),
        },
      );
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || "save failed");
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
        const resp = await fetch(
          `${apiBase}/api/provider/link/status/${encodeURIComponent(linkCode)}`,
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const resp = await fetch(`${apiBase}/api/provider/link/init`, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: providerToLink }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || "link init failed");
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
            const keyResp = await fetch(
              `${apiBase}/api/keys/${encodeURIComponent(ownerId)}`,
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
      let finalImageUrl = imageUrl;

      const outboundMode = replyMode === "secure";
      const conversationTarget =
        selectedConversation?.counterpart || selectedChatId || "unknown";

      // If secure mode, fetch recipient public key and ensure local private key
      let localPriv: any = null;
      let recipientPubB64: string | null = null;
      if (outboundMode) {
        localPriv = privJwk;
        if (!localPriv && localOwnerId) {
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
        if (!localPriv) {
          alert(
            "No local private key found. Generate or load your key in Key Manager.",
          );
          throw new Error("missing local private key");
        }

        const keyResp = await fetch(
          `${apiBase}/api/keys/${encodeURIComponent(conversationTarget)}`,
        );
        if (!keyResp.ok) {
          alert("Recipient public key not found. Cannot send secure message.");
          throw new Error("recipient key not found");
        }
        const keyJson = await keyResp.json();
        recipientPubB64 = keyJson?.data?.publicKey;
        if (!recipientPubB64) {
          alert("Recipient public key missing from directory.");
          throw new Error("recipient public missing");
        }
      }

      // Handle attachments: encrypt before upload when in secure mode
      if (file) {
        if (outboundMode && recipientPubB64) {
          // encrypt file for recipient and upload as raw encrypted blob
          const { blob, filename } = await encryptFileForRecipient(
            file,
            localPriv,
            recipientPubB64,
          );
          finalImageUrl = await uploadSelectedImage(blob, {
            resourceType: "raw",
            encrypted: true,
            filename,
          });
        } else {
          // plain upload (try multipart, fallback to base64 proxy)
          try {
            finalImageUrl = await uploadSelectedImage(file);
          } catch (err) {
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });

              const proxyResp = await fetch(`${apiBase}/api/uploads/base64`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataUrl }),
              });
              const proxyJson = await proxyResp.json();
              if (!proxyResp.ok)
                throw new Error(proxyJson.error || "proxy upload failed");
              finalImageUrl = proxyJson.url;
            } catch (proxyErr) {
              console.error("Upload failed", err, proxyErr);
              throw new Error("File upload failed");
            }
          }
        }
      }

      const payload: any = {
        provider,
        from: `${provider}-web`,
        to: conversationTarget,
        chatId: selectedChatId,
        attachments: finalImageUrl
          ? [{ type: "image", url: finalImageUrl }]
          : [],
      };

      if (outboundMode && recipientPubB64 && localPriv) {
        const encrypted = await encryptForRecipient(
          text || "",
          localPriv,
          recipientPubB64,
        );
        payload.encryptedText = encrypted;
        payload.encrypt = true;
      } else {
        payload.text = text;
        payload.encrypt = false;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const response = await fetch(`${apiBase}/api/messages/send`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Send failed");
      }

      setText("");
      setImageUrl("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadConversations(provider);
      await loadMessages(provider, selectedChatId);
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
          {me ? (
            <div>
              <div>Signed in as {me.email}</div>
              <div>{me.displayName}</div>
              <button
                onClick={() => {
                  localStorage.removeItem("crypt:token");
                  setAuthToken(null);
                  setMe(null);
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
                      const resp = await fetch(`${apiBase}/api/auth/signup`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, displayName }),
                      });
                      const j = await resp.json();
                      if (!resp.ok) throw new Error(j.error || "signup failed");
                      const token = j.data.token;
                      localStorage.setItem("crypt:token", token);
                      setAuthToken(token);
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
                      const resp = await fetch(`${apiBase}/api/auth/login`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password }),
                      });
                      const j = await resp.json();
                      if (!resp.ok) throw new Error(j.error || "login failed");
                      const token = j.data.token;
                      localStorage.setItem("crypt:token", token);
                      setAuthToken(token);
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

        <div className="panel onboarding-panel">
          <h3>Onboarding Checklist</h3>
          <ol>
            <li>
              <strong>Signed in:</strong>{" "}
              {me?.email ? (
                <span style={{ color: "#6fdc97" }}>{me.email}</span>
              ) : (
                <span style={{ color: "#f3c969" }}>Not signed in</span>
              )}
            </li>
            <li>
              <strong>Key generated:</strong>{" "}
              {pubKeyB64 ? (
                <span style={{ color: "#6fdc97" }}>Yes</span>
              ) : (
                <span style={{ color: "#f3c969" }}>No</span>
              )}
            </li>
            <li>
              <strong>Key registered:</strong>{" "}
              {keyRegistered ? (
                <span style={{ color: "#6fdc97" }}>Yes</span>
              ) : (
                <span style={{ color: "#f3c969" }}>No</span>
              )}
            </li>
            <li>
              <strong>Provider linked:</strong>{" "}
              {connections.length > 0 ? (
                <span style={{ color: "#6fdc97" }}>
                  {connections.length} connection(s)
                </span>
              ) : (
                <span style={{ color: "#f3c969" }}>None</span>
              )}
            </li>
          </ol>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => void generateKeypair()}
              disabled={keyBusy}
              aria-label="Generate keypair"
            >
              Generate Keypair
            </button>
            <button
              onClick={() => void registerPublicKey()}
              disabled={!pubKeyB64}
              aria-label="Register public key"
            >
              Register Key
            </button>
            <button
              onClick={() => void startLink("whatsapp")}
              aria-label="Start WhatsApp link"
            >
              Link WhatsApp
            </button>
            <button
              onClick={() => void startLink("telegram")}
              aria-label="Start Telegram link"
            >
              Link Telegram
            </button>
          </div>
        </div>

        <div className="panel key-manager">
          <h3>Key Manager (E2E scaffold)</h3>
          <label>
            Your local ID
            <input
              type="text"
              value={localOwnerId}
              onChange={(e) => setLocalOwnerId(e.target.value)}
              placeholder={
                me?.email
                  ? "Using account email"
                  : "alice@example.com or alice_telegram"
              }
              disabled={!!me?.email}
            />
            {me?.email && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Using account email as owner ID: {me.email}
              </div>
            )}
          </label>
          <div className="key-actions">
            <button
              type="button"
              onClick={() => void generateKeypair()}
              disabled={keyBusy}
            >
              Generate Keypair
            </button>
            <button type="button" onClick={() => void registerPublicKey()}>
              Register Public Key
            </button>
            <button
              type="button"
              onClick={() => {
                const v = localStorage.getItem(`crypt:priv:${localOwnerId}`);
                if (!v)
                  return alert("No private key in local storage for this ID");
                try {
                  const jwk = JSON.parse(v);
                  setPrivJwk(jwk);
                  alert("Loaded private key from local storage");
                } catch (err) {
                  alert("Failed to load private key");
                }
              }}
            >
              Load Private Key
            </button>
          </div>

          {pubKeyB64 && (
            <div className="key-preview">
              <label>Public key (base64)</label>
              <textarea readOnly rows={3} value={pubKeyB64} />
              {fingerprint && (
                <div className="fingerprint">Fingerprint: {fingerprint}</div>
              )}
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR" style={{ width: 140 }} />
              )}
              {privJwk && (
                <div className="private-status">Private key stored locally</div>
              )}
            </div>
          )}
        </div>

        <div className="panel link-wizard">
          <h3>Link Provider (no credentials)</h3>
          <p>
            Generate a short link code and send it to the hosted bot/number in
            your provider client (Telegram or WhatsApp) to link this browser
            session to the hosted connector.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => void startLink("telegram")}
              disabled={linkBusy}
            >
              Link Telegram
            </button>
            <button
              onClick={() => void startLink("whatsapp")}
              disabled={linkBusy}
            >
              Link WhatsApp
            </button>
          </div>

          {linkCode && (
            <div className="link-status">
              <label>Link code</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 18 }}>{`LINK ${linkCode}`}</strong>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`LINK ${linkCode}`);
                    alert("Copied link code to clipboard");
                  }}
                >
                  Copy
                </button>
                <button onClick={cancelLink}>Close</button>
              </div>

              <div style={{ marginTop: 8 }}>
                <small>
                  Expires:{" "}
                  {linkExpiresAt
                    ? new Date(linkExpiresAt).toLocaleString()
                    : "-"}
                </small>
              </div>

              <div style={{ marginTop: 8 }}>
                {linkStatus?.completed ? (
                  <div>
                    <strong>Linked</strong>
                    <div>Chat ID: {linkStatus.providerChatId}</div>
                    <div>Provider: {linkProvider ?? "(unknown)"}</div>
                    <div>
                      Display: {linkStatus.providerDisplayName ?? "(unknown)"}
                    </div>
                  </div>
                ) : (
                  <div>
                    Waiting for the user to send the code in the provider
                    client...
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          const preferMobile = isMobileDevice();
                          const toOpen = preferMobile
                            ? (linkDeepMobile ?? linkDeepWeb)
                            : (linkDeepWeb ?? linkDeepMobile);
                          if (toOpen) window.open(toOpen, "_blank");
                          else
                            alert("No deep link available for this provider");
                        }}
                      >
                        Open in app/web
                      </button>
                      <button
                        onClick={() => {
                          if (linkDeepWeb) window.open(linkDeepWeb, "_blank");
                          else alert("No web deep link available");
                        }}
                      >
                        Open web
                      </button>
                      <small style={{ alignSelf: "center", color: "#888" }}>
                        Tip: Mobile devices will open the provider app when
                        available.
                      </small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="panel connections-panel">
          <h3>Connections</h3>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <button
              onClick={() => void loadConnectionsList()}
              disabled={connectionsBusy}
            >
              Refresh
            </button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <small style={{ color: "#666" }}>
                Connections listed for your account.
              </small>
            </div>
          </div>

          {connections.length === 0 ? (
            <div className="empty-state">
              No provider connections for this account.
            </div>
          ) : (
            connections.map((conn) => (
              <div
                key={conn._id}
                style={{
                  borderTop: "1px solid #eee",
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div>
                    <strong>{conn.provider}</strong>
                    <div style={{ fontSize: 12 }}>{conn.providerChatId}</div>
                    <div style={{ fontSize: 12 }}>{conn.displayName}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {editingConnId === conn._id ? (
                      <button
                        onClick={() => {
                          setEditingConnId(null);
                          setEditingTokenValue("");
                          setEditingPhoneNumberId("");
                        }}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingConnId(conn._id);
                          setEditingTokenValue("");
                          setEditingPhoneNumberId(
                            conn.meta?.phoneNumberId ?? "",
                          );
                        }}
                      >
                        Set Token
                      </button>
                    )}
                  </div>
                </div>

                {editingConnId === conn._id && (
                  <div style={{ marginTop: 8 }}>
                    <label>
                      Provider token
                      <input
                        value={editingTokenValue}
                        onChange={(e) => setEditingTokenValue(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </label>
                    {conn.provider === "whatsapp" && (
                      <label>
                        Phone number id (optional)
                        <input
                          value={editingPhoneNumberId}
                          onChange={(e) =>
                            setEditingPhoneNumberId(e.target.value)
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => void submitConnectionToken(conn._id)}
                      >
                        Save token
                      </button>
                      <button
                        onClick={() => {
                          setEditingConnId(null);
                          setEditingTokenValue("");
                          setEditingPhoneNumberId("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

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
                        const resp = await fetch(
                          `${apiBase}/api/provider/resolve?provider=${encodeURIComponent(selectedConversation.provider)}&chatId=${encodeURIComponent(selectedConversation.chatId)}`,
                        );
                        if (!resp.ok) throw new Error("resolve failed");
                        const j = await resp.json();
                        const ownerEmail = j.data?.email ?? null;
                        setVerifyOwner(
                          ownerEmail ?? selectedConversation.chatId,
                        );
                        if (ownerEmail) {
                          const kresp = await fetch(
                            `${apiBase}/api/keys/${encodeURIComponent(ownerEmail)}`,
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

              <label>
                Message text
                <textarea
                  rows={3}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    selectedConversation
                      ? "Type a reply for the selected thread"
                      : "Pick a chat first"
                  }
                  disabled={!selectedConversation}
                />
              </label>

              <label>
                Image URL (optional)
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                  disabled={!selectedConversation}
                />
              </label>

              <label>
                Upload Image
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={!selectedConversation}
                />
              </label>

              {file && (
                <div className="file-preview-container">
                  {filePreview && (
                    <img
                      src={filePreview}
                      alt="upload preview"
                      className="file-thumbnail"
                    />
                  )}
                  <div className="file-preview-details">
                    <span>
                      <strong>Selected:</strong> {file.name} (
                      {Math.round(file.size / 1024)} KB)
                    </span>
                    <button
                      type="button"
                      className="remove-file-button"
                      onClick={removeFile}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              <div className="composer-actions">
                <span className="composer-hint">
                  {replyMode === "secure"
                    ? "Secure mode encrypts the message before transport."
                    : "Plain mode sends the message without encrypting it."}
                </span>
                <button
                  onClick={sendMessage}
                  disabled={
                    busy ||
                    !selectedConversation ||
                    (!text && !imageUrl && !file) ||
                    !selectedProviderStatus?.backendReady
                  }
                >
                  {replyMode === "secure"
                    ? "Send secure message"
                    : "Send plain message"}
                </button>
              </div>
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

              {messages.length === 0 ? (
                <div className="empty-state timeline-empty">
                  <p>No messages yet for this thread.</p>
                  <p>
                    Use the provider web client to start the chat, then reply
                    here.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const content = message.bodyOmitted
                    ? "(omitted for privacy)"
                    : (message.decryptedText ??
                      message.encryptedText ??
                      "(empty)");
                  const secure = isSecureCiphertext(
                    message.encryptedText || "",
                  );
                  return (
                    <article
                      key={message._id ?? message.id}
                      className={`message-card ${message.direction}`}
                    >
                      <div className={`message-row ${message.direction}`}>
                        {message.direction === "inbound" && (
                          <div className="avatar">
                            {(message.from || "?").charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className={`bubble ${message.direction}`}>
                          <div className="bubble-meta">
                            <div className="who">
                              {message.direction === "inbound"
                                ? message.from
                                : "You"}
                            </div>
                            <div className="time">
                              {toHumanTime(message.createdAt)}
                            </div>
                          </div>

                          <div className="bubble-content">{content}</div>

                          {message.attachments.length > 0 && (
                            <div className="attachment-grid">
                              {message.attachments.map((item) => {
                                const isEnc = item.url.includes("?crypt=1");
                                return isEnc ? (
                                  <div
                                    key={item.url}
                                    className="encrypted-attachment"
                                  >
                                    <button
                                      onClick={async () => {
                                        try {
                                          const ownerId =
                                            message.direction === "inbound"
                                              ? message.from
                                              : message.to;
                                          const storedPriv =
                                            privJwk ??
                                            (localOwnerId
                                              ? JSON.parse(
                                                  localStorage.getItem(
                                                    `crypt:priv:${localOwnerId}`,
                                                  ) || "null",
                                                )
                                              : null);
                                          if (!storedPriv)
                                            return alert(
                                              "No private key available to decrypt attachment",
                                            );

                                          const keyResp = await fetch(
                                            `${apiBase}/api/keys/${encodeURIComponent(ownerId)}`,
                                          );
                                          if (!keyResp.ok)
                                            return alert(
                                              "Could not fetch counterpart public key",
                                            );
                                          const kjson = await keyResp.json();
                                          const theirPub =
                                            kjson?.data?.publicKey;
                                          if (!theirPub)
                                            return alert(
                                              "Counterpart public key missing",
                                            );

                                          const res = await fetch(item.url);
                                          if (!res.ok)
                                            return alert(
                                              "Failed to download attachment",
                                            );
                                          const ab = await res.arrayBuffer();

                                          // decrypt binary attachment
                                          const arr = new Uint8Array(ab);
                                          const iv = arr.slice(0, 12);
                                          const cipher = arr.slice(12);
                                          const aesKey = await deriveAesGcmKey(
                                            storedPriv,
                                            theirPub,
                                          );
                                          const plain =
                                            await crypto.subtle.decrypt(
                                              { name: "AES-GCM", iv },
                                              aesKey,
                                              cipher.buffer
                                                ? cipher.buffer
                                                : cipher,
                                            );
                                          const plainArr = new Uint8Array(
                                            plain,
                                          );
                                          const view = new DataView(
                                            plainArr.buffer,
                                          );
                                          const headerLen = view.getUint32(0);
                                          const headerBytes = new Uint8Array(
                                            plainArr.buffer.slice(
                                              4,
                                              4 + headerLen,
                                            ),
                                          );
                                          const headerStr =
                                            new TextDecoder().decode(
                                              headerBytes,
                                            );
                                          const meta = JSON.parse(headerStr);
                                          const fileBytes = new Uint8Array(
                                            plainArr.buffer.slice(
                                              4 + headerLen,
                                            ),
                                          );
                                          const blob = new Blob([fileBytes], {
                                            type:
                                              meta.contentType ||
                                              "application/octet-stream",
                                          });
                                          const urlObj =
                                            URL.createObjectURL(blob);
                                          // open in new tab
                                          window.open(urlObj, "_blank");
                                        } catch (err) {
                                          console.error(err);
                                          alert(
                                            "Failed to decrypt/open attachment",
                                          );
                                        }
                                      }}
                                    >
                                      Open encrypted attachment
                                    </button>
                                  </div>
                                ) : (
                                  <img
                                    key={item.url}
                                    src={item.url}
                                    alt="attachment"
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {message.direction === "outbound" && (
                          <div className="avatar you">Y</div>
                        )}
                      </div>

                      <div className="message-foot">
                        <span>
                          Delivery: {message.deliveryStatus ?? "unknown"}
                        </span>
                        <span style={{ marginLeft: 12 }}>
                          Security: {secure ? "secure" : "plain"}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
