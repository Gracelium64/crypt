type Props = {
  authUserEmail?: string | null;
  pubKeyB64?: string | null;
  keyRegistered: boolean;
  connectionsCount: number;
  generateKeypair: () => Promise<void>;
  registerPublicKey: () => Promise<void>;
  startLink: (provider: "telegram" | "whatsapp") => Promise<void>;
  keyBusy: boolean;
  linkBusy: boolean;
};

export default function OnboardingPanel(props: Props) {
  const {
    authUserEmail,
    pubKeyB64,
    keyRegistered,
    connectionsCount,
    generateKeypair,
    registerPublicKey,
    startLink,
    keyBusy,
    linkBusy,
  } = props;

  return (
    <div className="panel onboarding-panel">
      <h3>Onboarding Checklist</h3>
      <ol>
        <li>
          <strong>Signed in:</strong>{" "}
          {authUserEmail ? (
            <span style={{ color: "#6fdc97" }}>{authUserEmail}</span>
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
          {connectionsCount > 0 ? (
            <span style={{ color: "#6fdc97" }}>
              {connectionsCount} connection(s)
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
          disabled={linkBusy}
        >
          Link WhatsApp
        </button>
        <button
          onClick={() => void startLink("telegram")}
          aria-label="Start Telegram link"
          disabled={linkBusy}
        >
          Link Telegram
        </button>
      </div>
    </div>
  );
}
