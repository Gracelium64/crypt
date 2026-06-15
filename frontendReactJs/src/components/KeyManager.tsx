import { useState } from "react";

type Props = {
  localOwnerId: string;
  setLocalOwnerId: (v: string) => void;
  pubKeyB64: string | null;
  privJwk: any | null;
  fingerprint: string | null;
  keyBusy: boolean;
  keyError: string | null;
  generateAndRegisterKeypair: () => Promise<void>;
  setPrivJwk: (v: any) => void;
  authUserEmail?: string | null;
};

export default function KeyManager(props: Props) {
  const {
    localOwnerId,
    setLocalOwnerId,
    pubKeyB64,
    privJwk,
    fingerprint,
    keyBusy,
    keyError,
    generateAndRegisterKeypair,
    authUserEmail,
  } = props;

  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (pubKeyB64) {
      setConfirming(true);
    } else {
      void generateAndRegisterKeypair();
    }
  };

  return (
    <div className="panel key-manager">
      <h3>Key Manager (E2E scaffold)</h3>
      <label>
        Your local ID
        <input
          type="text"
          value={localOwnerId}
          onChange={(e) => setLocalOwnerId(e.target.value)}
          placeholder={
            authUserEmail
              ? "Using account email"
              : "alice@example.com or alice_telegram"
          }
          disabled={!!authUserEmail}
        />
        {authUserEmail && (
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            Using account email as owner ID: {authUserEmail}
          </div>
        )}
      </label>

      <div className="key-actions">
        {confirming ? (
          <div style={{ fontSize: 13, color: "var(--red, #e53e3e)", marginBottom: 8 }}>
            This will replace your current keypair. Previous messages will become unreadable.
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setConfirming(false); void generateAndRegisterKeypair(); }}
                disabled={keyBusy}
              >
                Generate anyway
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={handleClick} disabled={keyBusy}>
            Generate New Keypair
          </button>
        )}
      </div>

      {keyError && (
        <div style={{ fontSize: 13, marginTop: 8, color: "var(--red, #e53e3e)" }}>
          {keyError}
        </div>
      )}

      {pubKeyB64 && (
        <div className="key-preview">
          <label>Public key (base64)</label>
          <textarea readOnly rows={3} value={pubKeyB64} />
          {fingerprint && (
            <div className="fingerprint">Fingerprint: {fingerprint}</div>
          )}
          {privJwk && (
            <div className="private-status">Private key stored locally</div>
          )}
        </div>
      )}
    </div>
  );
}
