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

import { useState } from "react";
import "../styles/components/link-wizard.css";

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

  const [copied, setCopied] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

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
      <div className="lw-btn-row">
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
          <div className="lw-code-row">
            <strong className="lw-code-text">{`LINK ${linkCode}`}</strong>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`LINK ${linkCode}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={cancelLink}>Close</button>
          </div>

          <div className="lw-expiry">
            <small>
              Expires:{" "}
              {linkExpiresAt ? new Date(linkExpiresAt).toLocaleString() : "-"}
            </small>
          </div>

          <div className="lw-status">
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
                <div className="lw-deep-row">
                  <button
                    onClick={() => {
                      setDeepLinkError(null);
                      const preferMobile = isMobileDevice();
                      const toOpen = preferMobile
                        ? (linkDeepMobile ?? linkDeepWeb)
                        : (linkDeepWeb ?? linkDeepMobile);
                      if (!toOpen) {
                        setDeepLinkError("No deep link available for this provider");
                        return;
                      }
                      // tg:// and similar custom schemes need location.href on
                      // iOS — window.open with a custom scheme gets blocked.
                      // https:// links open in a new tab as usual.
                      if (toOpen.startsWith("http")) {
                        window.open(toOpen, "_blank");
                      } else {
                        window.location.href = toOpen;
                      }
                    }}
                  >
                    Open in app/web
                  </button>
                  <button
                    onClick={() => {
                      setDeepLinkError(null);
                      if (linkDeepWeb) window.open(linkDeepWeb, "_blank");
                      else setDeepLinkError("No web deep link available");
                    }}
                  >
                    Open web
                  </button>
                  {deepLinkError && (
                    <span className="lw-deep-error">
                      {deepLinkError}
                    </span>
                  )}
                  <small className="lw-tip">
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
