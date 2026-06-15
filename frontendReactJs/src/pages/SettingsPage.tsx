import { useAuth } from "@/context";
import KeyManager from "@/components/KeyManager";
import ConnectTelegram from "@/components/ConnectTelegram";
import ConnectWhatsApp from "@/components/ConnectWhatsApp";
import ConnectionsPanel from "@/components/ConnectionsPanel";
import type { Provider } from "@/types";

const providerMeta: Record<Provider, { label: string; icon: string }> = {
  telegram: { label: "Telegram", icon: "✈️" },
  whatsapp: { label: "WhatsApp", icon: "💬" },
};
const supportedProviders: Provider[] = ["telegram", "whatsapp"];

type Props = {
  localOwnerId: string;
  setLocalOwnerId: (v: string) => void;
  pubKeyB64: string | null;
  privJwk: unknown;
  fingerprint: string | null;
  keyBusy: boolean;
  keyError: string | null;
  generateAndRegisterKeypair: () => Promise<void>;
  setPrivJwk: (v: unknown) => void;
  connections: unknown[];
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
        <div style={{ padding: "0 16px 12px" }}>
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
        <div style={{ padding: "4px 16px 12px" }}>
          <ConnectTelegram
            token={auth.token}
            onConnected={() => {
              void loadConnectionsList();
              onConnectionsRefreshed();
            }}
          />
        </div>
      </div>

      {/* Connect WhatsApp */}
      <div className="settings-section">
        <div className="settings-section-title">Connect WhatsApp</div>
        <div style={{ padding: "4px 16px 12px" }}>
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
          deleteConnection={deleteConnection}
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
            className={toastsEnabled ? "btn-ghost btn-sm" : "btn-sm"}
            style={toastsEnabled ? { color: "var(--green)" } : {}}
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

      <div style={{ height: 24 }} />
    </div>
  );
}
