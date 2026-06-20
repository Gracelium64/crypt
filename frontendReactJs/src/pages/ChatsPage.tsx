import type { ConversationSummary, Provider } from "@/types";
import "../styles/chat.css";
import "../styles/components/timeline.css";

const trimPreview = (text: string) =>
  text.length <= 96 ? text : `${text.slice(0, 93)}...`;

type Props = {
  conversations: ConversationSummary[];
  conversationsLoading: boolean;
  hasConnections: boolean;
  selectedChatId: string;
  onOpenConversation: (chatId: string, provider?: Provider) => void;
  onGoToSettings: () => void;
};

export default function ChatsPage({
  conversations,
  conversationsLoading,
  hasConnections,
  selectedChatId,
  onOpenConversation,
  onGoToSettings,
}: Props) {
  if (conversations.length === 0) {
    if (conversationsLoading) {
      return (
        <div className="empty-screen">
          <span className="spinner spinner--lg" />
        </div>
      );
    }
    return (
      <div className="empty-screen">
        <div className="empty-icon">💬</div>
        <h3>No chats yet</h3>
        {!hasConnections && (
          <>
            <p>Link your Telegram or WhatsApp account in Settings to see conversations here.</p>
            <button type="button" onClick={onGoToSettings}>Go to Settings</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="conv-list">
      {conversations.map((conv) => (
        <button
          key={`${conv.provider}:${conv.chatId}`}
          type="button"
          className={`conv-item${conv.chatId === selectedChatId ? " active" : ""}`}
          onClick={() => onOpenConversation(conv.chatId, conv.provider)}
        >
          <div className="conv-avatar">
            {(conv.counterpartName || conv.counterpart || conv.chatId || "?").charAt(0).toUpperCase()}
          </div>
          <div className="conv-body">
            <div className="conv-top">
              <span className={`conv-name${conv.lastDirection === "inbound" ? " conv-name--unread" : ""}`}>{conv.counterpartName || conv.counterpart || conv.chatId}</span>
              {conv.lastMessageAt && (
                <span className="conv-time">
                  {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <div className="conv-row">
              <span className="conv-preview">{trimPreview(conv.lastMessagePreview ?? "")}</span>
              <div className="conv-row-meta">
                {conv.lastDirection === "inbound" && <span className="conv-unread-dot" />}
                <span className={`conv-badge ${conv.securityState}`}>{conv.securityState}</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
