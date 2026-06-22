import useLink from "@/hooks/useLink";
import "../styles/components/connect-whatsapp.css";

interface Props {
  token?: string | null;
  onConnected?: () => void;
}

export default function ConnectWhatsApp({ token, onConnected }: Props) {
  const { linkCode, linkStatus, linkDeepWeb, linkBusy, startLink, cancelLink } =
    useLink(token, onConnected);

  if (linkStatus?.completed) {
    return (
      <div className="settings-row">
        <div className="settings-row-label">
          <strong>{linkStatus.providerDisplayName ?? "Connected"}</strong>
          <span>WhatsApp linked</span>
        </div>
        <span className="chip green">Active</span>
      </div>
    );
  }

  if (linkCode) {
    return (
      <div className="cwa-link-container">
        <div className="cwa-code-row">
          <strong className="cwa-code-text">{`LINK ${linkCode}`}</strong>
          <button
            type="button"
            className="btn-sm"
            onClick={() => navigator.clipboard?.writeText(`LINK ${linkCode}`)}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={cancelLink}
          >
            Cancel
          </button>
        </div>
        <div className="cwa-hint">
          Send this code in WhatsApp to the business number to link your
          account.
        </div>
        <div className="cwa-deep-actions">
          {linkDeepWeb && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => window.open(linkDeepWeb!, "_blank")}
            >
              Open WhatsApp
            </button>
          )}
        </div>
        <div className="cwa-hint">Waiting for you to send the code…</div>
      </div>
    );
  }

  return (
    <div className="cwa-container">
      <button
        type="button"
        onClick={() => void startLink("whatsapp")}
        disabled={linkBusy}
      >
        {linkBusy ? "Generating…" : "Generate link code"}
      </button>
      <div className="cwa-hint">
        Generates a code you send to the WhatsApp business number to link your
        account.
      </div>
      <div className="cwa-hint">
        Note: Crypt is in prototype stage with limited WhatsApp Cloud API
        access. To gain access to WhatsApp Link contact admin.
      </div>
    </div>
  );
}
