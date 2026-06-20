import { useState } from "react";
import type { EcdhPrivateJwk } from "../lib/crypto";
import "../styles/components/key-manager.css";

type Props = {
  localOwnerId: string;
  setLocalOwnerId: (v: string) => void;
  pubKeyB64: string | null;
  privJwk: EcdhPrivateJwk | null;
  fingerprint: string | null;
  keyBusy: boolean;
  keyError: string | null;
  generateAndRegisterKeypair: () => Promise<void>;
  setPrivJwk: (v: EcdhPrivateJwk | null) => void;
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
          <div className="key-auth-hint">
            Using account email as owner ID: {authUserEmail}
          </div>
        )}
      </label>

      <div className="key-actions">
        {confirming ? (
          <div className="key-confirm-warning">
            This will replace your current keypair. Previous messages will become unreadable.
            <div className="key-confirm-actions">
              <button
                type="button"
                onClick={() => { setConfirming(false); void generateAndRegisterKeypair(); }}
                disabled={keyBusy}
              >
                {keyBusy ? <span className="spinner" /> : "Generate anyway"}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={handleClick} disabled={keyBusy}>
            {keyBusy ? <span className="spinner" /> : "Generate New Keypair"}
          </button>
        )}
      </div>

      {keyError && (
        <div className="key-error">
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
