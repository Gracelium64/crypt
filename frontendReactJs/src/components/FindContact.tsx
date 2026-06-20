import { useState } from "react";
import { apiFetch } from "../lib/api";
import "../styles/components/find-contact.css";
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
  token: string | null;
};

export default function FindContact({
  provider: initialProvider,
  onStartConversation,
  token,
}: Props) {
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
        {},
        token,
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
        } catch (err) {
          console.error("[FindContact] fingerprint failed:", err);
        }
      }
      setResult({ ...d, fingerprint });
    } catch (err) {
      console.error("[FindContact] search failed:", err);
      setError("Search failed — check your connection");
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    provider === "telegram" ? "@username" : "phone number e.g. +4915200000000";

  return (
    <div className="panel find-contact">
      <h3>Find Contact</h3>

      <div className="fc-provider-tabs">
        {(["telegram", "whatsapp"] as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            className={provider === p ? "fc-provider-btn" : "btn-ghost btn-sm fc-provider-btn"}
            onClick={() => {
              setProvider(p);
              setQuery("");
              setResult(null);
              setError(null);
            }}
          >
            {p === "telegram" ? "✈️ Telegram" : "💬 WhatsApp"}
          </button>
        ))}
      </div>

      <div className="fc-search-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder={placeholder}
          className="fc-search-input"
        />
        <button onClick={() => void search()} disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <div className="fc-error">{error}</div>}

      {result && (
        <div className="contact-result fc-result">
          <div className="fc-result-name">
            {result.username
              ? `@${result.username}`
              : (result.displayName ?? result.providerChatId)}
          </div>
          {result.displayName && result.username && (
            <div className="fc-result-display">
              {result.displayName}
            </div>
          )}
          <div className="fc-result-chatid">
            Chat ID: {result.providerChatId}
          </div>

          {result.publicKey ? (
            <div className="fc-key-info">
              <div className="fc-fingerprint-label">
                <strong>Key fingerprint:</strong>{" "}
                <span className="fc-fingerprint-mono">
                  {result.fingerprint ?? "(computing…)"}
                </span>
              </div>
              <div className="fc-e2e-available">
                End-to-end encryption available
              </div>
            </div>
          ) : (
            <div className="fc-no-key">
              No public key registered — messages will not be encrypted
            </div>
          )}

          <button
            className="fc-start-btn"
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
