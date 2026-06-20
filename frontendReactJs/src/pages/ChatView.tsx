import { useRef, useState } from "react";
import Timeline from "@/components/Timeline";
import { deriveAesGcmKey } from "@/lib/crypto";
import type { EcdhPrivateJwk } from "@/lib/crypto";
import type { ChatMessage, ConversationSummary, Provider } from "@/types";

const providerMeta: Record<Provider, { label: string }> = {
  telegram: { label: "Telegram" },
  whatsapp: { label: "WhatsApp" },
};

type Props = {
  provider: Provider;
  selectedConversation: ConversationSummary | null;
  selectedChatId: string;
  messages: ChatMessage[];
  isRealtime: boolean;
  privJwk: EcdhPrivateJwk | null;
  localOwnerId: string;
  text: string;
  setText: (t: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  filePreview: string | null;
  replyMode: "secure" | "plain";
  setReplyMode: (m: "secure" | "plain") => void;
  sendBusy: boolean;
  selectedProviderStatus: { backendReady: boolean } | null;
  onBack: () => void;
  onDelete: () => void;
  onSend: () => void;
};

export default function ChatView({
  provider,
  selectedConversation,
  selectedChatId,
  messages,
  isRealtime,
  privJwk,
  localOwnerId,
  text,
  setText,
  file,
  setFile,
  filePreview,
  replyMode,
  setReplyMode,
  sendBusy,
  selectedProviderStatus,
  onBack,
  onDelete,
  onSend,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <header className="app-header">
        <button className="header-back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <div className="header-title">
          <strong>
            {selectedConversation?.counterpartName || selectedConversation?.counterpart || selectedChatId}
          </strong>
          <span>{providerMeta[provider].label}</span>
        </div>
        <span className={`header-status${isRealtime ? " live" : ""}`} title={isRealtime ? "Live" : "Polling"} />
        {confirmingDelete ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>Delete?</span>
            <button
              className="btn-sm btn-danger"
              type="button"
              onClick={() => { setConfirmingDelete(false); onDelete(); }}
            >
              Yes
            </button>
            <button
              className="btn-ghost btn-sm"
              type="button"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="header-action btn-danger"
            type="button"
            title="Delete conversation"
            onClick={() => setConfirmingDelete(true)}
            style={{ fontSize: 16 }}
          >
            🗑
          </button>
        )}
      </header>

      <div className="chat-screen">
        <div className="timeline">
          <Timeline
            messages={messages}
            privJwk={privJwk}
            localOwnerId={localOwnerId}
            deriveAesGcmKey={deriveAesGcmKey}
            counterpartName={selectedConversation?.counterpartName}
          />
        </div>

        <div className="composer">
          <div className="composer-toolbar">
            <div className="composer-mode">
              <button
                type="button"
                className={`mode-btn${replyMode === "secure" ? " active" : ""}`}
                onClick={() => setReplyMode("secure")}
              >
                Secure
              </button>
              <button
                type="button"
                className={`mode-btn${replyMode === "plain" ? " active" : ""}`}
                onClick={() => setReplyMode("plain")}
              >
                Plain
              </button>
            </div>
          </div>

          {file && (
            <div className="file-preview">
              {filePreview && <img src={filePreview} alt="" />}
              <span>{file.name} ({Math.round(file.size / 1024)} KB)</span>
              <button className="btn-danger btn-sm" type="button" onClick={removeFile}>✕</button>
            </div>
          )}

          <div className="composer-row">
            <label className="composer-attach" style={{ cursor: "pointer" }} title="Attach image">
              📎
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={!selectedChatId}
              />
            </label>
            <textarea
              className="composer-input"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={selectedChatId ? "Type a message…" : "Pick a chat first"}
              disabled={!selectedChatId}
            />
            <button
              className="composer-send"
              type="button"
              onClick={onSend}
              disabled={sendBusy || !selectedChatId || (!text && !file) || !selectedProviderStatus?.backendReady}
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
