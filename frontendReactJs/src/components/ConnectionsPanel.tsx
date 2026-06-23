import { useState } from "react";
import type { Connection } from "../types";
import "../styles/components/connections-panel.css";

type Props = {
  connections: Connection[];
  connectionsBusy: boolean;
  loadConnectionsList: () => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
};

const providerIcon: Record<string, string> = {
  telegram: "🔵",
  whatsapp: "🟢",
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

  const pendingConn = confirmUnlinkId
    ? connections.find((c) => c._id === confirmUnlinkId)
    : null;

  return (
    <>
      {unlinkError && (
        <div className="conn-error">
          {unlinkError}
        </div>
      )}
      {connections.length === 0 ? (
        <div className="settings-row">
          <span className="conn-empty-text">
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
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={connectionsBusy}
              onClick={() => setConfirmUnlinkId(conn._id)}
            >
              Unlink
            </button>
          </div>
        ))
      )}
      <div className="settings-row conn-refresh-row">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void loadConnectionsList()}
          disabled={connectionsBusy}
        >
          Refresh
        </button>
      </div>

      {pendingConn && (
        <div className="conn-modal-backdrop" onClick={() => setConfirmUnlinkId(null)}>
          <div className="conn-modal" onClick={(e) => e.stopPropagation()}>
            <p className="conn-modal-msg">
              Are you sure you want to unlink{" "}
              <strong>{pendingConn.provider.charAt(0).toUpperCase() + pendingConn.provider.slice(1)}</strong>?
            </p>
            <div className="conn-modal-actions">
              <button
                type="button"
                className="btn-danger"
                disabled={connectionsBusy}
                onClick={() => void handleUnlink(pendingConn._id)}
              >
                Yes, unlink
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmUnlinkId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
