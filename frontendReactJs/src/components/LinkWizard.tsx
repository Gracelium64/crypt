type LinkStatus = {
  completed: boolean;
  providerChatId?: string;
  providerDisplayName?: string;
};

type Props = {
  startLink: (provider: "telegram" | "whatsapp") => Promise<void>;
  linkCode: string | null;
  linkProvider: "telegram" | "whatsapp" | null;
  linkExpiresAt: string | null;
  linkStatus: LinkStatus | null;
  linkDeepMobile: string | null;
  linkDeepWeb: string | null;
  linkBusy: boolean;
  cancelLink: () => void;
};

export default function LinkWizard(props: Props) {
  const {
    startLink,
    linkCode,
    linkProvider,
    linkExpiresAt,
    linkStatus,
    linkDeepMobile,
    linkDeepWeb,
    linkBusy,
    cancelLink,
  } = props;

  const isMobileDevice = () =>
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(
      navigator.userAgent || "",
    );

  return (
    <div className="panel link-wizard">
      <h3>Link Provider (no credentials)</h3>
      <p>
        Generate a short link code and send it to the hosted bot/number in your
        provider client (Telegram or WhatsApp) to link this browser session to
        the hosted connector.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => void startLink("telegram")} disabled={linkBusy}>
          Link Telegram
        </button>
        <button onClick={() => void startLink("whatsapp")} disabled={linkBusy}>
          Link WhatsApp
        </button>
      </div>

      {linkCode && (
        <div className="link-status">
          <label>Link code</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 18 }}>{`LINK ${linkCode}`}</strong>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`LINK ${linkCode}`);
                alert("Copied link code to clipboard");
              }}
            >
              Copy
            </button>
            <button onClick={cancelLink}>Close</button>
          </div>

          <div style={{ marginTop: 8 }}>
            <small>
              Expires:{" "}
              {linkExpiresAt ? new Date(linkExpiresAt).toLocaleString() : "-"}
            </small>
          </div>

          <div style={{ marginTop: 8 }}>
            {linkStatus?.completed ? (
              <div>
                <strong>Linked</strong>
                <div>Chat ID: {linkStatus.providerChatId}</div>
                <div>Provider: {linkProvider ?? "(unknown)"}</div>
                <div>
                  Display: {linkStatus.providerDisplayName ?? "(unknown)"}
                </div>
              </div>
            ) : (
              <div>
                Waiting for the user to send the code in the provider client...
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      const preferMobile = isMobileDevice();
                      const toOpen = preferMobile
                        ? (linkDeepMobile ?? linkDeepWeb)
                        : (linkDeepWeb ?? linkDeepMobile);
                      if (toOpen) window.open(toOpen, "_blank");
                      else alert("No deep link available for this provider");
                    }}
                  >
                    Open in app/web
                  </button>
                  <button
                    onClick={() => {
                      if (linkDeepWeb) window.open(linkDeepWeb, "_blank");
                      else alert("No web deep link available");
                    }}
                  >
                    Open web
                  </button>
                  <small style={{ alignSelf: "center", color: "#888" }}>
                    Tip: Mobile devices will open the provider app when
                    available.
                  </small>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
