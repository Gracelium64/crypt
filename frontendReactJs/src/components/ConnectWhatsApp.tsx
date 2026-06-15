import useLink from "@/hooks/useLink";

interface Props {
  token?: string | null;
  onConnected?: () => void;
}

export default function ConnectWhatsApp({ token, onConnected }: Props) {
  const {
    linkCode,
    linkStatus,
    linkDeepMobile,
    linkDeepWeb,
    linkBusy,
    startLink,
    cancelLink,
  } = useLink(token, onConnected);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong style={{ fontSize: 18 }}>{`LINK ${linkCode}`}</strong>
          <button
            type="button"
            className="btn-sm"
            onClick={() => navigator.clipboard?.writeText(`LINK ${linkCode}`)}
          >
            Copy
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={cancelLink}>
            Cancel
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
          Send this code in WhatsApp to the business number to link your account.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {linkDeepMobile && (
            <button type="button" className="btn-sm" onClick={() => { window.location.href = linkDeepMobile!; }}>
              Open WhatsApp app
            </button>
          )}
          {linkDeepWeb && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => window.open(linkDeepWeb!, "_blank")}>
              Open WhatsApp web
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
          Waiting for you to send the code…
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={() => void startLink("whatsapp")}
        disabled={linkBusy}
      >
        {linkBusy ? "Generating…" : "Generate link code"}
      </button>
      <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
        Generates a code you send to the WhatsApp business number to link your account.
      </div>
    </div>
  );
}
