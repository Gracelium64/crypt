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
  return (
    <>
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
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={connectionsBusy}
              onClick={async () => {
                if (!confirm(`Unlink ${conn.provider}?`)) return;
                try {
                  await deleteConnection(conn._id);
                } catch {
                  alert("Failed to unlink");
                }
              }}
            >
              Unlink
            </button>
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
