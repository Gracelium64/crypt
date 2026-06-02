type Conn = any;

type Props = {
  connections: Conn[];
  connectionsBusy: boolean;
  loadConnectionsList: () => Promise<void>;
  editingConnId: string | null;
  setEditingConnId: (id: string | null) => void;
  editingTokenValue: string;
  setEditingTokenValue: (v: string) => void;
  editingPhoneNumberId: string;
  setEditingPhoneNumberId: (v: string) => void;
  submitConnectionToken: (connId: string) => Promise<void>;
};

export default function ConnectionsPanel(props: Props) {
  const {
    connections,
    connectionsBusy,
    loadConnectionsList,
    editingConnId,
    setEditingConnId,
    editingTokenValue,
    setEditingTokenValue,
    editingPhoneNumberId,
    setEditingPhoneNumberId,
    submitConnectionToken,
  } = props;

  return (
    <div className="panel connections-panel">
      <h3>Connections</h3>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          onClick={() => void loadConnectionsList()}
          disabled={connectionsBusy}
        >
          Refresh
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <small style={{ color: "#666" }}>
            Connections listed for your account.
          </small>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="empty-state">
          No provider connections for this account.
        </div>
      ) : (
        connections.map((conn) => (
          <div
            key={conn._id}
            style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div>
                <strong>{conn.provider}</strong>
                <div style={{ fontSize: 12 }}>{conn.providerChatId}</div>
                <div style={{ fontSize: 12 }}>{conn.displayName}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {editingConnId === conn._id ? (
                  <button
                    onClick={() => {
                      setEditingConnId(null);
                      setEditingTokenValue("");
                      setEditingPhoneNumberId("");
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditingConnId(conn._id);
                      setEditingTokenValue("");
                      setEditingPhoneNumberId(conn.meta?.phoneNumberId ?? "");
                    }}
                  >
                    Set Token
                  </button>
                )}
              </div>
            </div>

            {editingConnId === conn._id && (
              <div style={{ marginTop: 8 }}>
                <label>
                  Provider token
                  <input
                    value={editingTokenValue}
                    onChange={(e) => setEditingTokenValue(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
                {conn.provider === "whatsapp" && (
                  <label>
                    Phone number id (optional)
                    <input
                      value={editingPhoneNumberId}
                      onChange={(e) => setEditingPhoneNumberId(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </label>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => void submitConnectionToken(conn._id)}>
                    Save token
                  </button>
                  <button
                    onClick={() => {
                      setEditingConnId(null);
                      setEditingTokenValue("");
                      setEditingPhoneNumberId("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
