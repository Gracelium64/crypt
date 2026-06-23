import { useState } from "react";
import { useAuth } from "@/context";
import "../styles/settings.css";
import KeyManager from "@/components/KeyManager";
import ConnectTelegram from "@/components/ConnectTelegram";
import ConnectWhatsApp from "@/components/ConnectWhatsApp";
import ConnectionsPanel from "@/components/ConnectionsPanel";
import { apiFetch } from "@/lib/api";
import type { EcdhPrivateJwk } from "@/lib/crypto";
import type { Connection, Provider } from "@/types";

const providerMeta: Record<Provider, { label: string; icon: string }> = {
  telegram: { label: "Telegram", icon: "🔵" },
  whatsapp: { label: "WhatsApp", icon: "🟢" },
};
const supportedProviders: Provider[] = ["telegram", "whatsapp"];

type Props = {
  localOwnerId: string;
  setLocalOwnerId: (v: string) => void;
  pubKeyB64: string | null;
  privJwk: EcdhPrivateJwk | null;
  fingerprint: string | null;
  keyBusy: boolean;
  keyError: string | null;
  generateAndRegisterKeypair: (password: string) => Promise<void>;
  setPrivJwk: (v: EcdhPrivateJwk | null) => void;
  connections: Connection[];
  connectionsBusy: boolean;
  loadConnectionsList: () => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  providerStatuses: Array<{ provider: string; readiness: string }>;
  toastsEnabled: boolean;
  toggleToasts: () => void;
  onConnectionsRefreshed: () => void;
};

export default function SettingsPage({
  localOwnerId,
  setLocalOwnerId,
  pubKeyB64,
  privJwk,
  fingerprint,
  keyBusy,
  keyError,
  generateAndRegisterKeypair,
  setPrivJwk,
  connections,
  connectionsBusy,
  loadConnectionsList,
  deleteConnection,
  providerStatuses,
  toastsEnabled,
  toggleToasts,
  onConnectionsRefreshed,
}: Props) {
  const auth = useAuth();
  const [telegramRefreshKey, setTelegramRefreshKey] = useState(0);

  const handleDeleteConnection = async (id: string) => {
    const conn = connections.find((c) => c._id === id);
    await deleteConnection(id);
    if (conn?.provider === "telegram") {
      try {
        await apiFetch("/telegram/direct/session", { method: "DELETE" }, auth.token);
      } catch { /* non-fatal — MTProto session may already be gone */ }
      setTelegramRefreshKey((k) => k + 1);
    }
  };

  const handleTelegramDisconnected = async () => {
    const telegramConns = connections.filter((c) => c.provider === "telegram");
    for (const conn of telegramConns) {
      try { await deleteConnection(conn._id); } catch { /* non-fatal */ }
    }
    await loadConnectionsList();
  };

  return (
    <div className="settings-screen">
      {/* Account */}
      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>{auth.user?.displayName || auth.user?.email}</strong>
            <span>{auth.user?.email}</span>
          </div>
          <button className="btn-ghost btn-sm" type="button" onClick={() => void auth.logout()}>
            Sign out
          </button>
        </div>
      </div>

      {/* Security & Keys */}
      <div className="settings-section">
        <div className="settings-section-title">Security & Keys</div>
        <div className="sp-key-section">
          <KeyManager
            localOwnerId={localOwnerId}
            setLocalOwnerId={setLocalOwnerId}
            pubKeyB64={pubKeyB64}
            privJwk={privJwk}
            fingerprint={fingerprint}
            keyBusy={keyBusy}
            keyError={keyError}
            generateAndRegisterKeypair={generateAndRegisterKeypair}
            setPrivJwk={setPrivJwk}
            authUserEmail={auth.user?.email}
          />
        </div>
      </div>

      {/* Connect Telegram */}
      <div className="settings-section">
        <div className="settings-section-title">Connect Telegram</div>
        <div className="sp-tg-desc">
          <strong>Phone code</strong> — enter your number and confirm the code that appears in your Telegram app (look for a message from the "Telegram" account, not SMS). If no code arrives, try <strong>QR code</strong> — you will need a second device to scan it. As a last resort, <strong>Via CryptBot</strong> links your account reliably but routes messages through the bot instead of direct user-to-user.
        </div>
        <div className="sp-tg-body">
          <ConnectTelegram
            token={auth.token}
            refreshKey={telegramRefreshKey}
            onConnected={() => {
              void loadConnectionsList();
              onConnectionsRefreshed();
            }}
            onDisconnected={handleTelegramDisconnected}
          />
        </div>
      </div>

      {/* Connect WhatsApp */}
      <div className="settings-section">
        <div className="settings-section-title">Connect WhatsApp</div>
        <div className="sp-wa-body">
          <ConnectWhatsApp
            token={auth.token}
            onConnected={() => {
              void loadConnectionsList();
              onConnectionsRefreshed();
            }}
          />
        </div>
      </div>

      {/* Connections */}
      <div className="settings-section">
        <div className="settings-section-title">Connections</div>
        <ConnectionsPanel
          connections={connections}
          connectionsBusy={connectionsBusy}
          loadConnectionsList={loadConnectionsList}
          deleteConnection={handleDeleteConnection}
        />
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <div className="settings-section-title">Notifications</div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Toast messages</strong>
            <span>Brief pop-up notifications</span>
          </div>
          <button
            type="button"
            className={toastsEnabled ? `btn-ghost btn-sm sp-toast-on` : "btn-sm"}
            onClick={toggleToasts}
          >
            {toastsEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Provider Status */}
      <div className="settings-section">
        <div className="settings-section-title">Provider Status</div>
        {supportedProviders.map((p) => {
          const st = providerStatuses.find((s) => s.provider === p);
          const ready = st?.readiness === "ready";
          return (
            <div key={p} className="settings-row">
              <div className="settings-row-label">
                <strong>{providerMeta[p].icon} {providerMeta[p].label}</strong>
                <span>{ready ? "Backend ready" : "Needs setup — add credentials"}</span>
              </div>
              <span className={`chip ${ready ? "green" : "warn"}`}>{ready ? "✓" : "!"}</span>
            </div>
          );
        })}
      </div>

      <div className="sp-spacer" />
    </div>
  );
}
