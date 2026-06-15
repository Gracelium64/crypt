import { useState } from "react";
import { apiFetch } from "../lib/api";
import { base64ToArrayBuffer, fingerprintFromPubKey } from "../lib/crypto";
import type { Provider } from "../types";

type ContactResult = {
  provider: Provider;
  providerChatId: string;
  username: string | null;
  displayName: string | null;
  publicKey: string | null;
  fingerprint: string | null;
};

type Props = {
  provider: Provider;
  onStartConversation: (chatId: string, provider: Provider) => void;
};

export default function FindContact({ provider: initialProvider, onStartConversation }: Props) {
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContactResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const username = query.replace(/^@/, "").trim();
    if (!username) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const resp = await apiFetch(
        `/provider/contact/search?provider=${encodeURIComponent(provider)}&username=${encodeURIComponent(username)}`,
      );
      const j = await resp.json();
      if (!resp.ok) {
        setError(j?.error ?? "User not found");
        return;
      }
      const d = j.data;
      let fingerprint: string | null = null;
      if (d.publicKey) {
        try {
          const ab = base64ToArrayBuffer(d.publicKey);
          fingerprint = await fingerprintFromPubKey(ab);
        } catch {
          // ignore fingerprint failure
        }
      }
      setResult({ ...d, fingerprint });
    } catch {
      setError("Search failed — check your connection");
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    provider === "telegram" ? "@username" : "phone number e.g. +4915207005318";

  return (
    <div className="panel find-contact">
      <h3>Find Contact</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["telegram", "whatsapp"] as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            className={provider === p ? "" : "btn-ghost btn-sm"}
            style={{ flex: 1 }}
            onClick={() => { setProvider(p); setQuery(""); setResult(null); setError(null); }}
          >
            {p === "telegram" ? "✈️ Telegram" : "💬 WhatsApp"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button onClick={() => void search()} disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 8, color: "#c0392b" }}>{error}</div>
      )}

      {result && (
        <div className="contact-result" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {result.username ? `@${result.username}` : result.displayName ?? result.providerChatId}
          </div>
          {result.displayName && result.username && (
            <div style={{ color: "#666", fontSize: 13 }}>{result.displayName}</div>
          )}
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            Chat ID: {result.providerChatId}
          </div>

          {result.publicKey ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "#555" }}>
                <strong>Key fingerprint:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {result.fingerprint ?? "(computing…)"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#27ae60",
                  marginTop: 2,
                }}
              >
                End-to-end encryption available
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#e67e22", marginTop: 6 }}>
              No public key registered — messages will not be encrypted
            </div>
          )}

          <button
            style={{ marginTop: 10 }}
            onClick={() =>
              onStartConversation(result.providerChatId, result.provider)
            }
          >
            Start conversation
          </button>
        </div>
      )}
    </div>
  );
}
