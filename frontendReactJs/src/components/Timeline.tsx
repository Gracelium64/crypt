import type { FC } from "react";
import { useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import { isSecureCiphertext } from "../lib/crypto";
import type { ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  privJwk: any | null;
  localOwnerId: string | null;
  deriveAesGcmKey: (privJwkObj: any, otherPubB64: string) => Promise<CryptoKey>;
};

const toHumanTime = (value: string) =>
  value ? new Date(value).toLocaleString() : "";

const Timeline: FC<Props> = ({
  messages,
  privJwk,
  localOwnerId,
  deriveAesGcmKey,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      {messages.length === 0 ? (
        <div className="empty-state timeline-empty">
          <p>No messages yet for this thread.</p>
          <p>Use the provider web client to start the chat, then reply here.</p>
        </div>
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
                    {(message.from || "?").charAt(0).toUpperCase()}
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
                                  if (!storedPriv)
                                    return alert(
                                      "No private key available to decrypt attachment",
                                    );

                                  const keyResp = await apiFetch(
                                    `/keys/${encodeURIComponent(ownerId)}`,
                                  );
                                  if (!keyResp.ok)
                                    return alert(
                                      "Could not fetch counterpart public key",
                                    );
                                  const kjson = await keyResp.json();
                                  const theirPub = kjson?.data?.publicKey;
                                  if (!theirPub)
                                    return alert(
                                      "Counterpart public key missing",
                                    );

                                  const res = await apiFetch(item.url);
                                  if (!res.ok)
                                    return alert(
                                      "Failed to download attachment",
                                    );
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
                                  window.open(urlObj, "_blank");
                                } catch (_err) {
                                  console.error(_err);
                                  alert("Failed to decrypt/open attachment");
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
                <span style={{ marginLeft: 12 }}>
                  Security: {secure ? "secure" : "plain"}
                </span>
              </div>
            </article>
          );
        })
      )}
      <div ref={bottomRef} />
    </>
  );
};

export default Timeline;
