import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import "../styles/components/timeline.css";
import { apiFetch } from "../lib/api";
import { isSecureCiphertext } from "../lib/crypto";
import type { EcdhPrivateJwk } from "../lib/crypto";
import type { ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  loading?: boolean;
  privJwk: EcdhPrivateJwk | null;
  localOwnerId: string | null;
  deriveAesGcmKey: (privJwkObj: EcdhPrivateJwk, otherPubB64: string) => Promise<CryptoKey>;
  counterpartName?: string | null;
};

const toHumanTime = (value: string) =>
  value ? new Date(value).toLocaleString() : "";

const Timeline: FC<Props> = ({
  messages,
  loading = false,
  privJwk,
  localOwnerId,
  deriveAesGcmKey,
  counterpartName,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      {messages.length === 0 ? (
        loading ? (
          <div className="empty-state timeline-loading">
            <span className="spinner spinner--lg" />
          </div>
        ) : (
          <div className="empty-state timeline-empty">
            <p>No messages yet for this thread.</p>
            <p>Use the provider web client to start the chat, then reply here.</p>
          </div>
        )
      ) : (
        messages.map((message) => {
          const content = message.bodyOmitted
            ? "(omitted for privacy)"
            : (message.decryptedText ?? message.encryptedText ?? "(empty)");
          const secure = isSecureCiphertext(message.encryptedText ?? "");

          return (
            <article
              key={message._id ?? message.id}
              className={`message-card ${message.direction}`}
            >
              <div className={`message-row ${message.direction}`}>
                {message.direction === "inbound" && (
                  <div className="avatar">
                    {(counterpartName || message.from || "?").charAt(0).toUpperCase()}
                  </div>
                )}

                <div className={`bubble ${message.direction}`}>
                  <div className="bubble-meta">
                    <div className="who">
                      {message.direction === "inbound" ? message.from : "You"}
                    </div>
                    <div className="time">{toHumanTime(message.createdAt)}</div>
                  </div>

                  <div className="bubble-content">{content}</div>

                  {message.attachments.length > 0 && (
                    <div className="attachment-grid">
                      {message.attachments.map((item) => {
                        const isEnc = item.url.includes("?crypt=1");
                        return isEnc ? (
                          <div key={item.url} className="encrypted-attachment">
                            <button
                              onClick={async () => {
                                try {
                                  const ownerId =
                                    message.direction === "inbound"
                                      ? message.from
                                      : message.to;
                                  const storedPriv =
                                    privJwk ??
                                    (localOwnerId
                                      ? JSON.parse(
                                          localStorage.getItem(
                                            `crypt:priv:${localOwnerId}`,
                                          ) || "null",
                                        )
                                      : null);
                                  if (!storedPriv) {
                                    setAttachError("No private key available to decrypt attachment");
                                    return;
                                  }

                                  const keyResp = await apiFetch(
                                    `/keys/${encodeURIComponent(ownerId)}`,
                                  );
                                  if (!keyResp.ok) {
                                    setAttachError("Could not fetch counterpart public key");
                                    return;
                                  }
                                  const kjson = await keyResp.json();
                                  const theirPub = kjson?.data?.publicKey;
                                  if (!theirPub) {
                                    setAttachError("Counterpart public key missing");
                                    return;
                                  }

                                  const res = await apiFetch(item.url);
                                  if (!res.ok) {
                                    setAttachError("Failed to download attachment");
                                    return;
                                  }
                                  const ab = await res.arrayBuffer();

                                  // decrypt binary attachment
                                  const arr = new Uint8Array(ab);
                                  const iv = arr.slice(0, 12);
                                  const cipher = arr.slice(12);
                                  const aesKey = await deriveAesGcmKey(
                                    storedPriv,
                                    theirPub,
                                  );
                                  const plain = await crypto.subtle.decrypt(
                                    { name: "AES-GCM", iv },
                                    aesKey,
                                    cipher.buffer ? cipher.buffer : cipher,
                                  );
                                  const plainArr = new Uint8Array(plain);
                                  const view = new DataView(plainArr.buffer);
                                  const headerLen = view.getUint32(0);
                                  const headerBytes = new Uint8Array(
                                    plainArr.buffer.slice(4, 4 + headerLen),
                                  );
                                  const headerStr = new TextDecoder().decode(
                                    headerBytes,
                                  );
                                  const meta = JSON.parse(headerStr);
                                  const fileBytes = new Uint8Array(
                                    plainArr.buffer.slice(4 + headerLen),
                                  );
                                  const blob = new Blob([fileBytes], {
                                    type:
                                      meta.contentType ||
                                      "application/octet-stream",
                                  });
                                  const urlObj = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = urlObj;
                                  a.download = meta.filename || "attachment";
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(urlObj);
                                } catch (_err) {
                                  console.error(_err);
                                  setAttachError("Failed to decrypt/open attachment");
                                }
                              }}
                            >
                              Open encrypted attachment
                            </button>
                          </div>
                        ) : (
                          <img key={item.url} src={item.url} alt="attachment" />
                        );
                      })}
                    </div>
                  )}
                </div>

                {message.direction === "outbound" && (
                  <div className="avatar you">Y</div>
                )}
              </div>

              <div className="message-foot">
                <span>Delivery: {message.deliveryStatus ?? "unknown"}</span>
                <span className={`message-security message-security--${secure ? "secure" : "plain"}`}>
                  Security: {secure ? "secure" : "plain"}
                </span>
              </div>
            </article>
          );
        })
      )}
      {attachError && (
        <div
          className="attach-error"
          onClick={() => setAttachError(null)}
          role="alert"
        >
          {attachError} ✕
        </div>
      )}
      <div ref={bottomRef} />
    </>
  );
};

export default Timeline;
