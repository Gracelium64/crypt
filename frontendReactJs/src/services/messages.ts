import { apiFetch, apiJson } from "../lib/api";
import { encryptFileForRecipient, encryptForRecipient } from "../lib/crypto";

type UploadOpts = {
  resourceType?: "image" | "raw" | "auto";
  encrypted?: boolean;
  filename?: string;
};

const uploadSelectedImage = async (
  fileOrBlob: File | Blob,
  opts?: UploadOpts,
  token?: string | null,
) => {
  const form = new FormData();
  const filename =
    opts?.filename ??
    (fileOrBlob instanceof File ? fileOrBlob.name : "upload.bin");
  form.append("file", fileOrBlob as Blob, filename);
  if (opts?.resourceType) form.append("resourceType", opts.resourceType);
  if (opts?.encrypted) form.append("encrypted", "1");

  const options: any = { method: "POST", body: form };
  if (token) options.headers = { Authorization: `Bearer ${token}` };

  const resp = await apiFetch("/uploads/formidable", options, token);
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "upload failed");
  return json.url as string;
};

export type SendMessageOptions = {
  provider: string;
  selectedChatId: string;
  conversationTarget: string;
  replyMode: "secure" | "plain";
  text: string;
  file?: File | null;
  imageUrl?: string;
  authToken?: string | null;
  privJwk?: any | null;
  localOwnerId?: string | null;
};

export const sendMessageService = async (opts: SendMessageOptions) => {
  const {
    provider,
    selectedChatId,
    conversationTarget,
    replyMode,
    text,
    file,
    imageUrl,
    authToken,
    privJwk,
    localOwnerId,
  } = opts;

  if (!selectedChatId) throw new Error("missing chat id");

  let finalImageUrl = imageUrl ?? "";

  const outboundMode = replyMode === "secure";

  // Ensure local private key present when secure
  let localPriv: any = privJwk ?? null;
  if (outboundMode && !localPriv && localOwnerId) {
    const stored = localStorage.getItem(`crypt:priv:${localOwnerId}`);
    if (stored) {
      try {
        localPriv = JSON.parse(stored);
      } catch (e) {
        // ignore
      }
    }
  }

  let recipientPubB64: string | null = null;
  if (outboundMode) {
    if (!localPriv) throw new Error("missing local private key");
    const keyResp = await apiFetch(
      `/keys/${encodeURIComponent(conversationTarget)}`,
    );
    if (!keyResp.ok) throw new Error("recipient key not found");
    const keyJson = await keyResp.json();
    recipientPubB64 = keyJson?.data?.publicKey;
    if (!recipientPubB64) throw new Error("recipient public missing");
  }

  // Handle attachments
  if (file) {
    if (outboundMode && recipientPubB64 && localPriv) {
      const { blob, filename } = await encryptFileForRecipient(
        file,
        localPriv,
        recipientPubB64,
      );
      finalImageUrl = await uploadSelectedImage(
        blob,
        { resourceType: "raw", encrypted: true, filename },
        authToken,
      );
    } else {
      try {
        finalImageUrl = await uploadSelectedImage(file, undefined, authToken);
      } catch (err) {
        // fallback to base64 proxy
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const proxyJson = await apiJson(
          "/uploads/base64",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl }),
          },
          authToken,
        );
        finalImageUrl = proxyJson.url;
      }
    }
  }

  const payload: any = {
    provider,
    from: `${provider}-web`,
    to: conversationTarget,
    chatId: selectedChatId,
    attachments: finalImageUrl ? [{ type: "image", url: finalImageUrl }] : [],
  };

  if (outboundMode && recipientPubB64 && localPriv) {
    const encrypted = await encryptForRecipient(
      text || "",
      localPriv,
      recipientPubB64,
    );
    payload.encryptedText = encrypted;
    payload.encrypt = true;
  } else {
    payload.text = text;
    payload.encrypt = false;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const resp = await apiJson(
    "/messages/send",
    { method: "POST", headers, body: JSON.stringify(payload) },
    authToken,
  );
  return resp;
};

export default sendMessageService;
