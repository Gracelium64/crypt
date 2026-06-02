import { useState } from "react";
import QRCode from "qrcode";
import { apiFetch } from "../lib/api";
import { base64ToArrayBuffer, fingerprintFromPubKey } from "../lib/crypto";
import type { ConversationSummary } from "../types";

type Props = {
  selectedConversation: ConversationSummary | null;
};

export default function SelectedConversationPanel({
  selectedConversation,
}: Props) {
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyOwner, setVerifyOwner] = useState<string | null>(null);
  const [verifyPubKey, setVerifyPubKey] = useState<string | null>(null);
  const [verifyFingerprint, setVerifyFingerprint] = useState<string | null>(
    null,
  );
  const [verifyQr, setVerifyQr] = useState<string | null>(null);

  const startVerify = async () => {
    if (!selectedConversation) return;
    setVerifyOpen(true);
    setVerifyOwner(null);
    setVerifyPubKey(null);
    setVerifyFingerprint(null);
    setVerifyQr(null);
    try {
      const resp = await apiFetch(
        `/provider/resolve?provider=${encodeURIComponent(
          selectedConversation.provider,
        )}&chatId=${encodeURIComponent(selectedConversation.chatId)}`,
      );
      if (!resp.ok) throw new Error("resolve failed");
      const j = await resp.json();
      const ownerEmail = j.data?.email ?? null;
      setVerifyOwner(ownerEmail ?? selectedConversation.chatId);
      if (ownerEmail) {
        const kresp = await apiFetch(`/keys/${encodeURIComponent(ownerEmail)}`);
        if (kresp.ok) {
          const kj = await kresp.json();
          const pub = kj?.data?.publicKey;
          if (pub) {
            setVerifyPubKey(pub);
            const ab = base64ToArrayBuffer(pub);
            const fp = await fingerprintFromPubKey(ab);
            setVerifyFingerprint(fp);
            const qr = await QRCode.toDataURL(`${ownerEmail}:${pub}`);
            setVerifyQr(qr);
          }
        }
      }
    } catch (_err) {
      console.error(_err);
      alert("Failed to load verification info");
    }
  };

  return (
    <div className="selected-actions">
      <button
        type="button"
        className="ghost-button"
        onClick={() => {
          /* This button is just a mode toggle in the header */
        }}
        disabled={!selectedConversation}
      >
        Start secure chat
      </button>

      <button
        type="button"
        className="ghost-button"
        onClick={startVerify}
        disabled={!selectedConversation}
      >
        Verify
      </button>

      <div style={{ fontSize: 12, color: "#666" }}>
        Open your provider client to send the LINK code.
      </div>

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
                    if (!verifyOwner) return;
                    const key = `crypt:verified:${verifyOwner}`;
                    localStorage.setItem(key, "1");
                    alert("Marked as verified locally");
                  }}
                >
                  Mark verified (local)
                </button>
                <button onClick={() => setVerifyOpen(false)}>Close</button>
              </div>
            </div>
          ) : (
            <div>No public key found for this contact.</div>
          )}
        </div>
      )}
    </div>
  );
}
