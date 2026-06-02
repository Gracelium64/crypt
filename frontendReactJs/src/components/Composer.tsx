import type { ChangeEvent } from "react";

type ConversationSummary = {
  chatId: string;
  counterpart?: string;
};

type ProviderStatus = {
  backendReady: boolean;
};

type Props = {
  text: string;
  setText: (v: string) => void;
  imageUrl: string;
  setImageUrl: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  filePreview: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  removeFile: () => void;
  replyMode: "secure" | "plain";
  busy: boolean;
  sendMessage: () => Promise<void>;
  selectedConversation: ConversationSummary | null;
  selectedProviderStatus: ProviderStatus | null;
};

export default function Composer({
  text,
  setText,
  imageUrl,
  setImageUrl,
  file,
  setFile,
  filePreview,
  fileInputRef,
  removeFile,
  replyMode,
  busy,
  sendMessage,
  selectedConversation,
  selectedProviderStatus,
}: Props) {
  return (
    <div>
      <label>
        Message text
        <textarea
          rows={3}
          value={text}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setText(event.target.value)
          }
          placeholder={
            selectedConversation
              ? "Type a reply for the selected thread"
              : "Pick a chat first"
          }
          disabled={!selectedConversation}
        />
      </label>

      <label>
        Image URL (optional)
        <input
          type="url"
          value={imageUrl}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setImageUrl(event.target.value)
          }
          placeholder="https://..."
          disabled={!selectedConversation}
        />
      </label>

      <label>
        Upload Image
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={!selectedConversation}
        />
      </label>

      {file && (
        <div className="file-preview-container">
          {filePreview && (
            <img
              src={filePreview}
              alt="upload preview"
              className="file-thumbnail"
            />
          )}
          <div className="file-preview-details">
            <span>
              <strong>Selected:</strong> {file.name} (
              {Math.round(file.size / 1024)} KB)
            </span>
            <button
              type="button"
              className="remove-file-button"
              onClick={removeFile}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="composer-actions">
        <span className="composer-hint">
          {replyMode === "secure"
            ? "Secure mode encrypts the message before transport."
            : "Plain mode sends the message without encrypting it."}
        </span>
        <button
          onClick={() => void sendMessage()}
          disabled={
            busy ||
            !selectedConversation ||
            (!text && !imageUrl && !file) ||
            !selectedProviderStatus?.backendReady
          }
        >
          {replyMode === "secure"
            ? "Send secure message"
            : "Send plain message"}
        </button>
      </div>
    </div>
  );
}
