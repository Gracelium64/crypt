type Props = {
  localOwnerId: string;
  setLocalOwnerId: (v: string) => void;
  pubKeyB64: string | null;
  privJwk: any | null;
  fingerprint: string | null;
  qrDataUrl: string | null;
  keyBusy: boolean;
  generateKeypair: () => Promise<void>;
  registerPublicKey: () => Promise<void>;
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
    qrDataUrl,
    keyBusy,
    generateKeypair,
    registerPublicKey,
    setPrivJwk,
    authUserEmail,
  } = props;

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
        <button
          type="button"
          onClick={() => void generateKeypair()}
          disabled={keyBusy}
        >
          Generate Keypair
        </button>
        <button
          type="button"
          onClick={() => void registerPublicKey()}
          disabled={!pubKeyB64}
        >
          Register Public Key
        </button>
        <button
          type="button"
          onClick={() => {
            const v = localStorage.getItem(`crypt:priv:${localOwnerId}`);
            if (!v) return alert("No private key in local storage for this ID");
            try {
              const jwk = JSON.parse(v);
              setPrivJwk(jwk);
              alert("Loaded private key from local storage");
            } catch {
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
          {qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: 140 }} />}
          {privJwk && (
            <div className="private-status">Private key stored locally</div>
          )}
        </div>
      )}
    </div>
  );
}
