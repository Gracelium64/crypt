import { useState } from "react";

type Conn = any;

type Props = {
  connections: Conn[];
  connectionsBusy: boolean;
  loadConnectionsList: () => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
};

const providerIcon: Record<string, string> = {
  telegram: "✈️",
  whatsapp: "💬",
};

export default function ConnectionsPanel({ connections, connectionsBusy, loadConnectionsList, deleteConnection }: Props) {
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const handleUnlink = async (id: string) => {
    setUnlinkError(null);
    setConfirmUnlinkId(null);
    try {
      await deleteConnection(id);
    } catch (err) {
      console.error("[ConnectionsPanel] deleteConnection failed:", err);
      setUnlinkError("Failed to unlink — please try again");
    }
  };

  return (
    <>
      {unlinkError && (
        <div style={{ color: "var(--red, #e53e3e)", fontSize: 13, padding: "4px 16px" }}>
          {unlinkError}
        </div>
      )}
      {connections.length === 0 ? (
        <div className="settings-row">
          <span style={{ color: "var(--muted)", fontSize: 14 }}>
            {connectionsBusy ? "Loading…" : "No provider connections yet."}
          </span>
        </div>
      ) : (
        connections.map((conn) => (
          <div key={conn._id} className="conn-item">
            <div className="conn-avatar">{providerIcon[conn.provider] ?? "🔗"}</div>
            <div className="conn-info">
              <strong>{conn.displayName || conn.username || conn.providerChatId}</strong>
              <span>{conn.provider} · {conn.providerChatId}</span>
            </div>
            {confirmUnlinkId === conn._id ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Unlink?</span>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={connectionsBusy}
                  onClick={() => void handleUnlink(conn._id)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setConfirmUnlinkId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={connectionsBusy}
                onClick={() => setConfirmUnlinkId(conn._id)}
              >
                Unlink
              </button>
            )}
          </div>
        ))
      )}
      <div className="settings-row" style={{ justifyContent: "center" }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void loadConnectionsList()}
          disabled={connectionsBusy}
        >
          Refresh
        </button>
      </div>
    </>
  );
}
