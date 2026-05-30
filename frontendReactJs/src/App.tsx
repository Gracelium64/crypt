import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

type Provider = "telegram" | "whatsapp" | "mock";

type ChatMessage = {
  _id?: string;
  id?: string;
  provider: Provider;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  chatId: string;
  rawText: string;
  encryptedText: string;
  decryptedText: string;
  attachments: Array<{ type: "image"; url: string }>;
  deliveryStatus?: "queued" | "sent" | "mocked" | "failed";
  createdAt: string;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const socket = io(apiBase, {
  transports: ["websocket", "polling"],
  autoConnect: true,
});

function App() {
  const [provider, setProvider] = useState<Provider>("telegram");
  const [chatId, setChatId] = useState("demo-chat");
  const [from, setFrom] = useState("phone-a");
  const [to, setTo] = useState("phone-b");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(true);
  const [isRealtime, setIsRealtime] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSync, setLastSync] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const filteredMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.provider === provider && message.chatId === chatId,
      ),
    [messages, provider, chatId],
  );

  const loadMessages = async (since?: string) => {
    const params = new URLSearchParams({
      provider,
      chatId,
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
    if (incoming.length === 0) {
      return;
    }

    setMessages((current) => {
      const map = new Map(current.map((item) => [item._id ?? item.id, item]));
      for (const item of incoming) {
        map.set(item._id ?? item.id, item);
      }
      return Array.from(map.values()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    });
    setLastSync(incoming[incoming.length - 1]?.createdAt ?? lastSync);
  };

  useEffect(() => {
    void loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, chatId]);

  useEffect(() => {
    const onConnect = () => setIsRealtime(true);
    const onDisconnect = () => setIsRealtime(false);
    const onNewMessage = (message: ChatMessage) => {
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
      void loadMessages(lastSync);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [isRealtime, lastSync, provider, chatId]);

  const sendMessage = async () => {
    setBusy(true);
    try {
      // Determine final image URL: either existing imageUrl or uploaded file
      let finalImageUrl = imageUrl;

      if (file) {
        try {
          const presignResp = await fetch(`${apiBase}/api/uploads/presign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
            }),
          });
          const presignJson = await presignResp.json();
          if (!presignResp.ok)
            throw new Error(presignJson.error || "presign failed");

          const { uploadUrl, objectUrl } = presignJson;

          const putResp = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!putResp.ok) throw new Error("Upload failed");

          finalImageUrl = objectUrl;
        } catch (err) {
          // fallback: upload via server base64 proxy
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

      const response = await fetch(`${apiBase}/api/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          from,
          to,
          chatId,
          text,
          encrypt,
          attachments: finalImageUrl
            ? [{ type: "image", url: finalImageUrl }]
            : [],
        }),
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
    } finally {
      setBusy(false);
    }
  };

  const createMockInbound = async () => {
    setBusy(true);
    try {
      let finalImageUrl = imageUrl;

      if (file) {
        try {
          const presignResp = await fetch(`${apiBase}/api/uploads/presign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
            }),
          });
          const presignJson = await presignResp.json();
          if (!presignResp.ok)
            throw new Error(presignJson.error || "presign failed");

          const { uploadUrl, objectUrl } = presignJson;

          const putResp = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!putResp.ok) throw new Error("Upload failed");

          finalImageUrl = objectUrl;
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
            console.error("Simulation upload failed", err, proxyErr);
            alert("SQS or Base64 upload failed. Check server config.");
            return;
          }
        }
      }

      const textVal =
        text.trim() || "Inbound message simulating webhook callback";

      await fetch(`${apiBase}/api/messages/mock-inbound`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          from,
          to,
          chatId,
          text: textVal,
          encrypt,
          attachments: finalImageUrl
            ? [{ type: "image", url: finalImageUrl }]
            : [],
        }),
      });

      setText("");
      setImageUrl("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Simulation failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Crypt Companion Demo</h1>
        <p>React web app with realtime updates and polling fallback</p>
      </header>

      <section className="panel controls-grid">
        <label>
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
          >
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="mock">Mock</option>
          </select>
        </label>

        <label>
          Chat ID
          <input
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
          />
        </label>

        <label>
          From
          <input
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label>
          To
          <input value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>

      <section className="panel composer">
        <label>
          Message text
          <textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type a message"
          />
        </label>

        <label>
          Image URL (optional)
          <input
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>

        <label>
          Upload Image
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
          <label className="inline-check">
            <input
              type="checkbox"
              checked={encrypt}
              onChange={(event) => setEncrypt(event.target.checked)}
            />
            Encrypt before sending
          </label>
          <button
            onClick={sendMessage}
            disabled={busy || (!text && !imageUrl && !file)}
          >
            Send Outbound
          </button>
          <button onClick={createMockInbound}>Simulate Inbound</button>
        </div>
      </section>

      <section className="panel status-row">
        <span className={isRealtime ? "status good" : "status warn"}>
          {isRealtime ? "Realtime connected" : "Polling fallback active"}
        </span>
        <span>API: {apiBase}</span>
      </section>

      <section className="panel timeline">
        {filteredMessages.length === 0 ? (
          <p>No messages yet for this provider/chat.</p>
        ) : (
          filteredMessages.map((message) => (
            <article
              key={message._id ?? message.id}
              className={`message-card ${message.direction}`}
            >
              <div className="message-meta">
                <strong>{message.direction.toUpperCase()}</strong>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p>
                <strong>Decrypted:</strong> {message.decryptedText || "(empty)"}
              </p>
              <p>
                <strong>Delivery:</strong> {message.deliveryStatus ?? "unknown"}
              </p>
              <p>
                <strong>Transport (Raw/Ciphertext):</strong>{" "}
                {message.encryptedText || message.rawText || "(empty)"}
              </p>
              {message.attachments.length > 0 && (
                <div className="attachment-grid">
                  {message.attachments.map((item) => (
                    <img key={item.url} src={item.url} alt="attachment" />
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}

export default App;
